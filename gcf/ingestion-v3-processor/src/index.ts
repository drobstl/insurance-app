import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const REGION = 'us-central1';
const JOBS_COLLECTION = 'ingestionJobsV3';
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const MAX_AGENT_CONCURRENT = 3;
const DEFAULT_MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const ZOMBIE_TIMEOUT_MS = 5 * 60 * 1000;
const LARGE_PDF_THRESHOLD_BYTES = 5 * 1024 * 1024;
const SMALL_PDF_THRESHOLD_BYTES = 2 * 1024 * 1024;
const FAST_PATH_MAX_BYTES = 4 * 1024 * 1024;
const MIN_FAST_MODE_SIGNALS = 4;
const DOCUMENT_CLASSIFY_MAX_TOKENS = 450;

const GENERIC_APPLICATION_SYSTEM_PROMPT = `You are an expert insurance application document parser. You extract structured data from insurance application PDFs by examining the full document directly.

You are viewing a complete insurance application PDF. Use the visible form layout, labels, and filled-in values to extract the requested fields. Examine all pages including any addendum or supplemental pages.

ROLE DISAMBIGUATION:
- "Proposed Insured" / "Applicant" / "Insured" = the person whose life is being insured.
- "Owner" / "Policy Owner" = the person who owns the policy.
- "Primary Beneficiary" / "Contingent Beneficiary" = recipients of death benefit, not the insured.

FIELD RULES:
- insuredName: Proposed Insured/Applicant. Not beneficiary. Strip trailing X checkbox marks.
- policyOwner: policy owner name.
- beneficiaries: use actual person names; relationship label in relationship field.
- coverageAmount: face amount/death benefit as a number.
- premiumAmount: modal/planned/scheduled premium as a number.
- premiumFrequency: map to monthly/quarterly/semi-annual/annual.
- policyNumber: policy/application/certificate/case number (not SSN, DL, agent ID, or form ID).
- policyType: classify into IUL, Term Life, Whole Life, Mortgage Protection, Accidental, Other.
- insuranceCompany: carrier short/common name.
- insuredDateOfBirth/effectiveDate/applicationSignedDate: return YYYY-MM-DD only when clearly visible.

STRICT RULES:
- Never fabricate values.
- If a field is unknown, use null.
- Return strict JSON only.`;

const AMERICO_ICC18_5160_TEMPLATE_HINTS = `TEMPLATE HINTS (Americo ICC18 5160):
- Carrier should appear as Americo near the top header.
- Form family code is typically ICC18 5160 in header/footer.
- Product selection appears in Section 2, field 1. Product checkboxes can include CBO 100, CBO 50, Term 125, Term 100, and others.
- For MVP extraction priorities, focus on:
  1) Proposed insured demographics in Section 1.
  2) Product and financial fields in Section 2 (policy type, face amount, mode premium, premium mode/frequency, effective date).
  3) Beneficiary rows in Section 4 (name, primary/contingent, percentage).
  4) Signature-date line in Section 9 for applicationSignedDate when effectiveDate is missing.
- If a field is blank on a designated section, return null; do not infer.`;

const APPLICATION_DOCUMENT_CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    documentType: { type: 'string', enum: ['application', 'not_application', 'unknown'] },
    carrier: { type: 'string', enum: ['americo', 'other', 'unknown'] },
    formCode: { type: 'string' },
    americoProductVariant: {
      type: 'string',
      enum: ['term_125', 'term_100', 'cbo_100', 'cbo_50', 'continuation_25', 'continuation_10', 'payment_protector', 'other', 'unknown'],
    },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['documentType', 'carrier', 'americoProductVariant', 'confidence', 'reason'],
  additionalProperties: false,
} as const;

