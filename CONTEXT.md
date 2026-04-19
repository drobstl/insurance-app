> ⚠️ Canonical repo path: /Users/danielroberts/Developer/insurance-app — Always verify you are working in this directory before making any changes. The iCloud Desktop path is deprecated and should not be used.
# CONTEXT.md — AgentForLife (AFL)

> Drop this in the repo root. Read it before any strategic or architectural decision.
> Last updated: April 18, 2026 (evening)

## What This Is

AgentForLife (AFL) is an AI-powered client lifecycle platform for independent life insurance agents. It manages retention, referrals, client relationships, and automated touchpoints — with a branded mobile app that clients use directly.

**Strategic context:** AFL is becoming the post-sale module within the Closr AI platform (see "Closr AI Integration" below). It will continue to function as a standalone product but its primary distribution will be as a paid add-on for agents using Closr AI's agency dashboard.

## Who It's For

Independent life insurance agents selling mortgage protection, final expense, and term life remotely. The agent who benefits most is one who closes deals regularly and wants to retain their book, generate referrals from existing clients, and automate relationship maintenance.

## What It Does Today

### Client Management
- Manual add, CSV import (up to 400 rows), PDF application parsing, book-of-business PDF parsing
- Optional `clientSinceDate` (YYYY-MM-DD) on each client: when set (from extracted application signature date or manual edit), the dashboard **Client Since** column uses it instead of Firestore `createdAt` (when the record was added in AFL)
- Each client gets a unique code (e.g., X7K9-M2P4-Q8R1) for mobile app access
- Client detail view: policies, beneficiaries, referrals, contact history
- Per-client preferred language (`en`/`es`) for outbound messaging personalization

### AI Referral Pipeline
- Client shares app or sends group text → referral created
- AI assistant (NEPQ methodology) engages referral via iMessage/SMS through Linq
- Flow: group message → AI intro → 1-on-1 conversation → qualification → booking link
- AI gathers: DOB, health info, medications, smoker status, spouse, mortgage details
- Agents can view conversations, send manual messages, toggle AI per referral
- Automated 4-hour drip follow-ups

### Conservation (Retention)
- Detects at-risk policies from: forwarded carrier emails (AI-parsed), pasted text, manual flags
- Auto-matches to existing clients/policies
- AI outreach via SMS, push, or email with Day 2/5/7 drip
- Agent marks saved or lost

### Anniversary Rewrites
- Auto-flags policies approaching 1-year anniversary
- Two message styles: "check in" (relationship) or "lower price" (savings)
- AI-drafted outreach with drip follow-ups

### Automated Touchpoints (Cron-Driven)
- Birthday messages (daily 1 PM), holiday cards (daily 2 PM), policy anniversaries (daily 2 PM)
- Sent via push notifications to the client's mobile app

### Branded Client Mobile App
- White-labeled with agent's name, photo, logo
- Clients view policies, make one-tap referrals, receive push notifications, contact agent
- Live on iOS and Google Play at agentforlife.app

### Dashboard AI Assistant ("Patch")
- Claude-powered chatbot for platform questions and workflow guidance

### Stats & Gamification
- Tracks APV, policies saved, referrals won, touchpoints sent, appointment rate, save rate
- Badges for milestones

## Closr AI Integration (Critical — In Development)

AFL is being integrated as the post-sale module of Closr AI, an agency intelligence dashboard that captures call data automatically.

**The call-to-client pipeline:**
1. Agent closes a sale on a Closr AI-tracked call
2. AI has already extracted: client name, DOB, phone, health details, coverage, carrier, premium from the transcript
3. Agent confirms pre-populated data (10-second review)
4. AFL receives structured data via API → client record + policy record auto-created
5. Client app code generated, welcome SMS queued
6. Retention monitoring, referral eligibility, and touchpoint scheduling activate automatically

**This solves AFL's biggest adoption friction:** getting initial client data into the system. With the Closr AI pipeline, the data is there before the agent hangs up.

**Integration architecture:**
- Closr AI POSTs structured JSON to AFL's client creation endpoint
- Auth will unify under Clerk org model (Closr AI already uses Clerk)
- AFL subscription becomes a toggle within Closr AI's Stripe billing
- AFL retains standalone functionality for agents not using Closr AI

## Business Model

**As Closr AI add-on (primary distribution):** $29/agent/month. Available on automated seats only ($59/seat). Agency owner adds AFL to individual agents who are closing deals and need client lifecycle management. COGS: ~$3/agent (SMS, push, Claude). Margin: 90%.

