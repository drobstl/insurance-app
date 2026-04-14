"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processIngestionV3Queued = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firestore_2 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
(0, app_1.initializeApp)();
(0, firestore_1.getFirestore)().settings({ ignoreUndefinedProperties: true });
const REGION = 'us-central1';
const JOBS_COLLECTION = 'ingestionJobsV3';
const ANTHROPIC_API_KEY = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
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
};
exports.processIngestionV3Queued = (0, firestore_2.onDocumentCreated)({
    document: `${JOBS_COLLECTION}/{jobId}`,
    region: REGION,
    timeoutSeconds: 120,
    memory: '1GiB',
    secrets: [ANTHROPIC_API_KEY],
}, async (event) => {
    emit('diag', { stage: 'function_start', at: Date.now() });
    const snap = event.data;
    if (!snap?.exists)
        return;
    const createdData = snap.data();
    const createdStatus = createdData.status || 'failed';
    if (createdStatus !== 'queued')
        return;
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
            if (job.gcsPath) {
                await downloadSource(job.gcsPath);
            }
            const sourceFetchMs = Date.now() - sourceStart;
            await completeJob(job, {
                status: 'review_ready',
                result: {
                    bob: {
                        rows: [],
                        rowCount: 0,
                        note: 'BOB extraction in GCF is not yet implemented. This path should remain on existing parser until parity.',
                    },
                },
                metrics: {
                    totalMs: Date.now() - t0,
                    sourceFetchMs,
                    extractionMs: 0,
                    validationMs: 0,
                    parserPath: 'ai-pdf',
                },
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
    }
    catch (error) {
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
});
async function lockQueuedJob(jobId) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(JOBS_COLLECTION).doc(jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            return { ok: false, reason: 'not_found' };
        const data = snap.data();
        const status = data.status || 'failed';
        if (status !== 'queued')
            return { ok: false, reason: 'not_queued' };
        const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
        const agentId = typeof data.agentId === 'string' ? data.agentId : undefined;
        const mode = data.mode === 'bob' ? 'bob' : 'application';
        const gcsPath = typeof data.gcsPath === 'string' ? data.gcsPath : undefined;
        const gcsImagePaths = toStringArray(data.gcsImagePaths);
        if (mode === 'application' && !gcsImagePaths.length)
            return { ok: false, reason: 'missing_gcs_image_paths' };
        if (mode === 'bob' && !gcsPath)
            return { ok: false, reason: 'missing_gcs_path' };
        const processingToken = randomToken();
        tx.update(ref, {
            status: 'processing',
            attempts: attempts + 1,
            processingToken,
            retryAfter: firestore_1.FieldValue.delete(),
            error: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            startedAt: firestore_1.FieldValue.serverTimestamp(),
            completedAt: firestore_1.FieldValue.delete(),
        });
        return {
            ok: true,
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
                carrierFormType: typeof data.carrierFormType === 'string' && data.carrierFormType.trim()
                    ? data.carrierFormType.trim()
                    : 'unknown',
            },
        };
    });
}
async function completeJob(job, payload) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(JOBS_COLLECTION).doc(job.jobId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            return;
        const data = snap.data();
        if (data.processingToken !== job.processingToken)
            return;
        tx.update(ref, {
            status: payload.status,
            result: payload.result,
            metrics: payload.metrics,
            processingToken: firestore_1.FieldValue.delete(),
            retryAfter: firestore_1.FieldValue.delete(),
            error: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            completedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
}
async function failJob(job, error) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(JOBS_COLLECTION).doc(job.jobId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            return;
        const data = snap.data();
        if (data.processingToken !== job.processingToken)
            return;
        tx.update(ref, {
            status: 'failed',
            error,
            processingToken: firestore_1.FieldValue.delete(),
            retryAfter: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            completedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
}
async function downloadSource(gcsPath) {
    const bucket = (0, storage_1.getStorage)().bucket();
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
        throw {
            code: 'UPLOAD_NOT_FOUND',
            message: 'Uploaded source file does not exist in storage.',
            retryable: false,
            terminal: true,
        };
    }
    const [buffer] = await file.download();
    return { buffer };
}
async function downloadImageSources(gcsImagePaths) {
    const buffers = [];
    for (let index = 0; index < gcsImagePaths.length; index += 1) {
        const gcsPath = gcsImagePaths[index];
        const { buffer } = await downloadSource(gcsPath);
        emit('diag', { stage: 'downloaded_image', index, bytes: buffer.byteLength, at: Date.now() });
        buffers.push(buffer);
    }
    return buffers;
}
async function runApplicationExtraction(imageBuffers, carrierFormType) {
    const anthropic = getAnthropicClient();
    const systemPrompt = buildApplicationSystemPrompt(carrierFormType);
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), 90_000);
    try {
        const imageBlocks = imageBuffers.map((buffer) => ({
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
        const response = await anthropic.messages.create({
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
        }, {
            signal: timeoutController.signal,
        });
        emit('diag', {
            stage: 'claude_responded',
            at: Date.now(),
            usage: {
                input_tokens: response.usage?.input_tokens,
                output_tokens: response.usage?.output_tokens,
            },
        });
        const text = response.content.find((block) => block.type === 'text')?.text;
        if (!text)
            throw new Error('No response received from AI.');
        const parsed = safeJsonParse(text);
        return {
            data: normalizeApplication(parsed),
            note: typeof parsed.note === 'string' ? parsed.note : undefined,
        };
    }
    catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))) {
            emit('diag', { stage: 'request_aborted', at: Date.now() });
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutHandle);
    }
}
function buildApplicationSystemPrompt(carrierFormType) {
    void carrierFormType;
    return GENERIC_APPLICATION_SYSTEM_PROMPT;
}
function evaluateCompleteness(data) {
    const [firstName, ...rest] = (data.insuredName || '').trim().split(/\s+/);
    const lastName = rest.join(' ').trim();
    const values = [
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
    const present = values.reduce((acc, value) => {
        if (typeof value === 'number')
            return Number.isFinite(value) ? acc + 1 : acc;
        if (typeof value === 'string')
            return value.trim() ? acc + 1 : acc;
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
function classifyError(error) {
    if (isIngestionError(error))
        return error;
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
function isIngestionError(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return (typeof candidate.code === 'string' &&
        typeof candidate.message === 'string' &&
        typeof candidate.retryable === 'boolean' &&
        typeof candidate.terminal === 'boolean');
}
function toStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}
function randomToken() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
function getAnthropicClient() {
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured.');
    }
    return new sdk_1.default({ apiKey });
}
function safeJsonParse(text) {
    try {
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
        }
        return JSON.parse(cleaned);
    }
    catch {
        throw new Error('Failed to parse AI response JSON.');
    }
}
function normalizeApplication(parsed) {
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
function emptyApplication() {
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
function toStringOrNull(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function toNumberOrNull(value) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string')
        return null;
    const normalized = value.replace(/[,$]/g, '').trim();
    if (!normalized)
        return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}
function toPolicyType(value) {
    if (typeof value !== 'string')
        return null;
    const allowed = new Set(['IUL', 'Term Life', 'Whole Life', 'Mortgage Protection', 'Accidental', 'Other']);
    return allowed.has(value) ? value : null;
}
function toFrequency(value) {
    if (typeof value !== 'string')
        return null;
    const allowed = new Set(['monthly', 'quarterly', 'semi-annual', 'annual']);
    return allowed.has(value) ? value : null;
}
function parseBeneficiaries(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const result = [];
    for (const item of value) {
        if (!item || typeof item !== 'object')
            continue;
        const raw = item;
        const name = toStringOrNull(raw.name);
        if (!name)
            continue;
        const type = raw.type === 'contingent' ? 'contingent' : 'primary';
        const entry = { name, type };
        const relationship = toStringOrNull(raw.relationship);
        if (relationship)
            entry.relationship = relationship;
        const percentage = toNumberOrNull(raw.percentage);
        if (percentage != null)
            entry.percentage = percentage;
        const irrevocable = toBooleanOrNull(raw.irrevocable);
        if (irrevocable != null)
            entry.irrevocable = irrevocable;
        result.push(entry);
    }
    return result.length > 0 ? result : null;
}
function toIsoDateStringOrNull(value) {
    const str = toStringOrNull(value);
    if (!str)
        return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str))
        return null;
    const timestamp = Date.parse(`${str}T12:00:00.000Z`);
    return Number.isNaN(timestamp) ? null : str;
}
function toBooleanOrNull(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true')
            return true;
        if (normalized === 'false')
            return false;
    }
    return null;
}
function toStateAbbreviationOrNull(value) {
    if (typeof value !== 'string')
        return null;
    const state = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(state) ? state : null;
}
function emit(event, payload) {
    console.log('[ingestion-v3-gcf]', JSON.stringify({ event, ts: new Date().toISOString(), ...payload }));
}
