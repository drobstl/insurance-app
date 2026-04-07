# CONTEXT.md — AgentForLife (AFL)

> Drop this in the repo root. Read it before any strategic or architectural decision.
> Last updated: April 7, 2026

## What This Is

AgentForLife (AFL) is an AI-powered client lifecycle platform for independent life insurance agents. It manages retention, referrals, client relationships, and automated touchpoints — with a branded mobile app that clients use directly.

**Strategic context:** AFL is becoming the post-sale module within the Closr AI platform (see "Closr AI Integration" below). It will continue to function as a standalone product but its primary distribution will be as a paid add-on for agents using Closr AI's agency dashboard.

## Who It's For

Independent life insurance agents selling mortgage protection, final expense, and term life remotely. The agent who benefits most is one who closes deals regularly and wants to retain their book, generate referrals from existing clients, and automate relationship maintenance.

## What It Does Today

### Client Management
- Manual add, CSV import (up to 400 rows), PDF application parsing, book-of-business PDF parsing
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
- Updated (March 2026): Deprecated transport branches were removed from active UI/API paths (`/api/upload`, Blob fallback paths, direct parse branches, and v2 ingestion routes in upload UIs). Legacy parse endpoints now return explicit deprecation responses and point to the v3 pipeline.
- Added (March 2026): Deploy gate for ingestion corpus is wired into `web` build (`npm run test:ingestion-corpus && next build`) with required 5-case corpus contract (tiny/large/multi-page/scanned/malformed).
- Important operational note: corpus fixture PDFs in `web/tests/ingestion-corpus/fixtures` are currently placeholders. Before production rollout, replace them with real redacted insurance application samples or the deploy gate is not a valid regression blocker.
- Added (March 2026): Phase 0 bulk local import hardening in the Clients BOB modal. Local import now supports mixed multi-file batches (CSV/TSV/XLSX/PDF) with incremental preview updates as each file finishes, per-file status/error tracking, partial-failure handling, and a source-agnostic queue abstraction designed so Google Drive ingestion can plug into the same pipeline in Phase 1. PDF parsing now runs through a configurable per-agent concurrency cap (`NEXT_PUBLIC_IMPORT_PDF_CONCURRENCY`, bounded) to protect extraction throughput under burst uploads. Added PostHog instrumentation for bulk import session start/file parse outcomes/session completion plus activation timing from first file drop to first successful client creation.
- Added (March 2026): Google Drive integration Task 1 backend foundation. Introduced server-side OAuth helpers and token persistence for `drive.readonly`, with Firestore integration storage at `integrations/{agentId}/google/drive`, OAuth state handling, and new API endpoints under `/api/integrations/google/*` (`auth`, `callback`, `disconnect`, `token`, `status`). Callback now redirects to `/dashboard` with success/error query params for UI handling.
- Added (March 2026): Google Drive connect/disconnect controls in Dashboard Settings. The account settings tab now checks Google integration status on load, supports connect (OAuth start + redirect), supports disconnect, and surfaces callback success/error state using dashboard query params.
- Added (March 2026): Google Drive Phase 1 is complete. Delivered Google Picker file selection in the Clients import flow, a new `/api/integrations/google/import` route that downloads Drive PDFs and stages them in GCS with idempotent ingestion-v3 job creation (`drive:{fileId}:{modifiedTime}:{sizeBytes}`), and dashboard UI support across both Settings (connect/disconnect state) and Clients (Connect Google Drive + Import from Google Drive actions). Drive imports now feed the same existing ingestion-v3 queue/process pipeline with no parser behavior changes from local uploads.
- Added (April 2026): Spanish messaging support for client lifecycle flows. Clients can now be marked with a preferred language (`en`/`es`), and outbound automated messaging paths use Spanish when set (welcome text/resend, referral follow-ups, conservation/review AI prompts, and birthday push copy).
- Added (April 2026): Mobile-first responsive dashboard shell for agents on phones (mobile top bar + bottom nav + mobile breakpoint layout tuning on core pages). Desktop/laptop layout is intentionally preserved with no design changes outside the new language controls.
- Added (April 2026): Ingestion signing resiliency + observability hardening. Implemented signed-upload canary checks (`/api/health/ingestion-signing`, `/api/cron/ingestion-signing-canary` every 15m), structured alert logs (`[ingestion-v3-alert]`) with typed error codes (`SIGNATURE_MISMATCH`, `INVALID_JWT_SIGNATURE`, etc.), and automatic client-side fallback from v3 signed-upload pipeline to direct parse endpoint when signed PUT fails with known signing errors (403 signature mismatch / invalid JWT) so client creation remains available during credential/signing incidents.
- Decision (March 2026): PDF ingestion hardening is now a four-phase delivery plan. Phase 1 is reliability-only (source retention on failures, durable run triggering, server-driven transient retries, and shared retry utility extraction) with no new user-facing features. Phase 2 adds the runtime extraction mode selector (`fast` vs `best_accuracy`) and backup LLM circuit-breaker fallback behind a feature flag. Phase 3 introduces typed error taxonomy and moderate hardening cleanups. Phase 4 adds observability dashboards and SLO alerting.
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