**As standalone (legacy):**
| Tier | Price |
|------|-------|
| Founding | Free for life (limited, closed) |
| Charter | $25/mo or $250/yr |
| Inner Circle | $35/mo or $350/yr |
| Standard | $49/mo or $490/yr |

Standalone pricing remains for agents who come directly. Founding member migration path TBD.

## Stack

| Layer | Tech |
|-------|------|
| Mobile App | React Native (iOS + Android) |
| Backend | Firebase |
| AI | Claude (referral conversations, conservation outreach, entity extraction, self-learning) |
| Messaging | Linq (iMessage/SMS delivery) |
| Billing | Stripe |
| Auth | Currently Firebase Auth — migrating to Clerk for Closr AI unification |
| Analytics | Firebase Analytics + PostHog (web dashboard product analytics/session replay/heatmaps) |

## AI Architecture

- Single-source `ai-voice.ts` using NEPQ framework for all AI conversations
- Self-learning loop: analyzes completed conversations, extracts patterns, builds client personas, runs A/B experiments on messaging strategies
- Message critic gates outbound AI messages for quality

## Current Status

**Live:** iOS App Store, Google Play. Agent dashboard functional. Referral pipeline, conservation, anniversary rewrites, touchpoints all operational.

**Known Challenge:** Low activation among signups. Agents who signed up are not consistently using the platform. Root cause unknown — likely onboarding friction and/or the effort required to get client data into the system (which the Closr AI integration solves).

**Recent fixes (March 2026, founding member feedback):**
- Added (March 25, 2026): Cloud Tasks and v3 pipeline production deployment.
  - Cloud Tasks API enabled in GCP project `insurance-agent-app-6f613`, queue `pdf-ingestion-v3` in `us-central1` (max 5 concurrent, 3 max attempts, 10s-120s backoff, logging enabled).
  - Firebase admin service account granted Cloud Tasks Enqueuer + Service Account Token Creator roles.
  - Firebase service account key rotated (old key `fe14d00e` compromised and deleted, new key `eea3ae17843e` active).
  - Four Cloud Tasks env vars set in Vercel production: `CLOUD_TASKS_PROJECT_ID`, `CLOUD_TASKS_LOCATION`, `CLOUD_TASKS_QUEUE`, `INGESTION_V3_PROCESSOR_BASE_URL`.
  - v3 ingestion pipeline confirmed working end-to-end in production (single upload ~15s and bulk upload functional).
  - Bulk import reliability tuning shipped: auto-retry up to 2 attempts for transient/timeout errors, `DEFAULT_BULK_PDF_CONCURRENCY` increased from 3 to 5, processor route `maxDuration` increased from 60s to 120s.
  - Retry telemetry (`retry_attempt_count`) added to `BULK_IMPORT_FILE_PARSED` PostHog event.
  - Git repo restored after `.git` directory loss (fresh clone from GitHub, local changes synced and pushed, working repo at `~/Desktop/insurance-app` with clean history).
  - Duplicate files removed (`analytics-events 2.ts`, `posthog 2.ts`) and v3 TypeScript build errors fixed.
- Fixed (March 27-28, 2026): Critical v3 ingestion pipeline stabilization — four production-blocking issues resolved:
  1. **`@google-cloud/tasks` protobuf bundling failure on Vercel**: The gRPC client library's `protos.json` wasn't bundled by Vercel's serverless builder. Replaced with direct REST API calls to `cloudtasks.googleapis.com/v2` using `google-auth-library` for token minting. This avoids all native/protobuf bundling issues.
  2. **OIDC token `iam.serviceAccounts.actAs` 403 error**: Cloud Tasks requires `actAs` permission to mint OIDC tokens on behalf of a service account. Replaced OIDC token auth with HMAC-based webhook secret (`X-CloudTasks-Webhook-Secret` header). Secret is derived from the service account's `private_key_id` via `deriveWebhookSecret()` in `cloud-tasks.ts` — both the sender and the process route compute the same value with zero additional env vars.
  3. **Anthropic API 16 union-type limit on structured output schemas**: The `application-extractor.ts` schema had 17 `anyOf` unions (every nullable field counts). Reduced to exactly 16 by making `irrevocable` a plain `boolean` in the beneficiary sub-schema.
  4. **GCS signed URL PUT transient failures in browser**: The cross-origin PUT to `storage.googleapis.com` occasionally fails with `TypeError: Failed to fetch`. Added retry logic (up to 3 attempts with 500ms/1000ms backoff) in `ApplicationUpload.tsx`. PUT to a signed URL is idempotent so retries are safe.
  - **Env vars removed from Vercel**: `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL`, `INGESTION_V3_PROCESSOR_AUDIENCE` (no longer needed — OIDC tokens replaced with webhook secret).
  - **Dependency changes**: Removed `@google-cloud/tasks`, added `google-auth-library`.
  - **Architecture note**: The `cloud-tasks-invoker` service account is no longer used. All Cloud Tasks API calls authenticate as the Firebase admin service account directly.
