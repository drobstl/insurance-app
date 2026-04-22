import Anthropic from '@anthropic-ai/sdk';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as XLSX from 'xlsx';
import { CARRIER_PROMPT_SUPPLEMENTS } from './carrier-prompt-supplements';

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });

const REGION = 'us-central1';
const JOBS_COLLECTION = 'ingestionJobsV3';
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const ZOMBIE_TIMEOUT_MS = 5 * 60 * 1000;
const ZOMBIE_SCAN_LIMIT = 200;
const STALE_BATCH_TIMEOUT_MS = 15 * 60 * 1000;
const STALE_BATCH_SCAN_LIMIT = 100;

// Code-side deterministic overrides for fields that the agent-selected
// carrierFormType makes authoritative (policyType, insuranceCompany). Applied
// after Claude extraction; bypasses any misclassification. Supplement prompts
// still enforce the same values as a secondary signal (belt + suspenders).
// Add a row here when a new mapped form type has a known carrier and product.
const CARRIER_FORM_TYPE_OVERRIDES: Record<
  string,
  {
    policyType?: NonNullable<ExtractedApplicationData['policyType']>;
    insuranceCompany?: string;
  }
> = {
  americo_icc18_5160: { policyType: 'Term Life', insuranceCompany: 'Americo' },
  amam_icc15_aa9466: { policyType: 'Mortgage Protection', insuranceCompany: 'American-Amicable' },
  amam_icc18_aa3487: { policyType: 'Term Life', insuranceCompany: 'American-Amicable' },
  foresters_icc15_770825: { policyType: 'Term Life', insuranceCompany: 'Foresters' },
  uhl_icc22_200_878a: { policyType: 'Term Life', insuranceCompany: 'United Home Life' },
  transamerica_icc22_t_ap_wl11ic_0822: { policyType: 'Whole Life', insuranceCompany: 'Transamerica' },
  corebridge_aig_icc15_108847: { policyType: 'Whole Life', insuranceCompany: 'Corebridge/AIG' },
  sbli_policy_packet: { insuranceCompany: 'SBLI' },
  fg_iul: { insuranceCompany: 'Fidelity & Guaranty Life' },
  // F&G ICC18-1000 and LAPP1125 can represent multiple product variants; lock carrier only.
  fg_icc18_1000: { insuranceCompany: 'Fidelity & Guaranty Life' },
  fg_lapp1125: { insuranceCompany: 'Fidelity & Guaranty Life' },
  // ICC22L683A covers BOTH Term Life Express and IUL Express on the same form; do NOT
  // override policyType here - the prompt supplement derives it from the checked plan box.
  moo_icc22_l683a: { insuranceCompany: 'Mutual of Omaha' },
  // ICC23L681A (Living Promise) covers Level Benefit and Graded Benefit, both Whole Life.
  moo_icc23_l681a: { policyType: 'Whole Life', insuranceCompany: 'Mutual of Omaha' },
  // MA5981 is the standalone Mutual of Omaha Accidental Death Insurance application.
  moo_ma5981: { policyType: 'Accidental', insuranceCompany: 'Mutual of Omaha' },
  // ICC17-LIA is the shared Banner Life / LGA application form (BeyondTerm under Banner
  // branding, Quility Term Plus under LGA branding). Both are issued by Banner Life
  // Insurance Company and are Term Life products.
  banner_lga_icc17_lia: { policyType: 'Term Life', insuranceCompany: 'Banner Life' },
};

const GENERIC_APPLICATION_SYSTEM_PROMPT = `You are an expert insurance application document parser.

You are viewing pages extracted from an insurance application. Extract data from all visible pages. Use the visible form layout, labels, and filled-in values to extract the requested fields.

ROLE DISAMBIGUATION:
- "Proposed Insured" / "Applicant" / "Insured" = the person whose life is being insured.
- "Owner" / "Policy Owner" = the person who owns the policy.
- "Primary Beneficiary" / "Contingent Beneficiary" = recipients of death benefit, not the insured.

FIELD RULES:
- insuredName: Proposed Insured/Applicant. Not beneficiary. Strip trailing X checkbox marks.
- insuredPhone: phone number of the proposed insured/applicant.
- insuredEmail: email address of the proposed insured/applicant.
- insuredState: state of residence of the proposed insured. Extract from mailing address or signing state.
- renewalDate: renewal or expiration date of the policy term, if visible.
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

const BOB_SYSTEM_PROMPT = `You are an expert insurance data parser. Extract structured client and policy data from Book of Business reports.

These files may be CSV/TSV, spreadsheet exports, or PDF reports. Never fabricate values.

For each row extract:
- name (insured)
- owner (policy owner, empty when same as insured)
- email
- phone
- dateOfBirth
- policyNumber
- carrier
- policyType (Term Life | Whole Life | IUL | Accidental | Mortgage Protection | Other)
- effectiveDate
- premium (monthly amount as number-like string)
- coverageAmount
- status (Active | Pending | Lapsed)
- premiumFrequency (monthly | quarterly | semi-annual | annual)