const APPLICATION_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    insuredName: { type: 'string' },
    insuredPhone: { type: 'string' },
    insuredEmail: { type: 'string' },
    insuredDateOfBirth: { type: 'string' },
    insuranceCompany: { type: 'string' },
    policyType: { type: 'string', enum: ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'] },
    policyNumber: { type: 'string' },
    policyOwner: { type: 'string' },
    insuredState: { type: 'string' },
    premiumFrequency: { type: 'string', enum: ['monthly', 'quarterly', 'semi-annual', 'annual'] },
    renewalDate: { type: 'string' },
    effectiveDate: { type: 'string' },
    applicationSignedDate: { type: 'string' },
    beneficiaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: 'string' },
          percentage: { type: 'number' },
          irrevocable: { type: 'boolean' },
          type: { type: 'string', enum: ['primary', 'contingent'] },
        },
        required: ['name', 'type'],
        additionalProperties: false,
      },
    },
    coverageAmount: { type: 'number' },
    premiumAmount: { type: 'number' },
    note: { type: 'string' },
  },
  required: ['note'],
  additionalProperties: false,
} as const;

const CORE_FALLBACK_SCHEMA = {
  type: 'object',
  properties: {
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string' },
    dateOfBirth: { type: 'string' },
    carrier: { type: 'string' },
    policyType: { type: 'string', enum: ['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other'] },
    coverageAmount: { type: 'number' },
    premiumAmount: { type: 'number' },
    extractionNote: { type: 'string' },
    pageCount: { type: 'number' },
  },
  required: ['extractionNote'],
  additionalProperties: false,
} as const;

type IngestionStatus = 'queued' | 'processing' | 'review_ready' | 'saved' | 'failed' | 'uploading';
type IngestionMode = 'application' | 'bob';

interface IngestionError {
  code: string;
  message: string;
  retryable: boolean;
  terminal: boolean;
}

interface ExtractedApplicationData {
  policyType: 'IUL' | 'Term Life' | 'Whole Life' | 'Mortgage Protection' | 'Accidental' | 'Other' | null;
  policyNumber: string | null;
  insuranceCompany: string | null;
  policyOwner: string | null;
  insuredName: string | null;
  beneficiaries: Array<{
    name: string;
    relationship?: string;
    percentage?: number;
    irrevocable?: boolean | null;
    type: 'primary' | 'contingent';
  }> | null;
  coverageAmount: number | null;
  premiumAmount: number | null;
  premiumFrequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | null;
  renewalDate: string | null;
  insuredEmail: string | null;
  insuredPhone: string | null;
  insuredDateOfBirth: string | null;
  insuredState: string | null;
  effectiveDate: string | null;
  applicationSignedDate: string | null;
}

type ApplicationDocumentType = 'application' | 'not_application' | 'unknown';
type CarrierClassifier = 'americo' | 'other' | 'unknown';
type AmericoProductVariant =
  | 'term_125'
  | 'term_100'
  | 'cbo_100'
  | 'cbo_50'
  | 'continuation_25'
  | 'continuation_10'
  | 'payment_protector'
  | 'other'
  | 'unknown';

interface ApplicationDocumentClassification {
  documentType: ApplicationDocumentType;
  carrier: CarrierClassifier;
  formCode: string | null;
  americoProductVariant: AmericoProductVariant;
  confidence: number | null;
  reason: string | null;
  templateId: 'americo_icc18_5160' | null;
}

interface LockedJob {
  jobId: string;
  mode: IngestionMode;
  gcsPath: string;
  fileName?: string;
  contentType?: string;
  attempts: number;
  maxAttempts: number;
  processingToken: string;
  agentId?: string;
}

