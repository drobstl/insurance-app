# AFL Phase 2 Go/No-Go Evidence Bundle

## Purpose

Use this template to produce a single, reviewable release packet for Phase 2 PDF ingestion reliability.

This bundle is the source of truth for GO/NO-GO decisions.

## Bundle Metadata

- Release date: April 9, 2026 (draft pre-fill)
- Candidate version/commit: Working tree (pre-commit draft; capture SHA at release cut)
- Environment: Local validation completed; production evidence pending
- Owner: Daniel Roberts
- Reviewers: TBD
- Decision deadline: TBD

## Evidence Index

| Section | Artifact | Location |
|---|---|---|
| Deployment checklist | Completed Phase 2 deployment checklist | `PHASE2-DEPLOYMENT-CHECKLIST.md` (filled copy or linked run log) |
| Release gate table | Gate status with evidence links | `RELEASE-GATE.md` |
| Corpus results | 10-file carrier corpus results | Attach CSV/Markdown summary + logs |
| UI evidence | Screenshots or recording of progress/fallback/error UX | Attach media links |
| Telemetry evidence | PostHog queries/screenshots for required events | Attach query links/screenshots |
| Rollback validation | Rollback dry-run steps and outcome | Attach runbook + test log |

Known artifacts already produced in this branch:

- `web/lib/ingestion-v3-client-policy.ts` (shared 10s/45s/90s policy + error mapping)
- `gcf/ingestion-v3-processor/src/index.ts` (queued trigger + lock + throttle + fallback + completeness gate + zombie cleanup)
- `web/app/api/ingestion/v3/jobs/route.ts` (queued-only creation; no dispatch)
- `web/app/api/ingestion/v3/jobs/[jobId]/process/route.ts` (deprecated with 410)
- `web/components/ApplicationUpload.tsx` and `web/app/dashboard/clients/page.tsx` (unified reliability behavior)
- `web/lib/analytics-events.ts` (required telemetry event names added)
- Validation command outputs from this session:
  - `npm run lint` (targeted files): no errors in touched files
  - `npm run test:ingestion-corpus`: PASS on current 5-fixture suite

## Gate-by-Gate Evidence (Maps to `RELEASE-GATE.md`)

### Gate 1 - 90s hard resolve

- Data source: Code policy constants and UI polling/fallback logic
- Method: Verify both entry points read `V3_CLIENT_POLICY.hardResolveMs = 90000`
- Worst-case elapsed: Not yet measured in production corpus run
- Pass/Fail: PARTIAL (implementation yes, runtime proof pending)
- Evidence link: `web/lib/ingestion-v3-client-policy.ts`, `web/components/ApplicationUpload.tsx`, `web/app/dashboard/clients/page.tsx`

### Gate 2 - progress visible within 10s

- Data source: UI progress state + SLA event hooks
- Method: Confirm `progressSlaMs` and `application_sla_breach` instrumentation in both entry points
- Observed time to first progress: Pending UI recording
- Pass/Fail: PARTIAL
- Evidence link: `web/lib/ingestion-v3-client-policy.ts`, `web/components/ApplicationUpload.tsx`, `web/app/dashboard/clients/page.tsx`

### Gate 3 - usable result within 45s target

- Data source: Code policy constant + telemetry event support
- Method: Confirm `usableTargetMs = 45000` + parse completion event wiring
- Median / P90: Pending real corpus timing run
- Pass/Fail: PARTIAL
- Evidence link: `web/lib/ingestion-v3-client-policy.ts`, `web/lib/analytics-events.ts`

### Gate 4 - queue stall/failure fallback triggers

- Failure injection method: Not executed yet (required next step)
- Observed fallback behavior: Implemented for stall and processor failure taxonomy in both entry points
- Pass/Fail: PARTIAL
- Evidence link: `web/components/ApplicationUpload.tsx`, `web/app/dashboard/clients/page.tsx`, `web/lib/ingestion-v3-client-policy.ts`

### Gate 5 - fresh parse job (no stale idempotency reuse)

- Validation method: Route code inspection + behavior change
- Result: Idempotency reuse branch removed from `POST /api/ingestion/v3/jobs`; fresh job always created
- Pass/Fail: PASS (implementation-level)
- Evidence link: `web/app/api/ingestion/v3/jobs/route.ts`

### Gate 6 - identical behavior across both UI entry points

- Compared surfaces: Add Client flow and ApplicationUpload modal
- Test condition: Shared policy + same fallback/error mapping paths
- Result: Shared module introduced and consumed in both paths; side-by-side runtime demo still pending
- Pass/Fail: PARTIAL
- Evidence link: `web/lib/ingestion-v3-client-policy.ts`, `web/components/ApplicationUpload.tsx`, `web/app/dashboard/clients/page.tsx`

### Gate 7 - partial-result contract