Return strict JSON with:
- rowCount
- note
- rows (array of objects)`;

const BOB_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    rowCount: { type: 'number' },
    note: { type: 'string' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          owner: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          dateOfBirth: { type: 'string' },
          policyNumber: { type: 'string' },
          carrier: { type: 'string' },
          policyType: {
            type: 'string',
            enum: ['Term Life', 'Whole Life', 'IUL', 'Accidental', 'Mortgage Protection', 'Other'],
          },
          effectiveDate: { type: 'string' },
          premium: { type: 'string' },
          coverageAmount: { type: 'string' },
          status: { type: 'string' },
          premiumFrequency: {
            type: 'string',
            enum: ['monthly', 'quarterly', 'semi-annual', 'annual'],
          },
        },
        required: [
          'name', 'owner', 'email', 'phone', 'dateOfBirth',
          'policyNumber', 'carrier', 'policyType', 'effectiveDate',
          'premium', 'coverageAmount', 'status', 'premiumFrequency',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['rowCount', 'note', 'rows'],
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

interface LockedJob {
  jobId: string;
  mode: IngestionMode;
  gcsPath?: string;
  gcsImagePaths: string[];
  fileName?: string;
  contentType?: string;
  attempts: number;
  processingToken: string;
  agentId?: string;
  batchId?: string;
  carrierFormType: string;
}

interface BobRawRow {
  name: string;
  owner: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyNumber: string;
  carrier: string;
  policyType: string;
  effectiveDate: string;
  premium: string;
  coverageAmount: string;
  status: string;
  premiumFrequency: string;
}

interface BobStructuredResult {
  rows: Array<{
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    dateOfBirth: string | null;
    policyType: string | null;
    policyNumber: string | null;
    carrier: string | null;
    premiumAmount: number | null;
    coverageAmount: number | null;
  }>;
  rowCount: number;
  note?: string;
}

export const processIngestionV3Queued = onDocumentCreated(
  {
    document: `${JOBS_COLLECTION}/{jobId}`,
    region: REGION,
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    emit('diag', { stage: 'function_start', at: Date.now() });
    const snap = event.data;
    if (!snap?.exists) return;
    const createdData = snap.data() as Record<string, unknown>;
    const createdStatus = (createdData.status as IngestionStatus | undefined) || 'failed';
    if (createdStatus !== 'queued') return;

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
    emit('diag', { stage: 'job_locked', at: Date.now() });
    try {
      const t0 = Date.now();
      if (job.mode !== 'application') {
        const sourceStart = Date.now();
        if (!job.gcsPath) {
          throw {
            code: 'UPLOAD_NOT_FOUND',
            message: 'Uploaded BOB source path is missing.',
            retryable: false,
            terminal: true,
          } satisfies IngestionError;
        }
        const downloaded = await downloadSource(job.gcsPath);
        const sourceFetchMs = Date.now() - sourceStart;
        const extractionStart = Date.now();
        const bob = await extractBobResult({
          fileBuffer: downloaded.buffer,
          fileName: job.fileName,
          contentType: job.contentType,
        });
        const extractionMs = Date.now() - extractionStart;
        await completeJob(job, {
          status: 'review_ready',
          result: {
            bob: bob.result,
          },
          metrics: {
            totalMs: Date.now() - t0,
            sourceFetchMs,
            extractionMs,
            validationMs: 0,
            parserPath: bob.parserPath,
          },
        });
        emit('ingestion_v3_parse_completed', {
          job_id: job.jobId,
          mode: job.mode,
          result_type: bob.result.rows.length > 0 ? 'full' : 'partial',
          elapsed_ms: Date.now() - t0,
          row_count: bob.result.rows.length,
          parser_path: bob.parserPath,
        });
        return;
      }

      const sourceStart = Date.now();
      emit('diag', { stage: 'downloading_images_start', at: Date.now() });
      const imageBuffers = await downloadImageSources(job.gcsImagePaths);
      const sourceFetchMs = Date.now() - sourceStart;
      const extractionStart = Date.now();
      const extraction = await runApplicationExtraction(imageBuffers, job.carrierFormType);
      const extractionMs = Date.now() - extractionStart;

      // Carrier-specific deterministic overrides driven by CARRIER_FORM_TYPE_OVERRIDES.
      // The agent-selected carrierFormType is authoritative for the listed fields;
      // bypass Claude classification.
      const override = CARRIER_FORM_TYPE_OVERRIDES[job.carrierFormType];
      if (override) {
        const applied: string[] = [];
        if (override.policyType) {
          extraction.data.policyType = override.policyType;
          applied.push('policyType');
        }
        if (override.insuranceCompany) {
          extraction.data.insuranceCompany = override.insuranceCompany;
          applied.push('insuranceCompany');
        }
        if (applied.length) {
          emit('diag', {
            stage: 'carrier_form_field_override',
            at: Date.now(),
            carrier_form_type: job.carrierFormType,
            fields: applied.join(','),
          });
        }
      }

      const gate = evaluateCompleteness(extraction.data);
      const metrics = {
        totalMs: Date.now() - t0,
        sourceFetchMs,
        extractionMs,
        validationMs: 0,
        parserPath: 'ai-image',
        coreFieldsTotal: gate.total,
        coreFieldsPresent: gate.present,
        coreCompletenessRatio: gate.ratio,
      };

      if (gate.reviewReady) {
        await completeJob(job, {
          status: 'review_ready',
          result: {
            application: {
              data: extraction.data,
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
        core_fields_present: gate.present,
        core_fields_total: gate.total,
      });
    } catch (error) {
      const classified = classifyError(error);
      await failJob(job, classified);
      emit('ingestion_v3_process_failed', {
        job_id: job.jobId,
        mode: job.mode,
        attempts: job.attempts,
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
  },
  async () => {
    const db = getFirestore();
    const cutoffMs = Date.now() - ZOMBIE_TIMEOUT_MS;
    const snap = await db
      .collection(JOBS_COLLECTION)
      .where('status', '==', 'processing')
      .limit(ZOMBIE_SCAN_LIMIT)
      .get();

    if (snap.empty) return;

    const staleDocs = snap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const startedAtMs = toMillisOrNull(data.startedAt);
      // If startedAt is missing/malformed, do not force-fail the job.
      return startedAtMs != null && startedAtMs <= cutoffMs;
    });

    if (!staleDocs.length) {
      emit('ingestion_v3_zombie_cleanup', {
        scanned_jobs: snap.size,
        affected_jobs: 0,
      });
      return;
    }

    await Promise.all(
      staleDocs.map((doc) =>
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
      ),
    );

    emit('ingestion_v3_zombie_cleanup', {
      scanned_jobs: snap.size,
      affected_jobs: staleDocs.length,
    });
  },
);

export const reconcileStaleBatchJobs = onSchedule(
  {
    region: REGION,
    schedule: 'every 5 minutes',
    timeoutSeconds: 240,
    memory: '512MiB',
  },
  async () => {
    try {
      const db = getFirestore();
      const cutoffMs = Date.now() - STALE_BATCH_TIMEOUT_MS;
      // Avoid collectionGroup index dependencies by scanning per-agent subcollections.
      const agentSnap = await db.collection('agents').limit(STALE_BATCH_SCAN_LIMIT).get();
      if (agentSnap.empty) {
        emit('ingestion_v3_stale_batch_reconcile', {
          scanned_agents: 0,
          scanned_batches: 0,
          stale_candidates: 0,
          reconciled_batches: 0,
          agent_scan_limit: STALE_BATCH_SCAN_LIMIT,
          per_agent_batch_scan_limit: STALE_BATCH_SCAN_LIMIT,
          agent_scan_limit_hit: false,
          per_agent_batch_scan_limit_hit_count: 0,
        });
        return;
      }

      const scannedAgents = agentSnap.size;
      const agentScanLimitHit = scannedAgents >= STALE_BATCH_SCAN_LIMIT;
      let scanned = 0;
      let staleCandidates = 0;
      let reconciled = 0;
      let perAgentBatchScanLimitHitCount = 0;

      for (const agentDoc of agentSnap.docs) {
        const batchSnap = await agentDoc.ref
          .collection('batchJobs')
          .limit(STALE_BATCH_SCAN_LIMIT)
          .get();
        if (batchSnap.size >= STALE_BATCH_SCAN_LIMIT) {
          perAgentBatchScanLimitHitCount += 1;
        }

        for (const doc of batchSnap.docs) {
          scanned += 1;
          const data = doc.data() as Record<string, unknown>;
          const status = (data.status as string | undefined) || 'processing';
          if (status !== 'processing') {
            continue;
          }
          const updatedAtMs = toMillisOrNull(data.updatedAt) ?? toMillisOrNull(data.createdAt);
          if (updatedAtMs == null || updatedAtMs > cutoffMs) {
            continue;
          }
          staleCandidates += 1;

          const didReconcile = await reconcileBatchDocFromJobs(doc.ref.path);
          if (didReconcile) {
            reconciled += 1;
          }
        }
      }

      const metrics = {
        scanned_agents: scannedAgents,
        scanned_batches: scanned,
        stale_candidates: staleCandidates,
        reconciled_batches: reconciled,
        agent_scan_limit: STALE_BATCH_SCAN_LIMIT,
        per_agent_batch_scan_limit: STALE_BATCH_SCAN_LIMIT,
        agent_scan_limit_hit: agentScanLimitHit,
        per_agent_batch_scan_limit_hit_count: perAgentBatchScanLimitHitCount,
      };
      emit('ingestion_v3_stale_batch_reconcile', metrics);

      if (agentScanLimitHit || perAgentBatchScanLimitHitCount > 0) {
        emit('ingestion_v3_stale_batch_reconcile_limit_hit', metrics);
      }

      try {
        await persistStaleBatchReconcileMetrics(metrics);
      } catch (error) {
        emit('ingestion_v3_stale_batch_reconcile_metrics_persist_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      if (isFirestoreFailedPreconditionError(error)) {
        emit('ingestion_v3_stale_batch_reconcile_failed_precondition', {
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      throw error;
    }
  },
);

async function persistStaleBatchReconcileMetrics(metrics: {
  scanned_agents: number;
  scanned_batches: number;
  stale_candidates: number;
  reconciled_batches: number;
  agent_scan_limit: number;
  per_agent_batch_scan_limit: number;
  agent_scan_limit_hit: boolean;
  per_agent_batch_scan_limit_hit_count: number;
}) {
  const db = getFirestore();
  const metricsRef = db.collection('systemMetrics').doc('ingestionV3');
  await metricsRef.set(
    {
      staleBatchReconcile: {
        ...metrics,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
  await metricsRef.collection('staleBatchReconcileRuns').add({
    ...metrics,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function lockQueuedJob(jobId: string): Promise<{ ok: true; job: LockedJob } | { ok: false; reason: string }> {
  const db = getFirestore();
  const ref = db.collection(JOBS_COLLECTION).doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, reason: 'not_found' };
    const data = snap.data() as Record<string, unknown>;
    const status = (data.status as IngestionStatus | undefined) || 'failed';
    if (status !== 'queued') return { ok: false as const, reason: 'not_queued' };

    const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
    const agentId = typeof data.agentId === 'string' ? data.agentId : undefined;
    const mode = data.mode === 'bob' ? 'bob' : 'application';
    const gcsPath = typeof data.gcsPath === 'string' ? data.gcsPath : undefined;
    const gcsImagePaths = toStringArray(data.gcsImagePaths);
    const batchId = typeof data.batchId === 'string' ? data.batchId : undefined;
    if (mode === 'application' && !gcsImagePaths.length) return { ok: false as const, reason: 'missing_gcs_image_paths' };
    if (mode === 'bob' && !gcsPath) return { ok: false as const, reason: 'missing_gcs_path' };
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
        gcsImagePaths,
        fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
        contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
        attempts: attempts + 1,
        processingToken,
        agentId,
        batchId,
        carrierFormType:
          typeof data.carrierFormType === 'string' && data.carrierFormType.trim()
            ? data.carrierFormType.trim()
            : 'unknown',
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
  await reportToBatchDoc(job, {
    status: 'succeeded',
    loadedRows: getLoadedRowsFromResult(payload.result),
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
  await reportToBatchDoc(job, {
    status: 'failed',
    error,
  });
}

async function reportToBatchDoc(
  job: LockedJob,
  update: { status: 'succeeded'; loadedRows: number } | { status: 'failed'; error: IngestionError },
) {
  if (!job.agentId || !job.batchId) return;
  const db = getFirestore();
  const ref = db.collection('agents').doc(job.agentId).collection('batchJobs').doc(job.batchId);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data() as Record<string, unknown>;
      const batchStatus = (data.status as string | undefined) || 'processing';
      if (batchStatus === 'cancelled') return;

      const files = (data.files || {}) as Record<string, Record<string, unknown>>;
      const existing = files[job.jobId];
      if (!existing) return;

      const prevStatus = (existing.status as string | undefined) || 'queued';
      if (prevStatus === 'succeeded' || prevStatus === 'failed') return;

      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        [`files.${job.jobId}.status`]: update.status,
      };
      if (update.status === 'succeeded') {
        patch.completedFiles = FieldValue.increment(1);
        if (update.loadedRows > 0) {
          patch[`files.${job.jobId}.loadedRows`] = update.loadedRows;
          patch.totalRows = FieldValue.increment(update.loadedRows);
        }
      } else {
        patch.failedFiles = FieldValue.increment(1);
        patch[`files.${job.jobId}.error`] = update.error.message;
        patch[`files.${job.jobId}.retryable`] = false;
      }
      tx.update(ref, patch);
    });
  } catch (error) {
    emit('ingestion_v3_batch_report_failed', {
      job_id: job.jobId,
      batch_id: job.batchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  await finalizeBatchIfComplete(job.agentId, job.batchId);
}

async function finalizeBatchIfComplete(agentId: string, batchId: string) {
  const db = getFirestore();
  const ref = db.collection('agents').doc(agentId).collection('batchJobs').doc(batchId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const data = snap.data() as Record<string, unknown>;
      const currentStatus = (data.status as string | undefined) || 'processing';
      if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'partial' || currentStatus === 'failed') {
        return;
      }

      const totalFiles = typeof data.totalFiles === 'number' ? data.totalFiles : 0;
      const completedFiles = typeof data.completedFiles === 'number' ? data.completedFiles : 0;
      const failedFiles = typeof data.failedFiles === 'number' ? data.failedFiles : 0;
      const accounted = completedFiles + failedFiles;
      if (totalFiles <= 0 || accounted < totalFiles) return;

      tx.update(ref, {
        status: failedFiles > 0 ? 'partial' : 'completed',
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    emit('ingestion_v3_batch_finalize_failed', {
      batch_id: batchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function reconcileBatchDocFromJobs(batchDocPath: string): Promise<boolean> {
  const db = getFirestore();
  const ref = db.doc(batchDocPath);

  const snap = await ref.get();
  if (!snap.exists) return false;

  const data = snap.data() as Record<string, unknown>;
  const currentStatus = (data.status as string | undefined) || 'processing';
  if (currentStatus !== 'processing') return false;

  const files = (data.files || {}) as Record<string, Record<string, unknown>>;
  const jobIds = Object.keys(files);
  if (!jobIds.length) return false;

  const jobRefs = jobIds.map((jobId) => db.collection(JOBS_COLLECTION).doc(jobId));
  const jobSnaps = await db.getAll(...jobRefs);

  let completedFiles = 0;
  let failedFiles = 0;
  let totalRows = 0;
  const nextFiles: Record<string, Record<string, unknown>> = {};

  for (let i = 0; i < jobIds.length; i += 1) {
    const jobId = jobIds[i];
    const existing = files[jobId] || {};
    const jobSnap = jobSnaps[i];
    const jobData = jobSnap.exists ? (jobSnap.data() as Record<string, unknown>) : null;
    const jobStatus = ((jobData?.status as string | undefined) || '').toLowerCase();

    if (jobStatus === 'review_ready' || jobStatus === 'saved') {
      const loadedRows = getLoadedRowsFromResult((jobData?.result as Record<string, unknown>) || {});
      nextFiles[jobId] = {
        ...existing,
        status: 'succeeded',
        loadedRows,
        error: null,
        retryable: false,
      };
      completedFiles += 1;
      totalRows += loadedRows;
      continue;
    }

    let failureMessage = 'Ingestion job did not reach a terminal success state.';
    if (!jobSnap.exists) {
      failureMessage = 'Ingestion job document is missing.';
    } else if (jobStatus === 'failed') {
      const err = (jobData?.error as Record<string, unknown> | undefined) || {};
      failureMessage = typeof err.message === 'string' && err.message.trim()
        ? err.message
        : 'Ingestion job failed.';
    } else if (jobStatus === 'queued' || jobStatus === 'processing' || jobStatus === 'uploading') {
      failureMessage = 'Ingestion job exceeded batch processing timeout.';
    }

    nextFiles[jobId] = {
      ...existing,
      status: 'failed',
      loadedRows: 0,
      error: failureMessage,
      retryable: false,
    };
    failedFiles += 1;
  }

  const finalStatus = failedFiles > 0 ? 'partial' : 'completed';
  await ref.update({
    files: nextFiles,
    completedFiles,
    failedFiles,
    totalRows,
    status: finalStatus,
    updatedAt: FieldValue.serverTimestamp(),
    completedAt: FieldValue.serverTimestamp(),
  });

  emit('ingestion_v3_stale_batch_reconciled', {
    batch_path: batchDocPath,
    status: finalStatus,
    total_files: jobIds.length,
    completed_files: completedFiles,
    failed_files: failedFiles,
    total_rows: totalRows,
  });

  return true;
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

async function downloadImageSources(gcsImagePaths: string[]): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (let index = 0; index < gcsImagePaths.length; index += 1) {
    const gcsPath = gcsImagePaths[index];
    const { buffer } = await downloadSource(gcsPath);
    emit('diag', { stage: 'downloaded_image', index, bytes: buffer.byteLength, at: Date.now() });
    buffers.push(buffer);
  }
  return buffers;
}

async function extractBobResult(input: {
  fileBuffer: Buffer;
  fileName?: string;
  contentType?: string;
}): Promise<{ result: BobStructuredResult; parserPath: 'deterministic' | 'ai-text' | 'ai-pdf' | 'csv-parser' }> {
  const fileName = (input.fileName || '').toLowerCase();
  const contentType = (input.contentType || '').toLowerCase();
  const isPdf = fileName.endsWith('.pdf') || contentType.includes('application/pdf');

  if (isPdf) {
    const parsed = await extractBobFromPdfBuffer(input.fileBuffer);
    return {
      result: normalizeBobResult(parsed),
      parserPath: 'ai-pdf',
    };
  }

  const { text, parserPath } = toBobTextSource(input.fileBuffer, fileName, contentType);
  const deterministic = parseBobDeterministically(text, input.fileName || 'upload.csv');
  if (deterministic.rows.length > 0 && deterministic.confidence === 'high') {
    return {
      result: normalizeBobResult({
        rowCount: deterministic.rows.length,
        rows: deterministic.rows,
        note: deterministic.note,
      }),
      parserPath,
    };
  }

  const aiParsed = await extractBobFromTextSource(text);
  return {
    result: normalizeBobResult(aiParsed),
    parserPath: 'ai-text',
  };
}

function toBobTextSource(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): { text: string; parserPath: 'deterministic' | 'csv-parser' } {
  const isSpreadsheet =
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    contentType.includes('spreadsheetml') ||
    contentType.includes('application/vnd.ms-excel');
  if (isSpreadsheet) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw {
        code: 'SOURCE_UNSUPPORTED_TYPE',
        message: 'Spreadsheet does not contain any sheets.',
        retryable: false,
        terminal: true,
      } satisfies IngestionError;
    }
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
    if (!csv.trim()) {
      throw {
        code: 'SOURCE_FETCH_FAILED',
        message: 'Spreadsheet source is empty.',
        retryable: false,
        terminal: true,
      } satisfies IngestionError;
    }
    return { text: csv, parserPath: 'csv-parser' };
  }

  const text = new TextDecoder().decode(buffer);
  if (!text.trim()) {
    throw {
      code: 'SOURCE_FETCH_FAILED',
      message: 'Text source is empty.',
      retryable: false,
      terminal: true,
    } satisfies IngestionError;
  }
  return { text, parserPath: 'deterministic' };
}

function parseBobDeterministically(
  text: string,
  fileName: string,
): { rows: BobRawRow[]; confidence: 'high' | 'low'; note?: string } {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], confidence: 'low', note: `${fileName}: no data rows.` };
  }
  const tabCols = lines[0].split('\t').length;
  const commaCols = lines[0].split(',').length;
  const delimiter = tabCols > commaCols ? '\t' : ',';

  const headers = parseCsvLine(lines[0], delimiter).map((h) => normalizeHeader(h));
  const claimed = new Set<number>();
  const match = (aliases: string[]) => {
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const alias of sorted) {
      const idx = headers.findIndex((header, i) => !claimed.has(i) && header === alias);
      if (idx !== -1) {
        claimed.add(idx);
        return idx;
      }
    }
    for (const alias of sorted) {
      const idx = headers.findIndex((header, i) => !claimed.has(i) && header.includes(alias));
      if (idx !== -1) {
        claimed.add(idx);
        return idx;
      }
    }
    return -1;
  };

  const nameIdx = match(['insured nme', 'insured name', 'full name', 'client name', 'name', 'applicant', 'policy holder', 'insured']);
  if (nameIdx === -1) {
    return { rows: [], confidence: 'low', note: `${fileName}: no name column detected.` };
  }
  const ownerIdx = match(['owner nme', 'owner name', 'policy owner', 'owner']);
  const emailIdx = match(['insured email address', 'email address', 'insured email', 'email', 'e-mail']);
  const phoneIdx = match(['insured party phone', 'insured phone', 'phone number', 'phone', 'mobile', 'cell']);
  const dobIdx = match(['insured dob', 'date of birth', 'birth date', 'dob']);
  const policyNumIdx = match(['policy number', 'policy no', 'policy num', 'certificate number']);
  const carrierIdx = match(['carrier name', 'carrier', 'insurance company', 'company name', 'insurer']);
  const policyTypeIdx = match(['product type', 'policy type', 'product', 'line of business']);
  const effectiveDateIdx = match(['policy effective dte', 'policy issue dte', 'effective date', 'issue date', 'policy date']);
  const premiumIdx = match(['monthly premium', 'premium amount', 'premium', 'modal premium']);
  const annualPremiumIdx = match(['annual premium']);
  const coverageIdx = match(['face amt', 'face amount', 'coverage amount', 'death benefit', 'coverage']);
  const statusIdx = match(['policy status nme', 'policy status', 'status']);
  const billModeIdx = match(['bill mode', 'billing mode', 'payment mode', 'payment frequency']);

  const rows: BobRawRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i], delimiter);
    const name = cols[nameIdx] || '';
    if (!name.trim()) continue;

    let premium = premiumIdx !== -1 ? (cols[premiumIdx] || '') : '';
    if (!premium && annualPremiumIdx !== -1) {
      const annual = parseFloat((cols[annualPremiumIdx] || '0').replace(/[,$]/g, ''));
      if (!Number.isNaN(annual) && annual > 0) {
        premium = (annual / 12).toFixed(2);
      }
    }
    const billMode = billModeIdx !== -1 ? (cols[billModeIdx] || '') : '';
    rows.push({
      name,
      owner: ownerIdx !== -1 ? (cols[ownerIdx] || '') : '',
      email: emailIdx !== -1 ? (cols[emailIdx] || '') : '',
      phone: phoneIdx !== -1 ? (cols[phoneIdx] || '') : '',
      dateOfBirth: dobIdx !== -1 ? (cols[dobIdx] || '') : '',
      policyNumber: policyNumIdx !== -1 ? (cols[policyNumIdx] || '') : '',
      carrier: carrierIdx !== -1 ? (cols[carrierIdx] || '') : '',
      policyType: policyTypeIdx !== -1 ? (cols[policyTypeIdx] || '') : '',
      effectiveDate: effectiveDateIdx !== -1 ? (cols[effectiveDateIdx] || '') : '',
      premium,
      coverageAmount: coverageIdx !== -1 ? (cols[coverageIdx] || '') : '',
      status: normalizeBobStatus(statusIdx !== -1 ? (cols[statusIdx] || '') : ''),
      premiumFrequency: inferPremiumFrequency(billMode),
    });
  }

  if (!rows.length) {
    return { rows: [], confidence: 'low', note: `${fileName}: no usable rows parsed.` };
  }
  const matchedCoreColumns = [nameIdx, policyNumIdx, carrierIdx, premiumIdx, coverageIdx].filter((idx) => idx !== -1).length;
  const confidence = matchedCoreColumns >= 3 ? 'high' : 'low';
  return {
    rows,
    confidence,
    note:
      confidence === 'high'
        ? 'Deterministic parser handled this file without AI fallback.'
        : 'Deterministic parser found partial structure; AI fallback used.',
  };
}

async function extractBobFromTextSource(text: string): Promise<{ rows: BobRawRow[]; rowCount: number; note?: string }> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: BOB_SYSTEM_PROMPT,
    output_config: {
      format: {
        type: 'json_schema',
        schema: BOB_EXTRACTION_SCHEMA,
      },
    },
    messages: [
      {
        role: 'user',
        content: `Extract all client and policy data from this Book of Business report:\n\n${text}`,
      },
    ],
  });
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No BOB text extraction response received.');
  }
  const parsed = safeJsonParse(textBlock.text);
  return {
    rows: normalizeBobRawRows(parsed.rows),
    rowCount: toBobRowCount(parsed.rowCount, parsed.rows),
    note: toStringOrNull(parsed.note) || undefined,
  };
}

async function extractBobFromPdfBuffer(pdfBuffer: Buffer): Promise<{ rows: BobRawRow[]; rowCount: number; note?: string }> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: BOB_SYSTEM_PROMPT,
    output_config: {
      format: {
        type: 'json_schema',
        schema: BOB_EXTRACTION_SCHEMA,
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
              data: pdfBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Extract all client and policy rows from this Book of Business PDF.',
          },
        ],
      },
    ],
  });
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No BOB PDF extraction response received.');
  }
  const parsed = safeJsonParse(textBlock.text);
  return {
    rows: normalizeBobRawRows(parsed.rows),
    rowCount: toBobRowCount(parsed.rowCount, parsed.rows),
    note: toStringOrNull(parsed.note) || undefined,
  };
}

function normalizeBobResult(input: { rows: BobRawRow[]; rowCount: number; note?: string }): BobStructuredResult {
  const normalizedRows = (input.rows || []).map((row) => {
    const [firstName, ...rest] = (row.name || '').trim().split(/\s+/);
    const lastName = rest.join(' ').trim();
    return {
      firstName: firstName || row.name || '',
      lastName,
      phone: toNullableString(row.phone),
      email: toNullableString(row.email),
      dateOfBirth: toNullableString(row.dateOfBirth),
      policyType: toNullableString(row.policyType),
      policyNumber: toNullableString(row.policyNumber),
      carrier: toNullableString(row.carrier),
      premiumAmount: toNullableNumber(row.premium),
      coverageAmount: toNullableNumber(row.coverageAmount),
    };
  });
  return {
    rows: normalizedRows,
    rowCount: typeof input.rowCount === 'number' ? input.rowCount : normalizedRows.length,
    note: input.note,
  };
}

function normalizeBobRawRows(value: unknown): BobRawRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const row = raw as Record<string, unknown>;
      return {
        name: typeof row.name === 'string' ? row.name : '',
        owner: typeof row.owner === 'string' ? row.owner : '',
        email: typeof row.email === 'string' ? row.email : '',
        phone: typeof row.phone === 'string' ? row.phone : '',
        dateOfBirth: typeof row.dateOfBirth === 'string' ? row.dateOfBirth : '',
        policyNumber: typeof row.policyNumber === 'string' ? row.policyNumber : '',
        carrier: typeof row.carrier === 'string' ? row.carrier : '',
        policyType: typeof row.policyType === 'string' ? row.policyType : '',
        effectiveDate: typeof row.effectiveDate === 'string' ? row.effectiveDate : '',
        premium: typeof row.premium === 'string' ? row.premium : '',
        coverageAmount: typeof row.coverageAmount === 'string' ? row.coverageAmount : '',
        status: typeof row.status === 'string' ? row.status : '',
        premiumFrequency: typeof row.premiumFrequency === 'string' ? row.premiumFrequency : '',
      } satisfies BobRawRow;
    })
    .filter((row): row is BobRawRow => !!row && !!row.name.trim());
}

function toBobRowCount(rowCount: unknown, rows: unknown): number {
  if (typeof rowCount === 'number' && Number.isFinite(rowCount) && rowCount >= 0) {
    return rowCount;
  }
  return Array.isArray(rows) ? rows.length : 0;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      // Support escaped quotes ("") within quoted cells.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function inferPremiumFrequency(value: string): string {
  const raw = (value || '').toLowerCase().trim();
  if (raw.includes('month') || raw === 'mon') return 'monthly';
  if (raw.includes('quarter') || raw === 'qtr') return 'quarterly';
  if (raw.includes('semi')) return 'semi-annual';
  if (raw.includes('annual') || raw === 'ann') return 'annual';
  return 'monthly';
}

function normalizeBobStatus(value: string): string {
  const lower = (value || '').trim().toLowerCase();
  if (lower === 'pending' || lower === 'applied' || lower === 'submitted') return 'Pending';
  if (lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' || lower === 'terminated' || lower === 'expired') return 'Lapsed';
  return 'Active';
}

function toNullableString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,$]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLoadedRowsFromResult(result: Record<string, unknown>): number {
  const bob = (result.bob || {}) as Record<string, unknown>;
  const rows = bob.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

async function runApplicationExtraction(imageBuffers: Buffer[], carrierFormType: string): Promise<{ data: ExtractedApplicationData; note?: string }> {
  const anthropic = getAnthropicClient();
  const systemPrompt = buildApplicationSystemPrompt(carrierFormType);
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), 90_000);
  try {
    const imageBlocks: Anthropic.ImageBlockParam[] = imageBuffers.map((buffer) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: buffer.toString('base64'),
      },
    }));
    const totalBase64PayloadBytes = imageBuffers.reduce((acc, buffer) => {
      return acc + Buffer.byteLength(buffer.toString('base64'), 'utf8');
    }, 0);
    emit('diag', { stage: 'sending_to_claude', at: Date.now(), totalBase64PayloadBytes });

    const response = await anthropic.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1700,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              ...imageBlocks,
              { type: 'text', text: 'Return strict JSON only. Do not wrap in markdown code fences or backticks.' },
            ],
          },
        ],
      },
      {
        signal: timeoutController.signal,
      },
    );
    emit('diag', {
      stage: 'claude_responded',
      at: Date.now(),
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
      },
    });
    const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
    if (!text) throw new Error('No response received from AI.');
    const parsed = safeJsonParse(text);
    return {
      data: normalizeApplication(parsed),
      note: typeof parsed.note === 'string' ? parsed.note : undefined,
    };
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))) {
      emit('diag', { stage: 'request_aborted', at: Date.now() });
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildApplicationSystemPrompt(carrierFormType: string): string {
  const supplement = CARRIER_PROMPT_SUPPLEMENTS[carrierFormType];
  if (!supplement) return GENERIC_APPLICATION_SYSTEM_PROMPT;
  return `${GENERIC_APPLICATION_SYSTEM_PROMPT}\n\n${supplement}`;
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
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('rate') || lower.includes('abort')) {
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function toMillisOrNull(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      _seconds?: number;
      _nanoseconds?: number;
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      const millis = date.getTime();
      return Number.isNaN(millis) ? null : millis;
    }

    const sec =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : null;
    if (sec == null) return null;

    const nanos =
      typeof candidate.nanoseconds === 'number'
        ? candidate.nanoseconds
        : typeof candidate._nanoseconds === 'number'
          ? candidate._nanoseconds
          : 0;
    return sec * 1000 + Math.floor(nanos / 1_000_000);
  }
  return null;
}

function isFirestoreFailedPreconditionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
  };
  if (candidate.code === 9 || candidate.code === '9' || candidate.code === 'failed-precondition') {
    return true;
  }
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return message.includes('failed_precondition') || message.includes('failed precondition');
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
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    }
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error('Failed to parse AI response JSON.');
  }
}

function normalizeApplication(parsed: Record<string, unknown>): ExtractedApplicationData {
  const applicationSignedDate = toIsoDateStringOrNull(parsed.applicationSignedDate);
  const extractedEffectiveDate = toIsoDateStringOrNull(parsed.effectiveDate);
  // Universal fallback: when the form does not carry an effective date (e.g. AMAM
  // "On Approval", or any carrier where the field is blank), assume coverage
  // begins on the application signed date. Applies to all carriers.
  const effectiveDate = extractedEffectiveDate ?? applicationSignedDate;
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
    effectiveDate,
    applicationSignedDate,
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
    const entry: { name: string; type: 'primary' | 'contingent'; relationship?: string; percentage?: number; irrevocable?: boolean | null } = { name, type };
    const relationship = toStringOrNull(raw.relationship);
    if (relationship) entry.relationship = relationship;
    const percentage = toNumberOrNull(raw.percentage);
    if (percentage != null) entry.percentage = percentage;
    const irrevocable = toBooleanOrNull(raw.irrevocable);
    if (irrevocable != null) entry.irrevocable = irrevocable;
    result.push(entry);
  }
  return result.length > 0 ? result : null;
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