export const processIngestionV3Queued = onDocumentWritten(
  {
    document: `${JOBS_COLLECTION}/{jobId}`,
    region: REGION,
    timeoutSeconds: 240,
    memory: '1GiB',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = after.data() as Record<string, unknown>;
    const beforeData = event.data?.before?.exists ? (event.data.before.data() as Record<string, unknown>) : null;
    const nextStatus = (afterData.status as IngestionStatus | undefined) || 'failed';
    const prevStatus = (beforeData?.status as IngestionStatus | undefined) || null;

    // Only process explicit transitions into queued, including first create.
    if (nextStatus !== 'queued') return;
    if (prevStatus === 'queued') return;

    const jobId = event.params.jobId;
    const lockResult = await lockQueuedJob(jobId);
    if (!lockResult.ok) {
      emit('ingestion_v3_process_skipped', {
        job_id: jobId,
        reason: lockResult.reason,
      });
      return;
    }

    const job = lockResult.job;
    try {
      const t0 = Date.now();
      const sourceStart = Date.now();
      const source = await downloadSource(job.gcsPath);
      const sourceFetchMs = Date.now() - sourceStart;

      let classification: ApplicationDocumentClassification | null = null;
      let classificationMs = 0;
      if (job.mode === 'application') {
        const classifyStart = Date.now();
        classification = await classifyApplicationDocument(source.buffer);
        classificationMs = Date.now() - classifyStart;

        if (classification.documentType === 'not_application') {
          const error: IngestionError = {
            code: 'DOCUMENT_NOT_APPLICATION',
            message: 'File was not recognized as an insurance application.',
            retryable: false,
            terminal: true,
          };
          await failJob(job, error);
          emit('ingestion_v3_parse_completed', {
            job_id: job.jobId,
            mode: job.mode,
            result_type: 'error',
            elapsed_ms: Date.now() - t0,
            classification_ms: classificationMs,
            detected_document_type: classification.documentType,
            detected_carrier: classification.carrier,
            detected_form_code: classification.formCode,
            classifier_confidence: classification.confidence,
          });
          return;
        }
      }

      const extractionStart = Date.now();
      const extraction = await extractWithFallback(job.mode, source.buffer, classification);
      const extractionMs = Date.now() - extractionStart;

      if (job.mode === 'application') {
        const gate = evaluateCompleteness(extraction.applicationData);
        const metrics = {
          totalMs: Date.now() - t0,
          sourceFetchMs,
          classificationMs,
          extractionMs,
          validationMs: 0,
          parserPath: extraction.usedFallback ? 'ai-text' : 'ai-pdf',
          coreFieldsTotal: gate.total,
          coreFieldsPresent: gate.present,
          coreCompletenessRatio: gate.ratio,
          fallbackTriggered: extraction.usedFallback,
          detectedDocumentType: classification?.documentType || 'unknown',
          detectedCarrier: classification?.carrier || 'unknown',
          detectedFormCode: classification?.formCode || null,
          detectedTemplateId: classification?.templateId || null,
          americoProductVariant: classification?.americoProductVariant || 'unknown',
        };

        if (gate.reviewReady) {
          await completeJob(job, {
            status: 'review_ready',
            result: {
              application: {
                data: extraction.applicationData,
                evidence: {},
                note: extraction.note,
              },
            },
            metrics,
          });
          emit('ingestion_v3_parse_completed', {
            job_id: job.jobId,
            mode: job.mode,
            result_type: gate.ratio >= 0.78 ? 'full' : 'partial',
            elapsed_ms: metrics.totalMs,
            fallback_triggered: extraction.usedFallback,
            core_fields_present: gate.present,
            core_fields_total: gate.total,
          });
          return;
        }

        await failJob(job, {
          code: 'VALIDATION_FAILED',
          message: `Completeness gate failed (${gate.present}/${gate.total} core fields; hasName=${gate.hasName}).`,
          retryable: false,
          terminal: true,
        });
        emit('ingestion_v3_parse_completed', {
          job_id: job.jobId,
          mode: job.mode,
          result_type: 'error',
          elapsed_ms: metrics.totalMs,
          fallback_triggered: extraction.usedFallback,
          core_fields_present: gate.present,
          core_fields_total: gate.total,
        });
        return;
      }

      // BOB extraction is intentionally pass-through in this phase.
      await completeJob(job, {
        status: 'review_ready',
        result: { bob: extraction.bobResult },
        metrics: {
          totalMs: Date.now() - t0,
          sourceFetchMs,
          extractionMs,
          validationMs: 0,
          parserPath: extraction.usedFallback ? 'ai-text' : 'ai-pdf',
          fallbackTriggered: extraction.usedFallback,
        },
      });
    } catch (error) {
      const classified = classifyError(error);
      if (classified.retryable && job.attempts < job.maxAttempts) {
        const delayMs = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        await requeueJob(job, classified, delayMs);
        emit('ingestion_v3_process_requeued', {
          job_id: job.jobId,
          mode: job.mode,
          attempts: job.attempts,
          max_attempts: job.maxAttempts,
          retry_after_ms: Date.now() + delayMs,
          error_code: classified.code,
        });
        return;
      }
      await failJob(job, {
        code: classified.retryable ? 'MAX_RETRIES_EXHAUSTED' : classified.code,
        message: classified.retryable ? 'Ingestion retry attempts were exhausted.' : classified.message,
        retryable: false,
        terminal: true,
      });
      emit('ingestion_v3_process_failed', {
        job_id: job.jobId,
        mode: job.mode,
        attempts: job.attempts,
        max_attempts: job.maxAttempts,
        error_code: classified.code,
        error_message: classified.message,
      });
    }
  },
);