- Added: PostHog web dashboard instrumentation (client SDK + provider + App Router pageview tracking + auth identify/reset) with event coverage for client add/remove, conservation interactions, rewrite flow milestones, onboarding step completion, settings updates, and Patch usage. Client PII is explicitly excluded from event properties; unresolved server-side events are marked with TODO hooks.
- Fixed: Client app session was lost on network errors, forcing code re-entry. Now retries and falls back to cached profile data; session only clears when the code itself is revoked.
- Fixed: Mortgage Protection policies now prominently display coverage duration (e.g., "30 Years") as the hero metric in both the client app and dashboard, with dollar amounts secondary. The agent form now requires this field and explains it will appear in the client's app.
- Shipped (March 2026): Ingestion v3 stabilization is now implemented as the primary upload/parse architecture. All single and bulk ingestion traffic routes through signed GCS upload URLs + Firestore job records + Cloud Tasks dispatch + OIDC-protected processor endpoint in Vercel. Added strict typed statuses and error taxonomy, stage metrics (`sourceFetchMs`, `extractionMs`, `validationMs`), typed retry/backoff semantics (5s/20s/60s with terminal `MAX_RETRIES_EXHAUSTED`), and structured ingestion-v3 telemetry logging for queue/process outcomes.
- Updated (March 2026): Deprecated transport branches were removed from active UI/API paths (`/api/upload`, Blob fallback paths, and v2 ingestion routes in upload UIs). **`POST /api/parse-application` remains implemented** as a server-side resilience path: the dashboard upload flows automatically fall back to it when v3 signed upload fails with known signing errors or when a v3 job ends in `INTERNAL_ERROR` / `CLAUDE_SCHEMA_INVALID`, so agents are not blocked while the primary pipeline is repaired.
- Added (March 2026): Deploy gate for ingestion corpus is wired into `web` build (`npm run test:ingestion-corpus && next build`) with required 5-case corpus contract (tiny/large/multi-page/scanned/malformed).
- Important operational note: corpus fixture PDFs in `web/tests/ingestion-corpus/fixtures` are currently placeholders. Before production rollout, replace them with real redacted insurance application samples or the deploy gate is not a valid regression blocker.
- Added (March 2026): Phase 0 bulk local import hardening in the Clients BOB modal. Local import now supports mixed multi-file batches (CSV/TSV/XLSX/PDF) with incremental preview updates as each file finishes, per-file status/error tracking, partial-failure handling, and a source-agnostic queue abstraction designed so Google Drive ingestion can plug into the same pipeline in Phase 1. PDF parsing now runs through a configurable per-agent concurrency cap (`NEXT_PUBLIC_IMPORT_PDF_CONCURRENCY`, bounded) to protect extraction throughput under burst uploads. Added PostHog instrumentation for bulk import session start/file parse outcomes/session completion plus activation timing from first file drop to first successful client creation.
- Added (March 2026): Google Drive integration Task 1 backend foundation. Introduced server-side OAuth helpers and token persistence for `drive.readonly`, with Firestore integration storage at `integrations/{agentId}/google/drive`, OAuth state handling, and new API endpoints under `/api/integrations/google/*` (`auth`, `callback`, `disconnect`, `token`, `status`). Callback now redirects to `/dashboard` with success/error query params for UI handling.
- Added (March 2026): Google Drive connect/disconnect controls in Dashboard Settings. The account settings tab now checks Google integration status on load, supports connect (OAuth start + redirect), supports disconnect, and surfaces callback success/error state using dashboard query params.
- Added (March 2026): Google Drive Phase 1 is complete. Delivered Google Picker file selection in the Clients import flow, a new `/api/integrations/google/import` route that downloads Drive PDFs and stages them in GCS with idempotent ingestion-v3 job creation (`drive:{fileId}:{modifiedTime}:{sizeBytes}`), and dashboard UI support across both Settings (connect/disconnect state) and Clients (Connect Google Drive + Import from Google Drive actions). Drive imports now feed the same existing ingestion-v3 queue/process pipeline with no parser behavior changes from local uploads.
- Fixed (April 2026): Google `invalid_grant` during token refresh (revoked/expired refresh token, OAuth Testing-mode limits, or rotated client secret) left Firestore showing “connected” while the Picker failed. Token and import routes now detect `invalid_grant`, clear the stale `integrations/{agentId}/google/drive` doc, return a clear reconnect message, and the Clients import modal refetches Drive status so the UI matches reality.
- Added (April 2026): Spanish messaging support for client lifecycle flows. Clients can now be marked with a preferred language (`en`/`es`), and outbound automated messaging paths use Spanish when set (welcome text/resend, referral follow-ups, conservation/review AI prompts, and birthday push copy).
- Added (April 2026): Mobile-first responsive dashboard shell for agents on phones (mobile top bar + bottom nav + mobile breakpoint layout tuning on core pages). Desktop/laptop layout is intentionally preserved with no design changes outside the new language controls.
- Added (April 2026): Ingestion signing resiliency + observability hardening. Implemented signed-upload canary checks (`/api/health/ingestion-signing` for UptimeRobot/monitoring, `/api/cron/ingestion-signing-canary` every 15m with `CRON_SECRET`), structured alert logs (`[ingestion-v3-alert]`) with typed error codes (`SIGNATURE_MISMATCH`, `INVALID_JWT_SIGNATURE`, etc.), processor-level failure classification (`diagnosticCategory` on terminal v3 failures for PostHog + `[ingestion-v3-alert] process failed`), and automatic fallback from the v3 pipeline to **`POST /api/parse-application`** when signed PUT fails with known signing errors or when the v3 job fails with `INTERNAL_ERROR` / `CLAUDE_SCHEMA_INVALID` (some carrier PDFs parse successfully on the direct path even when the async processor errors). Operational detail is in `OPERATIONS.md`.
- Added (April 2026): **Admin-only** “Upload Signing Health” strip on the dashboard home page: only users whose email appears in `NEXT_PUBLIC_ADMIN_EMAILS` (same mechanism as the Admin sidebar) see the indicator or poll the health route from the browser; external uptime checks still hit the public health URL unauthenticated.
- Added (April 9, 2026): PDF ingestion reliability audit + Phase 2 architecture reset.
  - **PDF Ingestion Pipeline Status (April 9, 2026):** The v3 PDF ingestion pipeline (`ingestionJobsV3`) has persistent reliability failures in production. Firestore job-document audit found four dominant failure modes:
    1. `TASK_ENQUEUE_FAILED` — dispatch/orchestration failures in the Vercel serverless path (most common; jobs never reach extraction).
    2. `MAX_RETRIES_EXHAUSTED` with null metrics — processor crashes before writing diagnostics, leaving no usable failure data.
    3. `INTERNAL_ERROR` — generic catch-all failures with no captured real error string.
    4. `CLAUDE_SCHEMA_INVALID` — extraction executes but Claude output is malformed (seen repeatedly on dense AMAM forms).
  - **Architecture Decision — Phase 2:** Processing is moved out of Vercel into a Google Cloud Function (Gen 2). Vercel is now responsible for UI, signed upload URL initiation, Firestore job creation (`status: "queued"`), polling, and retry initiation. The Cloud Function owns extraction, validation, fallback re-extraction, retry decisions, and writes results/metrics/errors to Firestore. Cloud Tasks is removed from the active ingestion pipeline (may be reintroduced later only for rate limiting at scale).
  - **Product contract for ingestion reliability:** Partial success is the default. Any job with 4+ core fields and at least one name is marked `review_ready`; jobs only hard-fail when minimum viability is not met or source/config is unrecoverable. Source PDFs are never deleted on failure. Every failed job must include a specific error code and real error message.