- Test file(s): Pending degraded real-file validation
- Core completeness outcome: Completeness gate implemented in GCF (`>=4/9 + name`)
- Terminal status: `review_ready` for passing gate, `failed` otherwise
- Pass/Fail: PARTIAL
- Evidence link: `gcf/ingestion-v3-processor/src/index.ts`

### Gate 8 - >=80% core completeness on corpus

- Corpus size: 5-fixture automated suite passed; 10-real-file release corpus pending
- Completeness aggregate: Not yet produced for real corpus
- Pass/Fail: PENDING
- Evidence link: `web/tests/ingestion-corpus/run-corpus.ts`, `TEST-CORPUS.md`

### Gate 9 - AMAM usability

- AMAM samples tested: 0/2 completed in this session (pending)
- Outcomes: Pending
- Pass/Fail: PENDING
- Evidence link: `TEST-CORPUS.md`

### Gate 10 - scanned PDF graceful handling

- Scanned samples tested: 1 fixture in existing 5-case suite (`scanned_application.pdf`)
- Outcome: Fixture gate passed; production-like scanned corpus evidence pending
- Pass/Fail: PARTIAL
- Evidence link: `web/tests/ingestion-corpus/run-corpus.ts`

### Gate 11 - no raw provider errors in UI

- Error scenarios covered: Signed URL, upload PUT, job create, poll stall, fallback, generic parser failures
- Result: User-safe mapping added; screenshot verification still pending
- Pass/Fail: PARTIAL
- Evidence link: `web/lib/ingestion-v3-client-policy.ts`, `web/app/api/parse-application/route.ts`

### Gate 12 - required telemetry events present

- Events validated: Event names added and capture calls wired in upload entry points
- Query window: Pending PostHog production query
- Result: Code-level implementation complete; runtime evidence pending
- Pass/Fail: PARTIAL
- Evidence link: `web/lib/analytics-events.ts`, `web/components/ApplicationUpload.tsx`, `web/app/dashboard/clients/page.tsx`

### Gate 13 - rollback path documented and tested

- Rollback drill date: Pending
- Steps executed: Checklist/runbook drafted but not drilled
- Recovery time: Pending
- Pass/Fail: PENDING
- Evidence link: `PHASE2-DEPLOYMENT-CHECKLIST.md`

## Corpus Result Table (Required)

| File # | Carrier | File Name/ID | Entry Point | Status | Elapsed ms | Fallback Used | Core Present | Core Total | Ratio | False Data Found | Notes |
|---|---|---|---|---|---:|---|---:|---:|---:|---|---|
| 1 | Fixture | `tiny_application.pdf` | automated test harness | review_ready (expected) | N/A | N/A | N/A | 9 | N/A | N/A | Existing 5-case suite PASS |
| 2 | Fixture | `large_application.pdf` | automated test harness | review_ready (expected) | N/A | N/A | N/A | 9 | N/A | N/A | Existing 5-case suite PASS |
| 3 | Fixture | `multi_page_application.pdf` | automated test harness | review_ready (expected) | N/A | N/A | N/A | 9 | N/A | N/A | Existing 5-case suite PASS |
| 4 | Fixture | `scanned_application.pdf` | automated test harness | review_ready (expected) | N/A | N/A | N/A | 9 | N/A | N/A | Existing 5-case suite PASS |
| 5 | Fixture | `malformed_application.pdf` | automated test harness | failed + `VALIDATION_FAILED` (expected) | N/A | N/A | N/A | 9 | N/A | N/A | Existing 5-case suite PASS |
| 6 |  |  |  |  |  |  |  | 9 |  |  |  |
| 7 |  |  |  |  |  |  |  | 9 |  |  |  |
| 8 |  |  |  |  |  |  |  | 9 |  |  |  |
| 9 |  |  |  |  |  |  |  | 9 |  |  |  |
| 10 |  |  |  |  |  |  |  | 9 |  |  |  |

## KPI Summary (Required)

- Upload success rate: Pending real 10-file corpus
- Core completeness rate: Pending real 10-file corpus
- Stall rate: Pending production telemetry query
- Fallback trigger rate: Pending production telemetry query
- Fallback success rate: Pending production telemetry query
- 90s breach rate: Pending production telemetry query

## Decision Rules

GO only if all are true:

- Upload success >= 95%
- Core completeness >= 80%
- Stall rate < 5%
- No raw provider text in UI
- Rollback path tested and documented

Automatic NO-GO / rollback trigger:

- Stall rate > 10% OR upload success < 85%

## Final Decision

- Decision: NO-GO (provisional; runtime evidence incomplete)
- Decision timestamp: 2026-04-09 (draft pre-fill)
- Approvers: Pending
- Blocking risks (if any): Missing live GCF deploy evidence, missing real 10-file corpus metrics, missing PostHog event proof, rollback drill not executed
- Follow-up actions:
  - Deploy GCF and run smoke test checklist
  - Run full 10-file corpus and fill rows 6-10 with real carrier files
  - Capture PostHog queries/screenshots for required events
  - Execute rollback dry-run and record recovery time