export const cleanupIngestionV3Zombies = onSchedule(
  {
    region: REGION,
    schedule: 'every 5 minutes',
    timeoutSeconds: 240,
    secrets: [ANTHROPIC_API_KEY],
  },
  async () => {
    const db = getFirestore();
    const cutoff = Date.now() - ZOMBIE_TIMEOUT_MS;
    const snap = await db
      .collection(JOBS_COLLECTION)
      .where('status', '==', 'processing')
      .where('startedAt', '<=', Timestamp.fromMillis(cutoff))
      .limit(100)
      .get();

    if (snap.empty) return;
    const updates = snap.docs.map((doc) =>
      doc.ref.update({
        status: 'failed',
        error: {
          code: 'PROCESSING_TIMEOUT',
          message: 'Job exceeded processing timeout (5 minutes) and was marked failed.',
          retryable: false,
          terminal: true,
        },
        processingToken: FieldValue.delete(),
        retryAfter: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
      }),
    );
    await Promise.all(updates);
    emit('ingestion_v3_zombie_cleanup', { affected_jobs: snap.size });
  },
);

async function lockQueuedJob(jobId: string): Promise<{ ok: true; job: LockedJob } | { ok: false; reason: string }> {
  const db = getFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, reason: 'not_found' };
    const data = snap.data() as Record<string, unknown>;
    const status = (data.status as IngestionStatus | undefined) || 'failed';
    if (status !== 'queued') return { ok: false as const, reason: 'not_queued' };

    const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : null;
    if (retryAfter && Date.now() < retryAfter) return { ok: false as const, reason: 'retry_not_ready' };

    const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
    const maxAttempts = typeof data.maxAttempts === 'number' ? data.maxAttempts : DEFAULT_MAX_ATTEMPTS;
    if (attempts >= maxAttempts) return { ok: false as const, reason: 'max_attempts' };

    const agentId = typeof data.agentId === 'string' ? data.agentId : undefined;
    if (agentId) {
      const processing = await tx.get(
        db.collection(JOBS_COLLECTION).where('agentId', '==', agentId).where('status', '==', 'processing').limit(MAX_AGENT_CONCURRENT + 1),
      );
      const currentProcessing = processing.docs.filter((doc) => doc.id !== jobId).length;
      if (currentProcessing >= MAX_AGENT_CONCURRENT) {
        tx.update(ref, {
          status: 'queued',
          retryAfter: Date.now() + 10_000,
          error: {
            code: 'THROTTLED_AGENT_LIMIT',
            message: `Agent is already processing ${MAX_AGENT_CONCURRENT} jobs. Retrying shortly.`,
            retryable: true,
            terminal: false,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { ok: false as const, reason: 'agent_throttled' };
      }
    }

    const mode = data.mode === 'bob' ? 'bob' : 'application';
    const gcsPath = typeof data.gcsPath === 'string' ? data.gcsPath : '';
    if (!gcsPath) return { ok: false as const, reason: 'missing_gcs_path' };
    const processingToken = randomToken();
    tx.update(ref, {
      status: 'processing',
      attempts: attempts + 1,
      processingToken,
      retryAfter: FieldValue.delete(),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.delete(),
    });
    return {
      ok: true as const,
      job: {
        jobId,
        mode,
        gcsPath,
        fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
        contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
        attempts: attempts + 1,
        maxAttempts,
        processingToken,
        agentId,
      },
    };
  });
}

