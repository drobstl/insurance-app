# AFL Upload + Extraction Release Gate

| # | Gate Criterion | Evidence Required | Status | Evidence Link |
|---|---|---|---|---|
| 1 | Every upload resolves in success / partial / error within 90s max | Timing logs from corpus test run showing worst-case | △ | `V3_CLIENT_POLICY.hardResolveMs = 90000` in both upload entry points; requires production timing evidence run |
| 2 | Progress indicator visible within 10s of upload start | Screen recording or screenshot | △ | `V3_CLIENT_POLICY.progressSlaMs = 10000` + `application_sla_breach` event instrumentation added; screenshot evidence pending |
| 3 | Usable result (full or partial) returned within 45s target | Timing logs from corpus run | △ | `V3_CLIENT_POLICY.usableTargetMs = 45000` + SLA telemetry added; corpus timing capture pending |
| 4 | Queue stall/failure auto-triggers direct parse fallback | Simulated queue failure + logs | △ | Both upload entry points now trigger fallback on stall + processor-failed codes; needs simulated failure evidence |
| 5 | Stale idempotency guard: re-upload of same file creates new job, does not attach to stuck/failed job | Test showing old job ignored, new job created | ☑ | `POST /api/ingestion/v3/jobs` no longer reuses idempotency matches and always creates fresh jobs |
| 6 | Fallback behavior identical across both upload entry points (`clients/page.tsx` and `ApplicationUpload.tsx`) | Side-by-side test under same failure condition | △ | Shared policy module `web/lib/ingestion-v3-client-policy.ts` now drives fallback code/status mapping in both flows; side-by-side run pending |
| 7 | Partial-result guarantee: failed full extraction still returns core partial data | Test with intentionally degraded PDF | △ | GCF processor adds completeness gate + fallback core extraction path; degraded-file proof pending |
| 8 | Core field completeness >= 80% on test corpus | Completeness report | △ | Existing 5-fixture corpus command currently passes (`npm run test:ingestion-corpus`); 10-real-file corpus report still required |
| 9 | AMAM-specific extraction produces usable output | AMAM corpus subset results | ☐ | Pending real-corpus run against both AMAM samples |
| 10 | Scanned PDF returns partial output or graceful message, not crash/hang | Test with scanned PDFs from corpus | △ | Existing fixture suite includes scanned case and passed; real scanned production-like PDF evidence pending |
| 11 | All user-facing errors are human-readable (no raw JSON, no provider errors) | Screenshot of every error state | △ | Error taxonomy mapping added to both UI paths and parse API; screenshot proof pending |
| 12 | PostHog telemetry events present for: upload success/fail, stall, fallback trigger, core-field completeness | PostHog event query showing events firing | △ | Event names implemented in analytics map + both upload entry points; PostHog query screenshot pending |
| 13 | Rollback path defined and tested | Document describing what to revert and confirmation it works | ☐ | Pending explicit rollback runbook and dry-run |

Rollback trigger: Revert immediately if post-deploy stall rate > 10% or upload success rate < 85%.

Execution artifacts:

- Deployment runbook: `PHASE2-DEPLOYMENT-CHECKLIST.md`
- Decision packet template: `GO-NO-GO-EVIDENCE-BUNDLE.md`