- Added (April 9, 2026): Test corpus assembled for extraction deploy-gate validation (10 real applications across 8 carriers):
  1. Foresters — Term Life (clean baseline)
  2. Mutual of Omaha — Term Life
  3. Mutual of Omaha — Critical Illness (supplemental health form)
  4. Americo — CBO 100 (`ICC18 5160`)
  5. Americo — IUL (same base form + different product selection + 14-page illustration)
  6. American-Amicable (AMAM) — dense single-page, hardest parser case
  7. United Home Life (UHL) — Simple Term 20 DLX eApp
  8. AIG (American General) — Guaranteed Issue Whole Life (short/simple)
  9. Banner Life / Legal & General America — Quility Term Plus 15 (longest, multi-part, 28+ pages)
  10. Second AMAM application — hardest-carrier repeatability check
  - Deploy-gate pass criteria: >=80% core field completeness across all 10 files, and zero false data (null is acceptable; incorrect extracted values are not).
- In progress (April 9, 2026): Phase 2 implementation cutover has started in code:
  - Vercel `POST /api/ingestion/v3/jobs` now creates queued job docs and returns immediately (no dispatch orchestration call).
  - New Firestore-triggered GCF package scaffold added at `gcf/ingestion-v3-processor` (lock + throttle + extraction + fallback + completeness gate + zombie cleanup baseline).
  - Vercel processing endpoint `/api/ingestion/v3/jobs/[jobId]/process` is explicitly deprecated (HTTP 410) to prevent accidental use.
  - Client upload entry points now share 16 MB limits, unified fallback/error policy, and standardized telemetry event names for release-gate tracking.