async function completeJob(
  job: LockedJob,
  payload: { status: 'review_ready' | 'saved'; result: Record<string, unknown>; metrics: Record<string, unknown> },
) {
  const db = getFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(job.jobId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.processingToken !== job.processingToken) return;
    tx.update(ref, {
      status: payload.status,
      result: payload.result,
      metrics: payload.metrics,
      processingToken: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function failJob(job: LockedJob, error: IngestionError) {
  const db = getFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(job.jobId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.processingToken !== job.processingToken) return;
    tx.update(ref, {
      status: 'failed',
      error,
      processingToken: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function requeueJob(job: LockedJob, error: IngestionError, delayMs: number) {
  const db = getFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(job.jobId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    if (data.processingToken !== job.processingToken) return;
    tx.update(ref, {
      status: 'queued',
      error,
      processingToken: FieldValue.delete(),
      retryAfter: Date.now() + delayMs,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.delete(),
    });
  });
}

async function downloadSource(gcsPath: string): Promise<{ buffer: Buffer }> {
  const bucket = getStorage().bucket();
  const file = bucket.file(gcsPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw {
      code: 'UPLOAD_NOT_FOUND',
      message: 'Uploaded source file does not exist in storage.',
      retryable: false,
      terminal: true,
    } satisfies IngestionError;
  }
  const [buffer] = await file.download();
  return { buffer };
}

async function extractWithFallback(
  mode: IngestionMode,
  fileBuffer: Buffer,
  classification?: ApplicationDocumentClassification | null,
): Promise<{ usedFallback: boolean; note?: string; applicationData: ExtractedApplicationData; bobResult?: Record<string, unknown> }> {
  if (mode === 'bob') {
    return {
      usedFallback: false,
      applicationData: emptyApplication(),
      bobResult: {
        rows: [],
        rowCount: 0,
        note: 'BOB extraction in GCF is not yet implemented. This path should remain on existing parser until parity.',
      },
    };
  }

  try {
    const first = await runPrimaryApplicationExtraction(fileBuffer, classification);
    return { usedFallback: false, note: first.note, applicationData: first.data };
  } catch (error) {
    const classified = classifyError(error);
    if (classified.code !== 'CLAUDE_SCHEMA_INVALID') throw error;
    const fallback = await runFallbackCoreExtraction(fileBuffer);
    return {
      usedFallback: true,
      note: fallback.note || 'Fallback extraction executed after schema-invalid response.',
      applicationData: fallback.data,
    };
  }
}

async function runPrimaryApplicationExtraction(
  fileBuffer: Buffer,
  classification?: ApplicationDocumentClassification | null,
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const fileSizeBytes = fileBuffer.length;
  const isLargePdf = fileSizeBytes >= LARGE_PDF_THRESHOLD_BYTES;
  const isFastPathPdf = fileSizeBytes <= FAST_PATH_MAX_BYTES;

  if (isLargePdf) {
    const fastResult = await runPrimaryExtractionAttempt(fileBuffer, 1200, classification);
    if (isFastPassAcceptable(fastResult.data)) {
      if (shouldRetryForSignatureDate(fastResult.data)) {
        const deep = await runPrimaryExtractionAttempt(fileBuffer, 2048, classification);
        return pickExtractionPreferringSignatureDate(fastResult, deep);
      }
      return fastResult;
    }
    return runPrimaryExtractionAttempt(fileBuffer, 2048, classification);
  }

  if (isFastPathPdf) {
    const isSmallPdf = fileSizeBytes <= SMALL_PDF_THRESHOLD_BYTES;
    const fastResult = await runPrimaryExtractionAttempt(fileBuffer, isSmallPdf ? 950 : 1100, classification);
    if (isFastPassAcceptable(fastResult.data)) {
      if (shouldRetryForSignatureDate(fastResult.data)) {
        const deep = await runPrimaryExtractionAttempt(fileBuffer, 1550, classification);
        return pickExtractionPreferringSignatureDate(fastResult, deep);
      }
      return fastResult;
    }
    return runPrimaryExtractionAttempt(fileBuffer, 1550, classification);
  }

  return runPrimaryExtractionAttempt(fileBuffer, 1700, classification);
}

async function runPrimaryExtractionAttempt(
  fileBuffer: Buffer,
  maxTokens: number,
  classification?: ApplicationDocumentClassification | null,
): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const anthropic = getAnthropicClient();
  const systemPrompt = buildPrimarySystemPrompt(classification);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    output_config: {
      format: {
        type: 'json_schema',
        schema: APPLICATION_EXTRACTION_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: fileBuffer.toString('base64'),
            },
          },
          { type: 'text', text: 'Return strict JSON only.' },
        ],
      },
    ],
  });
  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) throw new Error('No response received from AI.');
  const parsed = safeJsonParse(text);
  return {
    data: normalizeApplication(parsed),
    note: typeof parsed.note === 'string' ? parsed.note : undefined,
  };
}

