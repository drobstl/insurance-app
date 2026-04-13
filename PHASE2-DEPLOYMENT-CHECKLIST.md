# AFL Phase 2 Deployment Checklist (PDF Ingestion Reliability)

## Scope

This checklist deploys and verifies Phase 2 architecture:

- Vercel: signed upload initiation, queued Firestore job creation, status polling, retry trigger
- Google Cloud Function Gen 2: Firestore-triggered processing for `ingestionJobsV3`
- Cloud Tasks: removed from active ingestion pipeline

## Pre-Deploy (Required)

- [ ] Confirm branch is up to date and all intended changes are committed
- [ ] Confirm `RELEASE-GATE.md` reflects current implementation status
- [ ] Confirm `gcf/ingestion-v3-processor` exists and builds locally
- [ ] Confirm `web` lint/test passes
  - [ ] `npm run lint` (or targeted lint for touched files)
  - [ ] `npm run test:ingestion-corpus` in `web`
- [ ] Confirm Anthropic key is available for GCF runtime (`ANTHROPIC_API_KEY`)
- [ ] Confirm Firebase Admin and Firestore access for function runtime
- [ ] Confirm Firestore collection name matches production: `ingestionJobsV3`

## Environment and Config Review

- [ ] Remove or deprecate Cloud Tasks runtime dependency from active Vercel ingestion flow
  - [ ] `CLOUD_TASKS_PROJECT_ID`
  - [ ] `CLOUD_TASKS_LOCATION`
  - [ ] `CLOUD_TASKS_QUEUE`
  - [ ] `INGESTION_V3_PROCESSOR_BASE_URL`
- [ ] Keep Vercel upload/status env healthy:
  - [ ] `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64`
  - [ ] `ANTHROPIC_API_KEY` (if still used by any fallback path)
- [ ] Ensure upload size policy is consistent at 16 MB across UI/API

## Deploy Order

1. **Deploy GCF first** (processor must exist before Vercel relies on queued-only jobs)
2. **Run GCF smoke test** (manual queued job -> terminal status)
3. **Deploy Vercel web app**
4. **Run end-to-end smoke test from UI**
5. **Run corpus validation and collect evidence**

## GCF Deploy Steps (Gen 2)

> Run from `gcf/ingestion-v3-processor`.

- [ ] Install deps
  - [ ] `npm install`
- [ ] Build
  - [ ] `npm run build`
- [ ] Deploy Firestore trigger + scheduler
  - [ ] Use project `insurance-agent-app-6f613`
  - [ ] Region `us-central1`
  - [ ] Runtime Node.js 20
  - [ ] Timeout 240s
  - [ ] Memory 1GiB
- [ ] Confirm function revision is healthy (no crash loop)
- [ ] Confirm trigger is subscribed to `ingestionJobsV3/{jobId}` writes
- [ ] Confirm scheduler for zombie cleanup is active (every 5 minutes)

## GCF Smoke Test (Before Vercel Deploy)

- [ ] Create a test job doc in Firestore with:
  - [ ] `status: "queued"`
  - [ ] valid `gcsPath`
  - [ ] `mode: "application"`
- [ ] Verify transition sequence:
  - [ ] `queued -> processing -> review_ready|failed`
- [ ] Verify failed path includes:
  - [ ] specific `error.code`
  - [ ] non-empty real `error.message`
- [ ] Verify source PDF is still present after failure
- [ ] Verify throttling behavior by creating >3 queued jobs for one `agentId`
- [ ] Verify zombie cleanup marks stale `processing` jobs with `PROCESSING_TIMEOUT`

## Vercel Deploy Steps

- [ ] Deploy web app after GCF smoke pass
- [ ] Verify no active path calls `/api/ingestion/v3/jobs/[jobId]/process`
- [ ] Verify `POST /api/ingestion/v3/jobs` returns immediately with queued `jobId`
- [ ] Verify both entry points follow same policy:
  - [ ] Add Client path in `web/app/dashboard/clients/page.tsx`
  - [ ] Modal upload path in `web/components/ApplicationUpload.tsx`

## Post-Deploy Production Verification

- [ ] Single-file upload resolves <= 90s with meaningful progress <= 10s
- [ ] Parse target for most files <= 45s
- [ ] Failure cases show taxonomy-safe human messages only (no provider raw text)
- [ ] Partial-success contract holds (`review_ready` when >=4/9 core + name)
- [ ] No zombie jobs left in `processing` beyond 5 minutes
- [ ] Telemetry events arrive in PostHog for:
  - [ ] upload started
  - [ ] signed URL fail
  - [ ] PUT fail
  - [ ] job create fail
  - [ ] poll stall
  - [ ] fallback triggered
  - [ ] fallback failed
  - [ ] parse completed
  - [ ] core completeness
  - [ ] SLA breach

## Corpus Validation (Deploy Gate)

- [ ] Run 10-file real corpus (8 carriers, includes both AMAM files)
- [ ] Record per-file:
  - [ ] elapsed time
  - [ ] terminal status
  - [ ] fallback used or not
  - [ ] core completeness counts
  - [ ] false-data check
- [ ] Gate thresholds:
  - [ ] upload success >= 95%
  - [ ] core completeness >= 80%
  - [ ] stall rate < 5%
  - [ ] no raw provider text in UI

## Rollback Plan (Execute if Triggered)

Rollback trigger:

- stall rate > 10% OR upload success < 85% after deploy

Rollback actions:

1. [ ] Disable/route around new GCF trigger path (revert to last known stable pipeline)
2. [ ] Re-deploy prior stable Vercel build
3. [ ] Verify uploads return to baseline behavior
4. [ ] Communicate incident window and mitigation summary
5. [ ] Preserve failing job samples for root-cause analysis

## Sign-Off

- [ ] Engineering sign-off
- [ ] Product sign-off
- [ ] Release gate marked GO in evidence bundle