- Updated (April 13-14, 2026): Application extraction now uses an image-first ingestion path with carrier PAGE_MAP + carrier prompt supplements.
  - The dashboard no longer uploads raw application PDFs for extraction. It renders selected pages client-side with `pdfjs-dist`, encodes them to JPEG (<200 KB/page target), uploads those images to GCS, and creates ingestion jobs with `gcsImagePaths`.
  - Client-side carrier mappings now include: `americo_icc18_5160` (1/2/5), `americo_icc18_5160_iul` (1/2/5/21/22), and `americo_icc24_5426` (1/2/3/4/5). Unmapped form types (including `unknown`) fall back to rendering the first `MAX_APPLICATION_RENDER_PAGES`.
  - The Cloud Function processor downloads ordered `gcsImagePaths`, sends ordered `image/jpeg` blocks to Claude, and appends carrier-specific prompt supplements (image-position based guidance) when `carrierFormType` has a supplement entry.
  - Dashboard application type labels are now: "Americo - Term or CBO", "Americo - IUL", "Americo - Whole Life", and "Other Carrier".
  - The direct `/api/parse-application` fallback remains in place as a resilience path for specific signed-upload/job error classes.
- In progress (April 2026): Carrier-template guidance rollout for application parsing is expanding in production:
  - Non-application classifier step is active before extraction; non-application files fail with explicit terminal code `DOCUMENT_NOT_APPLICATION`.
  - Carrier guidance is now delivered through dedicated prompt supplement entries keyed by `carrierFormType`, with image-position instructions aligned to PAGE_MAP ordering.
  - UI error mapping shows a clear user-facing message when a file is not recognized as an insurance application.
- Added (April 15-18, 2026): Carrier extraction coverage expansion and pipeline hardening.
  - **Seven new carrier/form types shipped to the v3 pipeline** (dropdown entry + PAGE_MAP + carrier supplement + overrides where applicable):
    - `amam_icc15_aa9466` — American-Amicable Mortgage Protection (Final Expense / Dignity Solutions); multi-beneficiary addendum handling, AA9903 Bank Draft guardrail, policyNumber returns null (M-number is internal tracking only).
    - `amam_icc18_aa3487` — American-Amicable Term; covers both Home Certainty (11-page, primary) and legacy Express Term (9-page). One supplement handles both via page-1 form-number detection. Name concatenation rules, `None`/`N/A` email handling, primary+contingent beneficiary capture, bank guardrail against AA9903 and embedded PREAUTHORIZATION CHECK PLAN block.
    - `foresters_icc15_770825` — Foresters Term Life (clean baseline form).
    - `moo_icc22_l683a` — Mutual of Omaha Term Life Express and IUL Express (18-page shared form); supplement derives `policyType` from the checked Plan Info box (Term vs IUL).
    - `moo_icc23_l681a` — Mutual of Omaha Living Promise (Level Benefit and Graded Benefit, both Whole Life, 13-15 page variants).
    - `moo_ma5981` — Mutual of Omaha Accidental Death (5-page standalone product, `policyType` hardcoded to Accidental).
    - `banner_lga_icc17_lia` — Banner Life / LGA Term (pages 1-9 + 11).
  - **Americo Term/CBO full-package support.** PAGE_MAP expanded from `[1, 2, 5]` to `[1, 2, 5, 7, 8]` so the Bank Draft (page 7) and Premium Conditional Receipt AAA8482 (page 8) reach Claude; policy number now extracts from Bank Draft and effectiveDate from the "on (Month/Day/Year)" field on the Conditional Receipt. Short-form 5-page variant handled by tolerant renderer.
  - **`CARRIER_FORM_TYPE_OVERRIDES` table introduced** in `gcf/ingestion-v3-processor/src/index.ts` as a code-side deterministic override for `policyType` and `insuranceCompany`. Replaces the prior per-carrier `if` branches. Currently: Americo Term, AMAM Dignity, AMAM Term. AMAM Dignity migrated from supplement-only enforcement to code-side override (supplement prompt rules retained as secondary signal).
  - **Universal `effectiveDate` fallback in `normalizeApplication`.** Any form with a null/blank effective date now falls back to `applicationSignedDate` so downstream workflows always have a reasonable policy start date. Applies across all carriers.
  - **Tolerant PAGE_MAP renderer** skips absent pages rather than failing, enabling one supplement to cover multiple page-count variants of the same form family.
  - **Compiled `lib/` output checked in** for `gcf/ingestion-v3-processor`. Without this rebuild the deployed Cloud Function would treat new form types as `unknown` and skip carrier overrides/supplements.
  - **Firestore-index-free zombie cleanup** restored in the Cloud Function after the previous implementation required an index that could not be reliably provisioned in all environments.