async function runFallbackCoreExtraction(fileBuffer: Buffer): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system:
      'Extract only these core fields from this insurance application PDF and return strict JSON: firstName, lastName, phone, email, dateOfBirth, carrier, policyType, coverageAmount, premiumAmount, extractionNote, pageCount. Use null when unknown.',
    output_config: {
      format: {
        type: 'json_schema',
        schema: CORE_FALLBACK_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: fileBuffer.toString('base64'),
            },
          },
          { type: 'text', text: 'Return strict JSON only.' },
        ],
      },
    ],
  });

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) throw new Error('No response received from AI fallback.');
  const parsed = safeJsonParse(text);
  const firstName = toStringOrNull(parsed.firstName);
  const lastName = toStringOrNull(parsed.lastName);
  const insuredName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  return {
    data: {
      ...emptyApplication(),
      insuredName,
      insuredPhone: toStringOrNull(parsed.phone),
      insuredEmail: toStringOrNull(parsed.email),
      insuredDateOfBirth: toStringOrNull(parsed.dateOfBirth),
      insuranceCompany: toStringOrNull(parsed.carrier),
      policyType: toPolicyType(parsed.policyType),
      coverageAmount: toNumberOrNull(parsed.coverageAmount),
      premiumAmount: toNumberOrNull(parsed.premiumAmount),
    },
    note: toStringOrNull(parsed.extractionNote) || 'Fallback extraction completed.',
  };
}

async function classifyApplicationDocument(fileBuffer: Buffer): Promise<ApplicationDocumentClassification> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: DOCUMENT_CLASSIFY_MAX_TOKENS,
    system:
      `Classify whether this PDF is an insurance application and identify carrier/template hints.

You must inspect the PDF directly. For Americo:
- Carrier appears as "Americo" in the header.
- Form-family code may appear as "ICC18 5160" in header/footer.
- Product checkbox appears in Section 2, field 1 (for example Term 125, Term 100, CBO 100, CBO 50).

Return strict JSON only.
- documentType: "application", "not_application", or "unknown".
- carrier: "americo", "other", or "unknown".
- formCode: exact form code string if visible, else empty string.
- americoProductVariant: one of the schema enum values.
- confidence: number between 0 and 1.
- reason: short explanation.`,
    output_config: {
      format: {
        type: 'json_schema',
        schema: APPLICATION_DOCUMENT_CLASSIFICATION_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: fileBuffer.toString('base64'),
            },
          },
          { type: 'text', text: 'Return strict JSON only.' },
        ],
      },
    ],
  });

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) {
    return {
      documentType: 'unknown',
      carrier: 'unknown',
      formCode: null,
      americoProductVariant: 'unknown',
      confidence: null,
      reason: 'Classifier returned no text response.',
      templateId: null,
    };
  }

  const parsed = safeJsonParse(text);
  const documentType = toDocumentType(parsed.documentType);
  const carrier = toCarrierClassifier(parsed.carrier);
  const formCode = normalizeFormCode(toStringOrNull(parsed.formCode));
  const americoProductVariant = toAmericoProductVariant(parsed.americoProductVariant);
  const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
    ? Math.max(0, Math.min(1, parsed.confidence))
    : null;
  const reason = toStringOrNull(parsed.reason);

  const normalizedFormCode = formCode ? formCode.replace(/\s+/g, '').toUpperCase() : '';
  const isAmericoIcc18 = carrier === 'americo' && normalizedFormCode === 'ICC185160';

  return {
    documentType,
    carrier,
    formCode,
    americoProductVariant,
    confidence,
    reason,
    templateId: isAmericoIcc18 ? 'americo_icc18_5160' : null,
  };
}

