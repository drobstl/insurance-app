"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileStaleBatchJobs = exports.cleanupIngestionV3Zombies = exports.processIngestionV3Queued = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const XLSX = __importStar(require("xlsx"));
const carrier_prompt_supplements_1 = require("./carrier-prompt-supplements");
(0, app_1.initializeApp)();
(0, firestore_1.getFirestore)().settings({ ignoreUndefinedProperties: true });
const REGION = 'us-central1';
const JOBS_COLLECTION = 'ingestionJobsV3';
const ANTHROPIC_API_KEY = (0, params_1.defineSecret)('ANTHROPIC_API_KEY');
const ZOMBIE_TIMEOUT_MS = 5 * 60 * 1000;
const ZOMBIE_SCAN_LIMIT = 200;
const STALE_BATCH_TIMEOUT_MS = 15 * 60 * 1000;
const STALE_BATCH_SCAN_LIMIT = 100;
// Code-side deterministic overrides for fields that the agent-selected
// carrierFormType makes authoritative (policyType, insuranceCompany). Applied
// after Claude extraction; bypasses any misclassification. Supplement prompts
// still enforce the same values as a secondary signal (belt + suspenders).
// Add a row here when a new mapped form type has a known carrier and product.
const CARRIER_FORM_TYPE_OVERRIDES = {
    americo_icc18_5160: { policyType: 'Term Life', insuranceCompany: 'Americo' },
    amam_icc15_aa9466: { policyType: 'Mortgage Protection', insuranceCompany: 'American-Amicable' },
    amam_icc18_aa3487: { policyType: 'Term Life', insuranceCompany: 'American-Amicable' },
    foresters_icc15_770825: { policyType: 'Term Life', insuranceCompany: 'Foresters' },
    uhl_icc22_200_878a: { policyType: 'Term Life', insuranceCompany: 'United Home Life' },
    uhl_icc20_200_854a_giwl: { policyType: 'Whole Life', insuranceCompany: 'United Home Life' },
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
- beneficiaries: use actual person names; relationship label in relationship field. If beneficiary-specific phone/email is clearly shown in that beneficiary row/section, include it; otherwise omit/null. Never copy insured/owner contact fields into beneficiary contacts unless explicitly tied to beneficiary rows.
- coverageAmount: face amount/death benefit as a number.
- premiumAmount: modal/planned/scheduled premium as a number.
- premiumFrequency: map to monthly/quarterly/semi-annual/annual.
- policyNumber: always null (policy number extraction is disabled for now).
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
};
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
                    phone: { type: 'string' },
                    email: { type: 'string' },
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
            if (!job.gcsPath) {
                throw {
                    code: 'UPLOAD_NOT_FOUND',
                    message: 'Uploaded BOB source path is missing.',
                    retryable: false,
                    terminal: true,
                };
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
            const applied = [];
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
exports.cleanupIngestionV3Zombies = (0, scheduler_1.onSchedule)({
    region: REGION,
    schedule: 'every 5 minutes',
    timeoutSeconds: 240,
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    const cutoffMs = Date.now() - ZOMBIE_TIMEOUT_MS;
    const snap = await db
        .collection(JOBS_COLLECTION)
        .where('status', '==', 'processing')
        .limit(ZOMBIE_SCAN_LIMIT)
        .get();
    if (snap.empty)
        return;
    const staleDocs = snap.docs.filter((doc) => {
        const data = doc.data();
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
    await Promise.all(staleDocs.map((doc) => doc.ref.update({
        status: 'failed',
        error: {
            code: 'PROCESSING_TIMEOUT',
            message: 'Job exceeded processing timeout (5 minutes) and was marked failed.',
            retryable: false,
            terminal: true,
        },
        processingToken: firestore_1.FieldValue.delete(),
        retryAfter: firestore_1.FieldValue.delete(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        completedAt: firestore_1.FieldValue.serverTimestamp(),
    })));
    emit('ingestion_v3_zombie_cleanup', {
        scanned_jobs: snap.size,
        affected_jobs: staleDocs.length,
    });
});
exports.reconcileStaleBatchJobs = (0, scheduler_1.onSchedule)({
    region: REGION,
    schedule: 'every 5 minutes',
    timeoutSeconds: 240,
    memory: '512MiB',
}, async () => {
    try {
        const db = (0, firestore_1.getFirestore)();
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
                const data = doc.data();
                const status = data.status || 'processing';
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
        }
        catch (error) {
            emit('ingestion_v3_stale_batch_reconcile_metrics_persist_failed', {
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    catch (error) {
        if (isFirestoreFailedPreconditionError(error)) {
            emit('ingestion_v3_stale_batch_reconcile_failed_precondition', {
                message: error instanceof Error ? error.message : String(error),
            });
            return;
        }
        throw error;
    }
});
async function persistStaleBatchReconcileMetrics(metrics) {
    const db = (0, firestore_1.getFirestore)();
    const metricsRef = db.collection('systemMetrics').doc('ingestionV3');
    await metricsRef.set({
        staleBatchReconcile: {
            ...metrics,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        },
    }, { merge: true });
    await metricsRef.collection('staleBatchReconcileRuns').add({
        ...metrics,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
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
        const batchId = typeof data.batchId === 'string' ? data.batchId : undefined;
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
                batchId,
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
    await reportToBatchDoc(job, {
        status: 'succeeded',
        loadedRows: getLoadedRowsFromResult(payload.result),
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
    await reportToBatchDoc(job, {
        status: 'failed',
        error,
    });
}
async function reportToBatchDoc(job, update) {
    if (!job.agentId || !job.batchId)
        return;
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('agents').doc(job.agentId).collection('batchJobs').doc(job.batchId);
    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists)
                return;
            const data = snap.data();
            const batchStatus = data.status || 'processing';
            if (batchStatus === 'cancelled')
                return;
            const files = (data.files || {});
            const existing = files[job.jobId];
            if (!existing)
                return;
            const prevStatus = existing.status || 'queued';
            if (prevStatus === 'succeeded' || prevStatus === 'failed')
                return;
            const patch = {
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                [`files.${job.jobId}.status`]: update.status,
            };
            if (update.status === 'succeeded') {
                patch.completedFiles = firestore_1.FieldValue.increment(1);
                if (update.loadedRows > 0) {
                    patch[`files.${job.jobId}.loadedRows`] = update.loadedRows;
                    patch.totalRows = firestore_1.FieldValue.increment(update.loadedRows);
                }
            }
            else {
                patch.failedFiles = firestore_1.FieldValue.increment(1);
                patch[`files.${job.jobId}.error`] = update.error.message;
                patch[`files.${job.jobId}.retryable`] = false;
            }
            tx.update(ref, patch);
        });
    }
    catch (error) {
        emit('ingestion_v3_batch_report_failed', {
            job_id: job.jobId,
            batch_id: job.batchId,
            error: error instanceof Error ? error.message : String(error),
        });
        return;
    }
    await finalizeBatchIfComplete(job.agentId, job.batchId);
}
async function finalizeBatchIfComplete(agentId, batchId) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('agents').doc(agentId).collection('batchJobs').doc(batchId);
    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists)
                return;
            const data = snap.data();
            const currentStatus = data.status || 'processing';
            if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'partial' || currentStatus === 'failed') {
                return;
            }
            const totalFiles = typeof data.totalFiles === 'number' ? data.totalFiles : 0;
            const completedFiles = typeof data.completedFiles === 'number' ? data.completedFiles : 0;
            const failedFiles = typeof data.failedFiles === 'number' ? data.failedFiles : 0;
            const accounted = completedFiles + failedFiles;
            if (totalFiles <= 0 || accounted < totalFiles)
                return;
            tx.update(ref, {
                status: failedFiles > 0 ? 'partial' : 'completed',
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                completedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        });
    }
    catch (error) {
        emit('ingestion_v3_batch_finalize_failed', {
            batch_id: batchId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
async function reconcileBatchDocFromJobs(batchDocPath) {
    const db = (0, firestore_1.getFirestore)();
    const ref = db.doc(batchDocPath);
    const snap = await ref.get();
    if (!snap.exists)
        return false;
    const data = snap.data();
    const currentStatus = data.status || 'processing';
    if (currentStatus !== 'processing')
        return false;
    const files = (data.files || {});
    const jobIds = Object.keys(files);
    if (!jobIds.length)
        return false;
    const jobRefs = jobIds.map((jobId) => db.collection(JOBS_COLLECTION).doc(jobId));
    const jobSnaps = await db.getAll(...jobRefs);
    let completedFiles = 0;
    let failedFiles = 0;
    let totalRows = 0;
    const nextFiles = {};
    for (let i = 0; i < jobIds.length; i += 1) {
        const jobId = jobIds[i];
        const existing = files[jobId] || {};
        const jobSnap = jobSnaps[i];
        const jobData = jobSnap.exists ? jobSnap.data() : null;
        const jobStatus = (jobData?.status || '').toLowerCase();
        if (jobStatus === 'review_ready' || jobStatus === 'saved') {
            const loadedRows = getLoadedRowsFromResult(jobData?.result || {});
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
        }
        else if (jobStatus === 'failed') {
            const err = jobData?.error || {};
            failureMessage = typeof err.message === 'string' && err.message.trim()
                ? err.message
                : 'Ingestion job failed.';
        }
        else if (jobStatus === 'queued' || jobStatus === 'processing' || jobStatus === 'uploading') {
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
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        completedAt: firestore_1.FieldValue.serverTimestamp(),
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
async function extractBobResult(input) {
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
function toBobTextSource(buffer, fileName, contentType) {
    const isSpreadsheet = fileName.endsWith('.xlsx') ||
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
            };
        }
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
        if (!csv.trim()) {
            throw {
                code: 'SOURCE_FETCH_FAILED',
                message: 'Spreadsheet source is empty.',
                retryable: false,
                terminal: true,
            };
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
        };
    }
    return { text, parserPath: 'deterministic' };
}
function parseBobDeterministically(text, fileName) {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
        return { rows: [], confidence: 'low', note: `${fileName}: no data rows.` };
    }
    const tabCols = lines[0].split('\t').length;
    const commaCols = lines[0].split(',').length;
    const delimiter = tabCols > commaCols ? '\t' : ',';
    const headers = parseCsvLine(lines[0], delimiter).map((h) => normalizeHeader(h));
    const claimed = new Set();
    const match = (aliases) => {
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
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i], delimiter);
        const name = cols[nameIdx] || '';
        if (!name.trim())
            continue;
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
        note: confidence === 'high'
            ? 'Deterministic parser handled this file without AI fallback.'
            : 'Deterministic parser found partial structure; AI fallback used.',
    };
}
async function extractBobFromTextSource(text) {
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
    const textBlock = response.content.find((block) => block.type === 'text');
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
async function extractBobFromPdfBuffer(pdfBuffer) {
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
    const textBlock = response.content.find((block) => block.type === 'text');
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
function normalizeBobResult(input) {
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
function normalizeBobRawRows(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((raw) => {
        if (!raw || typeof raw !== 'object')
            return null;
        const row = raw;
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
        };
    })
        .filter((row) => !!row && !!row.name.trim());
}
function toBobRowCount(rowCount, rows) {
    if (typeof rowCount === 'number' && Number.isFinite(rowCount) && rowCount >= 0) {
        return rowCount;
    }
    return Array.isArray(rows) ? rows.length : 0;
}
function parseCsvLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            // Support escaped quotes ("") within quoted cells.
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (ch === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        }
        else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}
function normalizeHeader(value) {
    return value.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}
function inferPremiumFrequency(value) {
    const raw = (value || '').toLowerCase().trim();
    if (raw.includes('month') || raw === 'mon')
        return 'monthly';
    if (raw.includes('quarter') || raw === 'qtr')
        return 'quarterly';
    if (raw.includes('semi'))
        return 'semi-annual';
    if (raw.includes('annual') || raw === 'ann')
        return 'annual';
    return 'monthly';
}
function normalizeBobStatus(value) {
    const lower = (value || '').trim().toLowerCase();
    if (lower === 'pending' || lower === 'applied' || lower === 'submitted')
        return 'Pending';
    if (lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' || lower === 'terminated' || lower === 'expired')
        return 'Lapsed';
    return 'Active';
}
function toNullableString(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function toNullableNumber(value) {
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
function getLoadedRowsFromResult(result) {
    const bob = (result.bob || {});
    const rows = bob.rows;
    return Array.isArray(rows) ? rows.length : 0;
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
    const supplement = carrier_prompt_supplements_1.CARRIER_PROMPT_SUPPLEMENTS[carrierFormType];
    if (!supplement)
        return GENERIC_APPLICATION_SYSTEM_PROMPT;
    return `${GENERIC_APPLICATION_SYSTEM_PROMPT}\n\n${supplement}`;
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
function toMillisOrNull(value) {
    if (!value)
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof value === 'object') {
        const candidate = value;
        if (typeof candidate.toMillis === 'function') {
            const millis = candidate.toMillis();
            return Number.isFinite(millis) ? millis : null;
        }
        if (typeof candidate.toDate === 'function') {
            const date = candidate.toDate();
            const millis = date.getTime();
            return Number.isNaN(millis) ? null : millis;
        }
        const sec = typeof candidate.seconds === 'number'
            ? candidate.seconds
            : typeof candidate._seconds === 'number'
                ? candidate._seconds
                : null;
        if (sec == null)
            return null;
        const nanos = typeof candidate.nanoseconds === 'number'
            ? candidate.nanoseconds
            : typeof candidate._nanoseconds === 'number'
                ? candidate._nanoseconds
                : 0;
        return sec * 1000 + Math.floor(nanos / 1_000_000);
    }
    return null;
}
function isFirestoreFailedPreconditionError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    if (candidate.code === 9 || candidate.code === '9' || candidate.code === 'failed-precondition') {
        return true;
    }
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
    return message.includes('failed_precondition') || message.includes('failed precondition');
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
    const applicationSignedDate = toIsoDateStringOrNull(parsed.applicationSignedDate);
    const extractedEffectiveDate = toIsoDateStringOrNull(parsed.effectiveDate);
    // Universal fallback: when the form does not carry an effective date (e.g. AMAM
    // "On Approval", or any carrier where the field is blank), assume coverage
    // begins on the application signed date. Applies to all carriers.
    const effectiveDate = extractedEffectiveDate ?? applicationSignedDate;
    return {
        policyType: toPolicyType(parsed.policyType),
        policyNumber: null,
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
        const phone = toStringOrNull(raw.phone);
        if (phone)
            entry.phone = phone;
        const email = toStringOrNull(raw.email);
        if (email)
            entry.email = email;
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