- Fixed (April 18, 2026): MOO Living Promise beneficiary extraction bug (`moo_icc23_l681a`) in production.
  - Root cause: supplement text incorrectly instructed Claude to return empty beneficiaries for ICC23L681A.
  - Fix shipped and deployed in `gcf/ingestion-v3-processor`: beneficiary guidance now extracts Primary/Contingent rows from Image 3 (PDF page 5) when present, returning empty array only when the section is blank.
  - Validation impact: Living Promise beneficiaries now populate reliably for current/future jobs; historical records are unchanged unless manually corrected.
- Updated (April 18, 2026): Extraction smoke-test playbook hardened (`gcf/ingestion-v3-processor/TESTING.md`).
  - Added/filled concrete expected values for Robin Howard (Americo IUL) from review-card validation.
  - Replaced malformed Corebridge/AIG unknown-path fixture (`Tim Olwin`) with cleaner `Francis Hanson AIG.pdf` as primary unknown-path regression sample.
  - Clarified fixture notes: Brenda Henry beneficiary entry is valid (daughter with same first name), Tim fixture retained only as optional malformed-input edge-case.
- Fixed (April 17-18, 2026): Dashboard Add Client flow UX corrections.
  - Four date pickers in the Add Client form are now explicitly labeled (previously two of them rendered as bare mm/dd/yyyy with no clue what they mapped to).
  - Review & Confirm card restructured: sticky header + sticky footer (Cancel / Confirm & Create always visible), scrollable middle band, bottom gradient fade, floating "Scroll for more" pill with bouncing chevron that auto-hides at the bottom, branded always-visible scrollbar, and cleaned-up slide transition (horizontal clipping fixed, 560ms → 700ms for a calmer feel).
- Fixed (April 17, 2026): Retention conversation view hides legacy duplicate draft/sent entries that were polluting the timeline.
- Updated (April 17, 2026): Conservation outreach copy clarified and booking links improved.
- Known issues / next session:
  - "0 pages" metadata bug in extraction summary.
  - Bulk import intelligence notes are concatenated into an unreadable wall of text (needs per-file collapsible notes).
  - "Import Book of Business" naming is confusing for agents uploading a few PDFs (not a CSV dump).
  - Single-file Upload Application modal does not support multi-select.
  - Dashboard auth "Checking account access" spinner hangs on load.
  - PostHog instrumentation files for Closr AI are still uncommitted.

**Founding Member Program:** First 50 agents free for life. This commitment needs a migration path as AFL becomes a Closr AI module.

## Key Decisions Made

- AFL will become a Closr AI add-on module (not merged/rebranded — retains its identity)
- The call-to-client pipeline is the integration priority
- Auth migration from Firebase to Clerk is required for unification
- Standalone access remains available for agents not on Closr AI
- NEPQ methodology is the foundation for all AI-generated messaging
- Linq handles iMessage/SMS (migrated from SendBlue)

## PDF Application Extraction Pipeline (April 14, 2026)

> This section is the single source of truth for how PDF application upload and extraction works. If any Cursor session or Claude conversation describes a different architecture, this section takes precedence.

### Architecture

1. Agent selects an application type from a dropdown in the dashboard (e.g., "Americo - Term or CBO")
2. The selection maps to a `carrierFormType` key (e.g., `americo_icc18_5160`)
3. Client-side `PAGE_MAP` determines which PDF pages to render for that carrier (e.g., pages 1, 2, 5). If a form type is unmapped (including `unknown`), the client falls back to rendering the first `MAX_APPLICATION_RENDER_PAGES` sequentially.
4. Dashboard renders those pages to JPEG using `pdfjs-dist` (scale 1.62, quality 0.80) via `web/lib/pdf/render-selected-pages-to-jpeg.ts`
5. JPEGs are uploaded to GCS via signed URLs
6. Ingestion job is created in Firestore (`ingestionJobsV3`) with `gcsImagePaths` array
7. Cloud Function (`gcf/ingestion-v3-processor`) triggers on job creation, downloads JPEG images from GCS
8. Sends base64 JPEG image blocks to Claude Sonnet 4.6 with `GENERIC_APPLICATION_SYSTEM_PROMPT` plus carrier supplement text when available for that `carrierFormType`
9. No `output_config` or `json_schema` — Claude returns unstructured JSON based on prompt instructions
10. `safeJsonParse` strips markdown code fences, then `normalizeApplication` normalizes the result
11. Completeness gate evaluates core fields; if passing, job status set to `review_ready`
12. Dashboard polls Firestore and picks up extracted data for agent review