function buildPrimarySystemPrompt(classification?: ApplicationDocumentClassification | null): string {
  const templateHints =
    classification?.templateId === 'americo_icc18_5160'
      ? `${AMERICO_ICC18_5160_TEMPLATE_HINTS}
Detected Americo product variant hint: ${classification.americoProductVariant}.`
      : '';
  return [GENERIC_APPLICATION_SYSTEM_PROMPT, templateHints].filter(Boolean).join('\n\n');
}

function evaluateCompleteness(data: ExtractedApplicationData) {
  const [firstName, ...rest] = (data.insuredName || '').trim().split(/\s+/);
  const lastName = rest.join(' ').trim();
  const values: Array<string | number | null | undefined> = [
    firstName,
    lastName,
    data.insuredPhone,
    data.insuredEmail,
    data.insuredDateOfBirth,
    data.insuranceCompany,
    data.policyType,
    data.coverageAmount,
    data.premiumAmount,
  ];
  const present = values.reduce<number>((acc, value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? acc + 1 : acc;
    if (typeof value === 'string') return value.trim() ? acc + 1 : acc;
    return value ? acc + 1 : acc;
  }, 0);
  const total = 9;
  const hasName = !!firstName || !!lastName;
  const ratio = present / total;
  return {
    present,
    total,
    ratio,
    hasName,
    reviewReady: hasName && present >= 4,
  };
}

function toDocumentType(value: unknown): ApplicationDocumentType {
  if (value === 'application' || value === 'not_application' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function toCarrierClassifier(value: unknown): CarrierClassifier {
  if (value === 'americo' || value === 'other' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function toAmericoProductVariant(value: unknown): AmericoProductVariant {
  if (
    value === 'term_125' ||
    value === 'term_100' ||
    value === 'cbo_100' ||
    value === 'cbo_50' ||
    value === 'continuation_25' ||
    value === 'continuation_10' ||
    value === 'payment_protector' ||
    value === 'other' ||
    value === 'unknown'
  ) {
    return value;
  }
  return 'unknown';
}

function classifyError(error: unknown): IngestionError {
  if (isIngestionError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('schema') && lower.includes('complex')) {
    return { code: 'CLAUDE_SCHEMA_INVALID', message, retryable: false, terminal: true };
  }
  if (lower.includes('parse') && lower.includes('json')) {
    return { code: 'CLAUDE_SCHEMA_INVALID', message, retryable: false, terminal: true };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('rate')) {
    return { code: 'CLAUDE_REQUEST_FAILED', message, retryable: true, terminal: false };
  }
  if (lower.includes('api key') || lower.includes('anthropic_api_key')) {
    return { code: 'CLAUDE_REQUEST_FAILED', message, retryable: false, terminal: true };
  }
  if (lower.includes('uploaded source file does not exist')) {
    return { code: 'UPLOAD_NOT_FOUND', message, retryable: false, terminal: true };
  }
  return { code: 'INTERNAL_ERROR', message, retryable: false, terminal: true };
}

function isIngestionError(value: unknown): value is IngestionError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean' &&
    typeof candidate.terminal === 'boolean'
  );
}

function randomToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getAnthropicClient(): Anthropic {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }
  return new Anthropic({ apiKey });
}

function safeJsonParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse AI response JSON.');
  }
}

function normalizeApplication(parsed: Record<string, unknown>): ExtractedApplicationData {
  return {
    policyType: toPolicyType(parsed.policyType),
    policyNumber: toStringOrNull(parsed.policyNumber),
    insuranceCompany: toStringOrNull(parsed.insuranceCompany),
    policyOwner: toStringOrNull(parsed.policyOwner),
    insuredName: toStringOrNull(parsed.insuredName),
    beneficiaries: parseBeneficiaries(parsed.beneficiaries),
    coverageAmount: toNumberOrNull(parsed.coverageAmount),
    premiumAmount: toNumberOrNull(parsed.premiumAmount),
    premiumFrequency: toFrequency(parsed.premiumFrequency),
    renewalDate: toStringOrNull(parsed.renewalDate),
    insuredEmail: toStringOrNull(parsed.insuredEmail),
    insuredPhone: toStringOrNull(parsed.insuredPhone),
    insuredDateOfBirth: toIsoDateStringOrNull(parsed.insuredDateOfBirth),
    insuredState: toStateAbbreviationOrNull(parsed.insuredState),
    effectiveDate: toIsoDateStringOrNull(parsed.effectiveDate),
    applicationSignedDate: toIsoDateStringOrNull(parsed.applicationSignedDate),
  };
}