### Key implementation details

- **No `output_config`:** Removed because the Anthropic API rejected the schema as "too complex" (16 union-type limit on structured output). Claude relies entirely on the system prompt for output format.
- **JPEG, not native PDF:** Native PDF sending as base64 document blocks timed out at 90+ seconds for 6-8 MB files. The JPEG path gets ~5 second Claude responses.
- **`PAGE_INSTRUCTIONS` was removed from the GCF processor.** Carrier-specific page selection happens client-side via `PAGE_MAP`. The GCF processor receives only ordered page images and does not receive page-number metadata.
- **Carrier prompt supplements are now active.** `buildApplicationSystemPrompt(carrierFormType)` appends supplement text from `gcf/ingestion-v3-processor/src/carrier-prompt-supplements.ts` when a matching entry exists; otherwise it returns `GENERIC_APPLICATION_SYSTEM_PROMPT`.
- **Supplements use image positions, not PDF page numbers.** Guidance references "Image 1/2/3..." because Claude receives ordered image blocks, not native PDF page metadata.
- **Resilience fallback still exists.** The dashboard retains a direct `/api/parse-application` fallback path for specific signed upload failures and select v3 job failures (`INTERNAL_ERROR` / `CLAUDE_SCHEMA_INVALID`).
- **`CARRIER_FORM_TYPE_OVERRIDES` (code-side deterministic overrides).** A lookup table in `gcf/ingestion-v3-processor/src/index.ts` locks `policyType` and `insuranceCompany` per `carrierFormType`, authoritative over Claude's classification. The agent-selected dropdown is the source of truth for these two fields. This runs alongside supplement-prompt rules (preferred pattern for new carriers). Currently populated for: Americo Term, AMAM Mortgage Protection, AMAM Term, Foresters Term, MOO Term/IUL Express (insuranceCompany), MOO Living Promise, MOO Accidental, and Banner/LGA Term.
- **Universal `effectiveDate` fallback.** `normalizeApplication` falls back to `applicationSignedDate` as the effective date whenever a form does not carry one (e.g. AMAM "On Approval", MOO post-issuance assignment, or any blank effective-date field). Applies to every carrier so downstream workflows always have a reasonable policy start date.
- **Tolerant PAGE_MAP renderer.** When a carrier form has multiple page-count variants that share extraction semantics (Americo Term 5-page short vs 9-page full; AMAM Term 9-page Express vs 11-page Home Certainty; MOO Living Promise 13-15 pages), the client-side renderer skips absent pages rather than failing, and the carrier supplement handles the reduced image set.

### GENERIC_APPLICATION_SYSTEM_PROMPT FIELD RULES

The system prompt includes explicit FIELD RULES for all 16 extraction fields:
insuredName, insuredPhone, insuredEmail, insuredState, renewalDate, policyOwner, beneficiaries, coverageAmount, premiumAmount, premiumFrequency, policyNumber, policyType, insuranceCompany, insuredDateOfBirth, effectiveDate, applicationSignedDate.

The four fields insuredPhone, insuredEmail, insuredState, and renewalDate were added on April 14, 2026 to fix null extraction for those fields. The root cause was that they existed in the code schema but had no FIELD RULES guidance in the prompt — Claude only extracts fields it has explicit instructions for.

### Carrier page mappings (current)

| Carrier Form Type | Label | Pages |
|---|---|---|
| `americo_icc18_5160` | Americo - Term or CBO | 1, 2, 5, 7, 8 |
| `americo_icc18_5160_iul` | Americo - IUL | 1, 2, 5, 21, 22 |
| `americo_icc24_5426` | Americo - Whole Life | 1, 2, 3, 4, 5 |
| `amam_icc15_aa9466` | American-Amicable - Mortgage Protection | 1, 2, 4, 5, 6 |
| `amam_icc18_aa3487` | American-Amicable - Term | 1, 2, 4, 5 |
| `foresters_icc15_770825` | Foresters - Term Life | 1, 2, 3, 8, 9, 10 |
| `moo_icc22_l683a` | Mutual of Omaha - Term Life Express / IUL Express | 4, 5, 7, 8 |
| `moo_icc23_l681a` | Mutual of Omaha - Living Promise | 3, 4, 5 |
| `moo_ma5981` | Mutual of Omaha - Accidental Death | 1, 2 |
| `banner_lga_icc17_lia` | Banner Life / LGA - Term | 1, 2, 3, 4, 5, 6, 7, 8, 9, 11 |

### Testing Results (April 14-15, 2026)

| Test | Carrier/Form | Result | Notes |
|---|---|---|---|
| Term (Craig Pippin) | `americo_icc18_5160` | ✅ 16/16 fields | Policy number correctly null (not in PAGE_MAP pages). Signed date extracted from page 5. |
| IUL (Robin Howard) | `americo_icc18_5160_iul` | ✅ All fields | Policy number `AM02854798` from Bank Draft (page 21). Signed date correctly null (blank on page 5). Conditional Receipt fallback (page 22) added after this test - untested. |
| Whole Life (Barbara Seaton) - attempt 1 | `americo_icc24_5426` | ❌ Cross-contamination | Policy number showed `AM02854798` (Robin Howard's). Likely stale state from canceling previous flow. |
| Whole Life (Barbara Seaton) - attempt 2 | `americo_icc24_5426` | ❌ Empty policy number | Old PAGE_MAP was `[1, 2, 4]` but Bank Draft was on page 3. PAGE_MAP since updated to `[1, 2, 3, 4, 5]`. Needs re-test. |

### Open Items (Priority Order)

1. Re-test Whole Life with updated PAGE_MAP `[1, 2, 3, 4, 5]` and scanning supplement. Use Barbara Seaton PDF (Bank Draft on page 3, expected policy number `AM02488865`).
2. Re-test IUL Conditional Receipt fallback. Robin Howard's page 5 signature date was blank - verify that Image 5 (Conditional Receipt, page 22) now provides the date `11/18/2025`.
3. Document `unknown` carrier handling. Current behavior works (renders first N pages, no supplement, base prompt does best-effort). Just needs to be intentional and documented.
4. Production validation pass across the newly-added carriers (AMAM Mortgage Protection, AMAM Term, Foresters, all three MOO forms, Banner/LGA) — each currently has supplement + PAGE_MAP shipped but limited real-world sample coverage.

### Key files

- `gcf/ingestion-v3-processor/src/index.ts` — Cloud Function: download images, call Claude, normalize, completeness gate
- `web/lib/pdf/render-selected-pages-to-jpeg.ts` — Browser PDF-to-JPEG rendering utility
- `web/app/dashboard/clients/page.tsx` — PAGE_MAP, application type dropdown, upload flow, job polling
- `web/lib/ingestion-v3-store.ts` — Job creation with `gcsImagePaths`
- `web/lib/ingestion-v3-types.ts` — Type definitions including `gcsImagePaths`
- `web/app/api/ingestion/v3/jobs/route.ts` — API endpoint for job creation

### Repository rule

The canonical working repo is `/Users/danielroberts/Developer/insurance-app`. The iCloud Desktop copy (`~/Library/Mobile Documents/com~apple~CloudDocs/Desktop/insurance-app`) is stale and must not be used for development. Always verify you are in the Developer path before making changes.

## Open Questions

- Is the mobile app essential at launch of the Closr AI integration, or can client lifecycle features work via SMS/email/web first?
- What's the right AFL add-on price point within Closr AI? ($25 vs $35 vs $49)
- How do founding members transition? (Free-for-life commitment + new platform structure)
- Should the referral pipeline be accessible from the Closr AI dashboard directly, or only through AFL?
- What drove low activation? Onboarding friction? Data entry burden? Unclear value prop? Need agent interviews.

## IP & Legal

- AgentForLife trademark filed with USPTO
- Provisional patent filing deadline: January 2, 2027 (covers self-learning system, call-to-client pipeline, AI referral methodology)
- Terms of Service, Privacy Policy, and EULA recently updated
- Apple Developer Program enrolled under Brainstorm Labs LLC
- Domain: brainstormlabs.co (primary), support@agentforlife.app (alias)

## Company Context

Brainstorm Labs LLC, founded by Daniel (CEO). Based in St. Louis. Daniel is also an active independent insurance agent under Symmetry Financial Group / Crosswinds Financial Group. He holds a JD from SLU. ARCH Grants 2026 application is active — AFL and Closr AI are the core of the pitch.