function emptyApplication(): ExtractedApplicationData {
  return {
    policyType: null,
    policyNumber: null,
    insuranceCompany: null,
    policyOwner: null,
    insuredName: null,
    beneficiaries: null,
    coverageAmount: null,
    premiumAmount: null,
    premiumFrequency: null,
    renewalDate: null,
    insuredEmail: null,
    insuredPhone: null,
    insuredDateOfBirth: null,
    insuredState: null,
    effectiveDate: null,
    applicationSignedDate: null,
  };
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFormCode(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (compact === 'ICC185160') {
    return 'ICC18 5160';
  }
  return value.trim();
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,$]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPolicyType(value: unknown): ExtractedApplicationData['policyType'] {
  if (typeof value !== 'string') return null;
  const allowed = new Set(['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other']);
  return allowed.has(value) ? (value as ExtractedApplicationData['policyType']) : null;
}

function toFrequency(value: unknown): ExtractedApplicationData['premiumFrequency'] {
  if (typeof value !== 'string') return null;
  const allowed = new Set(['monthly', 'quarterly', 'semi-annual', 'annual']);
  return allowed.has(value) ? (value as ExtractedApplicationData['premiumFrequency']) : null;
}

function parseBeneficiaries(value: unknown): ExtractedApplicationData['beneficiaries'] {
  if (!Array.isArray(value) || value.length === 0) return null;
  const result: NonNullable<ExtractedApplicationData['beneficiaries']> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const name = toStringOrNull(raw.name);
    if (!name) continue;
    const type = raw.type === 'contingent' ? 'contingent' : 'primary';
    const relationship = toStringOrNull(raw.relationship) || undefined;
    const percentage = toNumberOrNull(raw.percentage) ?? undefined;
    const irrevocable = toBooleanOrNull(raw.irrevocable);
    result.push({
      name,
      type,
      relationship,
      percentage,
      irrevocable: irrevocable ?? undefined,
    });
  }
  return result.length > 0 ? result : null;
}

function countExtractionSignals(data: ExtractedApplicationData): number {
  let signals = 0;
  if (data.insuredName) signals++;
  if (data.policyType) signals++;
  if (data.policyNumber) signals++;
  if (data.insuranceCompany) signals++;
  if (data.coverageAmount != null) signals++;
  if (data.premiumAmount != null) signals++;
  return signals;
}

function isFastPassAcceptable(data: ExtractedApplicationData): boolean {
  const signals = countExtractionSignals(data);
  if (signals < MIN_FAST_MODE_SIGNALS) return false;
  const hasIdentity = !!data.insuredName;
  const hasPolicyAnchor = !!data.policyType || !!data.policyNumber || !!data.insuranceCompany;
  const hasFinancialAnchor = data.coverageAmount != null || data.premiumAmount != null;
  return hasIdentity && hasPolicyAnchor && hasFinancialAnchor;
}

function shouldRetryForSignatureDate(data: ExtractedApplicationData): boolean {
  if (data.applicationSignedDate) return false;
  return isFastPassAcceptable(data);
}

function pickExtractionPreferringSignatureDate(
  fast: { data: ExtractedApplicationData; note?: string },
  deep: { data: ExtractedApplicationData; note?: string },
): { data: ExtractedApplicationData; note?: string } {
  if (deep.data.applicationSignedDate) {
    const note = [fast.note, deep.note].filter(Boolean).join(' ').trim();
    return {
      data: { ...fast.data, applicationSignedDate: deep.data.applicationSignedDate },
      note: note || undefined,
    };
  }
  return fast;
}

function toIsoDateStringOrNull(value: unknown): string | null {
  const str = toStringOrNull(value);
  if (!str) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const timestamp = Date.parse(`${str}T12:00:00.000Z`);
  return Number.isNaN(timestamp) ? null : str;
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function toStateAbbreviationOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const state = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

function emit(event: string, payload: Record<string, unknown>) {
  console.log('[ingestion-v3-gcf]', JSON.stringify({ event, ts: new Date().toISOString(), ...payload }));
}
