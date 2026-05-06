> ⚠️ Canonical repo path: /Users/danielroberts/Developer/insurance-app — Always verify you are working in this directory before making any changes. The iCloud Desktop path is deprecated and should not be used.
# CONTEXT.md — AgentForLife (AFL)

> Drop this in the repo root. Read it before any strategic or architectural decision.
> Last updated: May 5, 2026

## Source-of-Truth Documents

These three documents are authoritative for the operating model and pricing. When they conflict with each other, the precedence order is:

1. `docs/AFL_Strategy_Decisions_2026-05-04.md` — the May 4, 2026 strategy session decisions. Wins over v3.1 and v3 wherever they conflict.
2. `docs/AFL_Messaging_Operating_Model_v3.1.md` — channel architecture, lane rules, capacity model, KPI tier system, phased rollout.
3. `docs/AFL_Pricing_Packaging_Playbook_v3.md` — tier structure, founding-member treatment, overage mechanics, pricing-page design, Concierge add-on.

Supporting Linq documents (compatible with the above):

- `docs/linq-messaging-safety-policy.md` — source-labeled deliverability guidance.
- `docs/linq-scale-playbook.md` — scaling tension, lane priorities, pilot plan, near-90% gross margin guardrail.
- `docs/linq-decision-record-2026-05.md` — Linq operator confirmations record.

Phase 1 working notes (extends the strategy doc; locked decisions in §1–§3, open product questions in §4–§10):

- `docs/AFL_Phase_1_Planning_Notes_2026-05-04.md` — May 4, 2026 evening Phase 1 scoping conversation. The §1–§3 decisions (welcome flow Step 1 mobile-only on the agent side; PWA install + Web Push as hard onboarding gates; three implementation implications) are **locked** and have been folded into `Channel Rules > The two-step welcome flow` and `Phased Roadmap > Phase 1` below. The §4–§10 product questions are partially answered ad-hoc in agent sessions and partially still open — see `Open Questions > Phase 1 product questions still open` for the unresolved subset that gates Track B and Track C kickoff.

Candidate ideas (filed for future revisitation, not committed):

- `docs/referral-lane-inbound-initiation-idea.md` — proposal to mirror the welcome-flow client-initiated pattern in the referral lane to remove AFL's only remaining cold AI-initiated outbound on the Linq line. Phase 2 revisit candidate; gated by KPI tier dashboard data.

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
- **Channel rule (May 4, 2026):** push only, no fallback. See `Channel Rules` section. `REVIEW_STAGE_FALLBACK_ORDER` is now `['push']` for every stage and `REVIEW_STAGE_COMPLEMENT_EMAIL` is empty (Phase 0 hotfix shipped May 4, 2026 — see `Recent fixes`).

### Automated Touchpoints (Cron-Driven)
- Birthday messages (daily 1 PM), holiday cards (daily 2 PM), policy anniversaries (daily 2 PM)
- Sent via push notifications to the client's mobile app
- **Channel rule:** birthday, holiday cards, and policy anniversaries are all push-only with no fallback in production. The anniversary lane was brought into compliance by the May 4, 2026 Phase 0 hotfix (commit `ac4144d`); birthday and holiday cards already operated this way. If a client does not have push enabled, the cycle ends silently for that client until the next scheduled cycle.

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
- **Pricing for the Closr AI bundle is deferred** until Closr AI exits MVP. AFL standalone pricing (see `Business Model`) launches independently.

## Channel Rules

These rules apply to every outbound flow. They are the single source of truth for which channel a given lane uses; lane-specific code paths must conform. Source: strategy decisions §1–§2 and v3.1 §3–§4.

### Universal precedence
1. **Push** if the client has the app installed AND notifications are allowed (and the token is valid and not revoked — see `Push permission lifecycle` below). Used for every lane that supports push delivery.
2. **Agent-phone SMS via one-tap** for the welcome lane (the client doesn't have the app yet).
3. **Linq pooled-line SMS** only when push is unavailable (notifications off or app uninstalled), or when push has been delivered and didn't resolve a retention attempt within 5 days. Always subject to KPI tier thresholds.
4. **Email** as fallback or third-touch step. Always available; never gated by line health.

The rule is about behavioral consent, not behavioral activity. App dormancy is **not** a disqualifier — most clients won't open the AFL app for months at a time, and that's correct product behavior. Permission is.

### Per-lane channel matrix

| Lane | Primary | Escalation | Fallback | Pooled-line SMS allowed? |
|------|---------|------------|----------|--------------------------|
| New client activation (welcome) — Step 1 | Agent-phone one-tap (app link + login code) | Email at day 7 if no agent send | — | No for the welcome itself |
| New client activation — Step 2 | Client-initiated inbound to Linq via in-app Activate button; Linq first response includes agent vCard + thumbs-up ask | — | — | Inbound only |
| Anniversary policy review | Push | — | — | **Never. Architectural, not tunable.** Push only, no fallback (strategy §1 overrides v3.1 §4.2). |
| Lapse / Retention | Push | 1st SMS automatic | Agent action item surfaced when 1st SMS goes 48h without reply OR 5d unresolved (whichever fires first); if agent toggles AI back on, chain resumes with email + final SMS at end of campaign; 60-day quiet after campaign | Yes (1st SMS automatic + agent-toggled escalation) |
| Referral | Existing client one-tap from their app → group SMS to prospect from referrer's personal phone | AI on Linq line continues qualification 1:1 | — | Yes (continuation) |
| Beneficiary | **Push primary for cold contact.** No cold outreach via any channel. SMS/email available for **activated** beneficiaries as future tools (strategy §2 preserves channel flexibility — not push-only locked). | Push only today; SMS/email reserved for Phase 2/3 testing | — | Inbound only today |
| Holiday cards | Push | — | — | **Never.** |
| Birthday cards | Push | — | — | **Never.** |
| Bulk import (onboarding ceremony) | Agent-phone one-tap (drip) or email blast | — | — | **Never** (architectural, confirmed by Linq) |

**Anniversary, holiday cards, birthday cards = push only, no fallback.** If the client does not have push enabled, the cycle ends silently for that client until the next scheduled cycle. This is the May 4, 2026 strategy decision (§1) and overrides v3.1 §3.2 / §4.2's email fallback for anniversary.

### The two-step welcome flow

This is the single most consequential mechanism in the operating model.

- **Step 1 — Agent's personal phone (one-tap).** After PDF auto-extract creates the client profile, the dashboard surfaces a "Send from my phone" button. Tapping it opens native iMessage with a pre-filled draft from the agent's own number. The message contains a personal greeting, the AFL app download link, the client's login code, and the instruction: *"Open it up and tap Activate so we're all connected — and turn on notifications so I can reach you when it matters."*
- **Step 2 — Client taps Activate in the app.** The Activate button uses the `sms:` URL scheme to compose a pre-filled text **from the client to the Linq line** (e.g., *"Hi [Agent], it's [Client] — I'm set up on the app!"*). The client initiates the Linq-side conversation themselves.
- **Linq line first response.** Includes the agent's vCard (MMS attachment) and a thumbs-up reciprocity ask: *"Save my contact so you'll always know it's me — and shoot back a thumbs up so I know we're connected. Carriers sometimes block messages and that's how I'll know you're getting them."*

Why this works: client-initiated inbound is the gold standard for carrier deliverability and consent provenance. Linq has confirmed (May 2026) that **client-initiated inbound conversations do not count against the 50-per-day outbound new-conversation cap**.

#### Phase 1 implementation constraints (locked May 4, 2026 evening)

These constraints tighten the v3.1 §9.3 "mobile-primary with desktop fallback" framing into a stricter mobile-only posture for the welcome lane. Source: `docs/AFL_Phase_1_Planning_Notes_2026-05-04.md` §1–§3.

- **Welcome Step 1 is mobile-only on the agent side.** The "Send from my phone" button only exists on the mobile dashboard. **No desktop send fallback is built** — not via deep link, not via QR code, not via Continuity. On desktop, the dashboard surfaces the welcome queue (so an agent at their workstation can see what's pending) but the action surface is read-only with an explicit "Open AFL on your phone to send" affordance. Rationale: the `sms:` URL scheme behaves inconsistently across desktop OS + phone combinations (iPhone-paired Mac via Continuity is the only clean path; Mac+Android, Windows-without-Phone-Link, Chromebook all fail silently or partially); locking the welcome send to the agent's phone eliminates a 10–20% silent-failure surface and standardizes the workflow.
- **Agent PWA install + Web Push are Phase 1 onboarding requirements.** Because the welcome send is mobile-only, every agent must (a) install AFL to their phone home screen as a PWA and (b) grant agent-side Web Push permission. Without both, the welcome flow does not work for that agent — they have no way to be notified that a new client needs a welcome and no fast surface to send it from. These are **hard onboarding gates**, not "nice to haves." The April 26, 2026 milestone-driven onboarding flow needs to be extended with two new milestones: PWA install (with iOS Add to Home Screen + Android install prompt handling) and Web Push permission grant.
- **Agent-side Web Push is separate infrastructure from client-side Expo push.** Client-side push runs through Expo on the React Native mobile app and is governed by the Track A push permission lifecycle. Agent-side Web Push runs through a different stack (Web Push API via service worker) on the agent's PWA and is new infrastructure for Phase 1. Web Push works on iOS 16.4+ and current Android. Don't conflate the two when designing Track B.

### Identity on the Linq line

Automated messages on the Linq line are **signed under the agent's name** (NEPQ-tuned voice). EA-persona framing was considered and **deferred** as a future architectural option. The agent's office line is framed in client-facing copy as "my office line." Triggers for revisiting EA framing: AFL grows past ~100 active agents and per-agent voice consistency becomes a maintenance burden, regulatory inquiry, or AFL pursues direct AMB registration with Apple.

### Thumbs-up reciprocity mechanic

Used deliberately, not on every message:

- **Use it on:** first Linq response after activation, time-sensitive sends (call confirmations, scheduling). (Note: v3.1 §3.4 listed "anniversary check-ins via SMS fallback" as a use case; that case no longer exists because anniversary is push only with no fallback per strategy §1 and the Phase 0 hotfix `ac4144d`.)
- **Don't use it on:** routine FYI messages (holiday/birthday cards), conversation continuation in active threads, every message reflexively.

### vCard generation

Server-side, per-agent, regenerated when the agent's name or photo changes. Embedded JPEG photo at ~400×400, 75–80% quality, kept under 60 KB so the MMS payload stays safely under 100 KB. Two photo derivatives stored on agent profile photo upload — display version (dashboard / in-app profile) and vCard version (compressed). The vCard rides with the Linq line's first response after activation; the `sms:` URL scheme cannot attach files, so the agent-phone welcome is text-only.

### Beneficiary invite mechanic

Architecturally identical to client activation, with the policyholder as initiator:

1. Each adult beneficiary on a policy has an Invite button in the policyholder's app.
2. Policyholder taps Invite → iMessage opens with a pre-filled welcome from the policyholder's phone (download link + login code tied to a beneficiary profile).
3. Beneficiary downloads, enters code, lands on a screen that surfaces their role on the policy and the agent's contact info.
4. Beneficiary taps Activate → `sms:` URL scheme composes a pre-filled outbound to the Linq line.
5. Linq line responds with the agent's vCard, a thumbs-up ask, and a brief plain-English claim-time note.

Three invite prompts run in parallel: during policyholder activation, during annual beneficiary verification, and always-on access from the policyholder's app.

**Hard rule:** no cold beneficiary outreach via any channel. Beneficiaries enter the AFL contact graph only via policyholder invite + activation. `BENEFICIARY_AUTO_REPLY_ENABLED` defaults to `false`. Cold beneficiary outreach today is push-only post-activation; the channel-flexibility extension in strategy §2 applies to **activated** beneficiaries only and is reserved for Phase 2/3 testing.

### Bulk import — three paths

A once-per-agent-lifecycle ceremony, never an ongoing feature. Linq has confirmed bulk import cannot run through the Linq line under any circumstances.

| Path | Mechanism | Best fit | Cost |
|------|-----------|----------|------|
| Path 1 — Onboarding Ceremony | Agent self-serve drip; ≤15 sends/day from agent personal phone for ~14 days | Books under 100; agents who want every client onboarded | Included in Growth/Pro/Agency |
| Path 3 — Hybrid (Email-Then-Invite) | Platform sends a one-time email blast; engaged subset pulled into agent-phone drip queue | Default for 100–300-client books | Included in Growth/Pro/Agency |
| Concierge | AFL operator imports list and runs welcome touches as the agent | 300+ client books | One-time fee: $1,500 email-only / $2,500 email + SMS |

Drip rules: max 15 conversations/day from any single new-agent import; 9am–6pm recipient-local; no weekends or Fri-after-4pm sends; at least three pre-approved content variants.

### Push permission lifecycle

**Shipped May 5, 2026 as Phase 1 Track A** (see `Recent fixes` →
`Fixed (May 5, 2026): Phase 1 Track A — Push permission lifecycle shipped`).

Behavior (now enforced by `web/lib/push-permission-lifecycle.ts`):

- When Expo's send response carries a permanent-failure error code
  (currently only `DeviceNotRegistered`; `MessageTooBig`,
  `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials` are
  payload/credential issues and do NOT invalidate tokens), AFL atomically
  deletes the stored `pushToken` and stamps `pushPermissionRevokedAt:
  <serverTimestamp>` on the same write. The invalidation runs in a Firestore
  transaction guarded against the stored token having been replaced by a
  concurrent re-registration from the mobile app.
- `pushPermissionRevokedAt` is the canonical field name. Its presence
  distinguishes "never opted in" (no token, no field) from "opted in then
  revoked" (no token + field set). Successful re-registration via
  `/api/push-token/register` clears the field and the lifecycle resets.
- Routing logic checks `isPushEligible(...)` (token present AND not revoked),
  not bare token presence. Centralized in `web/lib/push-permission-lifecycle.ts`
  and consumed by every push send call site.
- Lane-aware behavior:
  - Lanes WITH fallback (welcome, retention, beneficiary post-activation) →
    fall back to the next channel per the per-lane channel matrix.
  - Lanes WITHOUT fallback (anniversary, holiday cards, birthday cards) →
    short-circuit BEFORE Expo when the client is not eligible (so we don't
    accumulate noisy delivery failures on known-dead tokens), and end the
    cycle silently. Skip-reason taxonomy on policy review docs:
    `'push_unavailable' | 'push_revoked' | 'push_send_failed' | 'push_send_invalidated'`.

### Agent action item surface

When automated outreach reaches a lane-specific stopping point on a high-value lane, the platform surfaces the unhandled touchpoint as an action item in the agent dashboard. Each item offers one-tap personal-text (via the same `sms:` URL scheme mechanic Track B builds for the welcome flow) and one-tap call options. The action item is the agent's chance to take over with maximum warmth and zero Linq-line pressure.

This is **not** a universal rule. It applies only to the three lanes where automation reaching a stopping point loses material business value:

| Lane | Trigger that creates the action item | Options on the item | What happens to remaining automated escalation |
|------|--------------------------------------|---------------------|------------------------------------------------|
| Anniversary policy review | Push send fails or push is unavailable | Text personally, call, skip | Silent-end stays as automation's exit. The action item is the only continuation path. |
| Lapse / retention | First SMS sent and either (a) no reply within 48h, or (b) conversation status not moved to resolved/saved/closed within 5d, whichever fires first | Text personally, call, send templated email manually, **toggle AI back on**, skip | Automation **pauses** when the action item appears. If agent does not toggle AI back on, chain ends. If agent toggles AI back on, chain resumes with the second-touch email and one final SMS at the end of the campaign. 60-day quiet still applies after campaign ends. |
| Referral | AI's 24-hour follow-up bump goes unanswered (current "no further outreach" stopping point in v3.1 §4.4) | Text personally, call, skip (no email — referrals don't have email channel) | Automated outreach has already stopped at this point per v3.1 §4.4. The action item replaces "no further outreach" with "agent decides whether to reach out personally." |

Lanes that explicitly do **NOT** generate action items on failure:

- **Welcome:** Track B's one-tap "Send from my phone" is the primary channel from the start. The whole welcome flow IS an action queue by design; there's no failure to surface.
- **Beneficiary:** Cold outreach is invite-only via policyholder. There's no automated outreach failure to surface.
- **Holiday cards / birthday cards:** Soft greetings, low stakes. Silent-end on push-fail stays. Surfacing every undeliverable greeting as an action item creates dashboard noise without proportionate value.

Implementation contract:

- All action items write to a single `actionItems` Firestore collection with a generic schema spanning all lanes. Suggested shape: `{ agentId, clientId | prospectId, lane: 'welcome' | 'anniversary' | 'retention' | 'referral', triggerReason, suggestedActions, createdAt, expiresAt, completedAt, completedBy, completionAction, completionNote }`.
- Each lane sets its own `expiresAt` policy. Anniversary: 30 days. Retention: 7 days (high-priority, force handling). Referral: 14 days (warm-lead window decays).
- Action item creation is a side effect of the existing cron and webhook handlers; no new cron required.
- The dashboard surface reuses Track B's one-tap UI primitive. Same component, different data source.
- Telemetry (PostHog): `action_item_created`, `action_item_viewed`, `action_item_completed` with `lane`, `triggerReason`, `completionAction`. These are real engagement metrics for the agent activation funnel, not just dashboard nice-to-haves.

Phasing:

- **Phase 1 Track B** builds the underlying `actionItems` schema and the welcome-lane action queue. Schema is designed for forward-compat across all four lanes from day one, even though Track B only writes welcome entries to it.
- **Phase 2** adds the anniversary, retention, and referral writers, the per-lane expiration logic, and the retention "toggle AI back on" mechanic. Lapse/retention cadence rewrite (already on the Phase 2 backlog) absorbs this work.

## Phased Roadmap

This sequence supersedes the Phase 1 plan in v3.1 §11. Source: strategy decisions §5.

### Phase 0 — Anniversary hotfix (shipped May 4, 2026)
- **Status: complete.** See `Recent fixes` → `Fixed (May 4, 2026): Phase 0 anniversary push-only hotfix shipped` for full detail and file list.
- `REVIEW_STAGE_FALLBACK_ORDER` in `web/lib/conservation-types.ts` is now `['push']` for all four stages (`initial`, `followup_3d`, `followup_7d`, `followup_14d`). `REVIEW_STAGE_COMPLEMENT_EMAIL` is now `{}`.
- `policy-review` cron marks the policy with `policyReviewNotifiedAt` + `policyReviewSkippedReason` on push-unavailable so the cycle ends silently for ~365 days; `policy-review-drip` cron terminates the campaign (`status: 'drip-complete'`) on push-unavailable so it stops re-attempting every 4 hours. Both crons emit structured `[policy-review] skipped` / `[policy-review-drip] skipped` telemetry logs and return new `clientOutreachSkipped` / `dripsSkipped` counters.
- **Why this was urgent:** the prior order listed SMS as the *primary* channel on the day-3 and day-14 anniversary stages. Every anniversary check-in for a client without push permission was being routed through the Linq line — the single largest active bleed point on line reputation. Stopped before any further work.

### Phase 1 — Welcome flow + new pricing (next 6 weeks)
- New welcome flow (agent personal-phone one-tap + in-app Activate + Linq line vCard response + thumbs-up reciprocity ask). **Mobile-only on agent side; no desktop send fallback** (per `Channel Rules > The two-step welcome flow > Phase 1 implementation constraints`). **Status: complete (Track B, shipped May 5, 2026).** See `Recent fixes` for full detail and file list.
- Agent PWA install + agent-side Web Push as **hard onboarding gates** for Phase 1. Two new milestones added to the April 26 milestone-driven onboarding flow (PWA install with iOS Add to Home Screen + Android install prompt handling; Web Push permission grant). **Status: complete (Track B, shipped May 5, 2026).**
- Push permission lifecycle management (Expo error → token invalidation, `pushPermissionRevokedAt`, lane-aware fallback). **Status: complete (Track A, shipped May 5, 2026).** See `Recent fixes` for full detail and file list.
- vCard generation pipeline (server-side per agent, compressed photo, MMS attachment from Linq line). **Status: complete (Track B, shipped May 5, 2026).**
- Agent action item surface — `actionItems` Firestore schema + welcome-lane writers + dashboard one-tap UI primitive. Schema designed for forward-compat across welcome / anniversary / retention / referral lanes; only welcome writers ship in Phase 1. See `Channel Rules > Agent action item surface`. **Status: complete (Track B, shipped May 5, 2026).**
- Welcome flow analytics in PostHog (agent send compliance, app activation rate, thumbs-up rate). **Status: complete (Track B, shipped May 5, 2026).** Generic `action_item_*` cross-lane funnel events plus welcome-specific `welcome_send_*` / `client_activated` / `client_activation_thumbs_up_received` / `welcome_action_item_expired` / `pwa_install_*` / `web_push_*` events live in `web/lib/analytics-events.ts`. Server-side PostHog ingestion of cron-fired events (specifically `welcome_action_item_expired` from the daily expiry cron) deferred — matches Track A posture; logged to console as `[welcome-action-item-expiry] expired` until the cross-cron PostHog ingestion follow-up lands.
- New conversation-based pricing tiers in Stripe (Starter $29 / Growth $59 / Pro $119 / Agency $199 + $39/seat). **(Track C — pending.)**
- Conversation counter (per-agent monthly bucket). **(Track C — pending.)**
- Founding 34 grandfathered at Growth-equivalent. **(Track C — pending.)**
- Pricing page rebuild. **(Track C — pending.)**

### Phase 2 — KPI tiers, beneficiary, retention, supporting infrastructure (months 3–4)
- KPI tier system (5 tiers, 7-day rolling, line-level — see `KPI Tier System` below).
- Line-health dashboard widget.
- Auto-throttle at Tier 1 and Tier 2 (provisional — may downgrade to manual triage if Tier 1 events are rare).
- Beneficiary invite mechanic (parallel to client activation, three invite prompts).
- Bulk import onboarding ceremony (re-enable UI, drip release rules).
- Lapse/retention cadence rewrite. Push first, 1st SMS automatic, **agent action item surfaced after 1st SMS unanswered** (48h or 5d unresolved); if agent toggles AI back on, chain resumes with email + final SMS at end of campaign; 60-day quiet after campaign. Includes writing the anniversary, retention, and referral action item writers against the `actionItems` schema Track B builds in Phase 1. See `Channel Rules > Agent action item surface`.
- Email infrastructure cleanup (centralize Resend usages, bounce/complaint webhook, suppression list).
- Engineering dependency for Phase 3 Agency tier: pooled-capacity logic, team admin dashboard, per-seat dashboard.

### Phase 3 — Concierge launch + pricing rollout completion (months 5–6)
- Concierge add-on (operator dashboard role with scoped data access, $1,500 / $2,500 SKUs). Available to any tier; gated by book size and willingness to pay.
- Pricing rollout completion and overage billing validation with a small cohort (5–10 agents) before general release.
- Book-size-aware multi-line eligibility unlocked for Pro tier.

### Phase 4 — Provider abstraction, multi-line, contingencies (months 7–12)
- Provider abstraction layer (`MessagingProvider` interface, `LinqProvider` adapter). **Deferred from v3.1's Phase 1** per strategy §3.
- Twilio as warm-standby once line count reaches 5.
- Multi-line provisioning with lane specialization.
- AMB evaluated as direct-Apple registration if branded sender becomes strategically important. (Linq has confirmed they do not run AMB.)
- Number replacement playbook activated only if a second Limited episode occurs under the new operating model.
- Pause functionality if churn data shows seasonal patterns. Annual prepay if customer demand emerges. Native iOS/Android agent app evaluated against PWA usage data.

### Phase 2 success metrics
- Agent welcome-send compliance > 80%.
- Client app activation rate (download + Activate tap) > 70%.
- Thumbs-up response rate to first Linq line response > 60%.
- Lapse/retention reply rate stable above 18% on whatever escalates to Linq SMS.
- Zero pooled-line anniversary outbound sends in trailing 30 days.

## Capacity Model

Source: v3.1 §5, with Linq operator confirmations from §13.1 / §12.6.

- **Linq line cost:** $250/line/month (assumed fully loaded; carrier pass-through fees still unconfirmed — see `Open Linq Questions`).
- **Linq recommended ceiling:** 50 unique new outbound conversations per line per day (~1,500/month).
- **Steady-state operating target:** 35 outbound new conversations per line per day (~1,050/month, 70% utilization). Reserved 30% serves as headroom for bursts, replies, and recovery from any KPI tier event.
- **Reciprocity targets (Linq guidance):** 1 reply per 2 sends; 30–40% ideal first-message reply rate; 15% minimum.
- **Per-line operating target:** **70 agents per line steady state**, with **100 agents/line as the optimization ceiling**. Ramp 70 → 100 over 60–90 days based on reply rate and opt-out rate; behavior-based, no formal milestone checklist.
- **Client-initiated inbound is NOT counted** against the 50/day cap (Linq confirmed, May 2026).

## KPI Tier System

Line-level, trailing 7-day windows. Platform-enforced; agents do not opt out of throttling. Source: v3.1 §6.

| Tier | Trigger | Automated Action | Exit Criteria |
|------|---------|------------------|---------------|
| Tier 0 — Healthy | Reply rate ≥ 25%, reply:send ≥ 1:2, no Linq warnings | Normal operation | — |
| Tier 1 — Watch | Reply rate < 25% or reply:send < 1:2.5 | Surface in dashboard. New bulk imports require manual approval. No automated throttle. | 3 consecutive days back above thresholds |
| Tier 2 — Throttle | Reply rate < 20% or reply:send < 1:3, OR 3 consecutive days at Tier 1 | Daily line capacity reduced 50%. Lapse/retention lane suspended. New bulk imports blocked. | 3 consecutive days back above Tier 1 thresholds |
| Tier 3 — Pause | Reply rate < 15% or reply:send < 1:4, OR Linq downgrade | All automated outreach halted. Agent-initiated single sends allowed. 7-day cooldown. | 7 consecutive days clean window |
| Tier 4 — Lockdown | Linq Limited or worse, OR repeat Tier 3 within 30 days | Full pause. Mandatory review. Number replacement playbook considered. | Linq confirmation + 7-day clean window + decision on number replacement |

Carrier-level overlays (when per-carrier metrics are available): STOP rate > 1% → Tier 2 trigger; 30007 (carrier filtered) > 5% → Tier 3 trigger; 30008 (unknown error) > 3% → Tier 1 trigger; T-Mobile delivery rate < 80% → Tier 1 trigger.

**Number replacement** is a Phase 4 contingency, not a Phase 1 action. Trigger is a second Limited episode under the new operating model.

## Business Model

### As Closr AI add-on (primary distribution, deferred)
Pricing for the Closr AI bundle is **deferred until Closr AI is post-MVP**. The historical $29/agent/month assumption is no longer authoritative.

### As standalone (AFL pricing v3 — launches in Phase 1)

Source: `docs/AFL_Pricing_Packaging_Playbook_v3.md`. Conversation-based pricing, not message-based or seat-based.

| Tier | Price | Convs/mo (Linq line only) | Daily cap | Overage | Buyer |
|------|-------|---------------------------|-----------|---------|-------|
| Starter | $29/mo | 30 | 3 | $0.50/conv | Year-1 agent, small book |
| Growth | $59/mo | 75 | 8 | $0.50/conv | Established producer (anchor tier) |
| Pro | $119/mo | 200 | 20 | $0.50/conv | Top producer, large book |
| Agency | $199/mo + $39/seat | 100/seat pooled | 10/seat | $0.50/conv against pool | Agency owner with downline |

All tiers include unlimited push, agent-phone one-tap, and email. The conversation count is a budget for Linq pooled-line SMS only. Client-initiated inbound activation messages do NOT count against agent allowances. Bulk import (Onboarding Ceremony) included on Growth, Pro, and Agency. Advanced analytics on Pro and Agency. Priority support on Pro and Agency. Team admin tools only on Agency.

**Founding 34 ("free for life"):**
- Grandfathered at Growth-equivalent (75 convs/mo, 8/day cap). Free seat is permanent and exempt from base-tier price increases.
- Overage at full price ($0.50/conv) — no discount, no exemption.
- All channel features available (push, agent-phone, email) with no limit.
- Bulk-import onboarding ceremony available once per agent if not already used.
- Founding agency owners: $199 platform fee waived; pay $39/seat for downline. Pooled capacity = 75 + (100 × downline seats).
- Subject to the same KPI throttling rules as paid tiers — no reputation immunity.

**Concierge add-on (one-time service, available now / Phase 2-aligned):**
- $1,500 email-only / $2,500 email + SMS. One-time fee billed at engagement start.
- Operator imports the agent's client list and runs welcome touches as the agent. Sends signed in agent's name from agent's account.
- Operator scope: mechanical send work only — import + welcome. No qualifying, no quoting, no advice.
- Operator role with scoped data access: client list (names, phone numbers, basic context). Not policy details, financial info, or beneficiary data.
- Available to any agent on any paid tier. Gated by book size and willingness to pay, not subscription level.
- Recommended by book size: under 100 → Onboarding Ceremony; 100–300 → Hybrid; 300+ → Concierge.

**Trial and refund:**
- 14-day free trial on Starter and Growth. No trial on Pro or Agency.
- No CC required to start trial; CC required day 7 to continue.
- 14-day money-back guarantee on initial signup post-trial. No refunds after 14 days except for AFL technical failures.
- Cancellations effective at end of current billing period. No prorated refunds.

**Tier change mechanics:**
- Upgrades effective immediately, prorated for current period.
- Downgrades effective at end of current period.
- Maximum 1 downgrade per quarter without friction; additional downgrades trigger a support conversation.

**Pricing adjustment mechanism:**
- Pricing locked from Phase 3 launch through Phase 3 + 90 days. No ad-hoc changes during this window.
- 60 days notice for base-tier price changes; 30 days notice for overage rate changes.
- Annual review in Q4 with adjustments effective February 1.
- Loyalty grandfathering: existing customers retain old price for 12 months after a tier price increase.
- Founding members exempt from base-tier price increases. Overage rate increases apply normally.

**Annual prepay** is deferred to Phase 4+ pending demand signal. **Pause functionality** is deferred to Phase 4 pending churn pattern data.

### Margin model

At 70 agents/line and $250/line/month, per-agent line cost = $3.57/month.

| Tier | Price | Cost basis | Gross margin |
|------|-------|------------|--------------|
| Starter | $29 | $3.57 | 87.7% |
| Growth | $59 | $3.57 | 93.9% |
| Pro | $119 | $3.57 | 97.0% |
| Agency (5 seats) | $394 | $17.85 | 95.5% |

Overage GM (~66%) is acceptable as overflow protection, not a profit center. Aggregate overage as % of platform revenue should sit between 5% and 15%; outside that band signals tiers are mis-provisioned. Near-90% blended gross margin is the operational guardrail (also captured in `docs/linq-scale-playbook.md`).

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
| Agent tooling | PWA-first (mobile-optimized agent dashboard with `sms:` URL-scheme one-tap and Web Push). Native deferred to Phase 4 pending usage data. |

**Provider strategy:** stay on Linq through Phase 1–2. Provider abstraction (`MessagingProvider` interface — `sendMessage`, `getLineHealth`, `subscribeReplies`, `registerNumber`) **deferred to Phase 4** per strategy §3. Twilio added as warm-standby at 5+ lines if needed. AMB confirmed unavailable through Linq; Phase 4 contingency only. No SendBlue or other iMessage-relay services (Apple TOS / continuity / compliance risk).

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
- Added (March 2026): Google Drive integration Task 1 backend foundation. Introduced server-side OAuth helpers and token persistence for `drive.file`, with Firestore integration storage at `integrations/{agentId}/google/drive`, OAuth state handling, and new API endpoints under `/api/integrations/google/*` (`auth`, `callback`, `disconnect`, `token`, `status`). Callback now redirects to `/dashboard` with success/error query params for UI handling.
- Added (March 2026): Google Drive connect/disconnect controls in Dashboard Settings. The account settings tab now checks Google integration status on load, supports connect (OAuth start + redirect), supports disconnect, and surfaces callback success/error state using dashboard query params.
- Added (March 2026): Google Drive Phase 1 is complete. Delivered Google Picker file selection in the Clients import flow, a new `/api/integrations/google/import` route that downloads Drive PDFs and stages them in GCS with idempotent ingestion-v3 job creation (`drive:{fileId}:{modifiedTime}:{sizeBytes}`), and dashboard UI support across both Settings (connect/disconnect state) and Clients (Connect Google Drive + Import from Google Drive actions). Drive imports now feed the same existing ingestion-v3 queue/process pipeline with no parser behavior changes from local uploads.
- Fixed (April 2026): Google `invalid_grant` during token refresh (revoked/expired refresh token, OAuth Testing-mode limits, or rotated client secret) left Firestore showing “connected” while the Picker failed. Token and import routes now detect `invalid_grant`, clear the stale `integrations/{agentId}/google/drive` doc, return a clear reconnect message, and the Clients import modal refetches Drive status so the UI matches reality.
- Added (April 2026): Spanish messaging support for client lifecycle flows. Clients can now be marked with a preferred language (`en`/`es`), and outbound automated messaging paths use Spanish when set (welcome text/resend, referral follow-ups, conservation/review AI prompts, and birthday push copy).
- Added (April 2026): Beneficiary outreach + access groundwork.
  - Beneficiary records on policies now support optional `phone`, `email`, `dateOfBirth`, and `address`, plus generated beneficiary access codes.
  - Added configurable beneficiary welcome templates in Settings (English/Spanish) and dashboard send flow with editable pre-send messaging.
  - Mobile code lookup/policies endpoints now accept beneficiary codes and scope policy responses to matching beneficiary rows.
  - Added new carrier form type `uhl_icc20_200_854a_giwl` ("United Home Life - GIWL") with dedicated PAGE_MAP and carrier extraction supplement.
- Added (April 2026): Beneficiary relationship automation phase 1 (initial rollout).
  - Agent settings include beneficiary automation controls: holiday touchpoints toggle, AI follow-up toggle, and max touches per 30 days cap.
  - Intro send + cron infrastructure shipped: `/api/cron/beneficiary-followups` and `/api/cron/beneficiary-holiday-check`.
  - Note: this initial SMS/email-first design was later tightened by the May 2026 Linq policy hardening updates below and is now superseded by the v3.1 invite-only beneficiary architecture (see `Channel Rules` → Beneficiary).
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
- Added (April 20, 2026): Bulk import UI simplification + Closr-style cleanup in Clients.
  - The import entry CTA is now "Bulk Import" (replacing "Import Book of Business"), and the modal now uses an action-first layout ("Google Drive" / "Choose from Computer") instead of a dense instruction wall.
  - Drag/drop and multi-file local uploads remain supported; Google Drive connect/import behavior is preserved.
  - Background progress copy was updated to be friendlier and explicitly reassures agents they can keep working while imports run.
- Added (April 20, 2026): Admin import reliability monitoring in Dashboard > Admin > Stats.
  - New "Bulk Import Reliability" section reads Firestore batch docs (`agents/{agentId}/batchJobs`) and shows success/skip/failure rates, tracked files, average and P95 minutes per batch, top failure reasons, and recent batches.
  - Added threshold-aware rollout status messaging in Admin stats using current targets (success >= 90%, failure <= 5%, P95 <= 15 min) with recommended operator actions when thresholds are missed.
- Updated (April 21, 2026): Google Drive bulk import reliability and GCF BOB extraction.
  - `gcf/ingestion-v3-processor` now reports terminal ingestion outcomes back to Firestore batch docs (`agents/{agentId}/batchJobs/{batchId}`), so Drive imports can transition out of `processing` to `completed`/`partial` without manual cancellation.
  - Batch file status updates are now idempotent in `web/lib/ingestion-v3-batch-store.ts` to prevent double-increment counter drift from duplicate terminal updates.
  - GCF BOB mode no longer returns placeholder empty rows by default; it now performs real extraction (deterministic parsing for delimited/spreadsheet data with AI fallback, plus PDF AI extraction) and writes normalized `result.bob.rows`.
- Added (April 23, 2026): Launch-readiness hardening for bulk import, OAuth review, and automated verification.
  - **Bulk PDF routing guardrails** now apply consistently in local and Google Drive bulk paths:
    - high-confidence mapped forms route to mapped pages,
    - unknown/low-confidence PDFs are capped to first 5-6 pages (never full-document payload),
    - mixed structured+PDF batches are blocked with explicit guidance,
    - encrypted PDFs are surfaced with a clear single-file fallback message.
  - **Automated regression checks expanded**:
    - `web/tests/bulk-import-smoke/run-smoke.ts` validates routing behavior (including unknown caps and carrier detection),
    - CI workflow `.github/workflows/web-bulk-import-smoke.yml` runs on `web/**` and workflow changes,
    - Playwright E2E suite added under `web/e2e` with authenticated bulk/import/single-file coverage, plus CI workflow `.github/workflows/web-e2e.yml` (credential-gated via `AFL_E2E_EMAIL` / `AFL_E2E_PASSWORD`).
  - **Google OAuth verification progress**:
    - consent-screen/privacy disclosures and in-app helper messaging were added for the temporary unverified-app screen,
    - reviewer access credentials were sent to Google’s verification team after they requested authorized login access,
    - verification remains in-progress (external dependency).
  - **Anniversary signal alignment shipped**:
    - anniversary counts/labels and client-level eligibility now use shared canonical logic that excludes policies already in active rewrite campaigns,
    - dashboard wording reflects "Upcoming Anniversaries" consistently.
- Updated (April 24, 2026): Ingestion v3 Cloud Functions runtime upgraded to Node.js 22.
  - `gcf/firebase.json` runtime moved from `nodejs20` to `nodejs22`.
  - `gcf/ingestion-v3-processor/package.json` engines target moved from `20` to `22`.
  - Deployed successfully in production for `ingestionv3:processIngestionV3Queued`, `ingestionv3:cleanupIngestionV3Zombies`, and `ingestionv3:reconcileStaleBatchJobs`.
  - Node 20 deprecation warning is cleared for this codebase; separate maintenance follow-up remains to upgrade `firebase-functions` major version.
- Added (April 26, 2026): Milestone-driven onboarding revamp to improve early activation on the dashboard.
  - Replaced the static onboarding modal with a guided, persisted coachmark flow that resumes at the saved step and highlights concrete UI targets (Settings, Clients, Send Welcome, Patch).
  - Added structured onboarding state in agent profile (`onboarding.version`, `currentStep`, `requiredMilestones`) with explicit milestone completion writes and `onboardingComplete` only after all required actions are done.
  - Wired onboarding milestones to real behaviors (profile completion, first client created, first welcome text sent, first Patch prompt sent), including admin reset support for both legacy and new onboarding fields.
  - Expanded PostHog onboarding instrumentation with `onboarding_step_viewed`, `onboarding_step_blocked`, `onboarding_resumed`, `onboarding_completed`, `onboarding_patch_prompt_sent`, and `onboarding_manual_correction_used`.
- Updated (April 27, 2026): Onboarding UX hardening pass and production rollout.
  - Added a persistent right-side onboarding checklist rail with milestone statuses and integrated `Pause onboarding` / `Resume onboarding` controls.
  - Added `Skip tutorial` control and wired immediate UI suppression so overlay + checklist hide instantly on skip while completion persists in the background.
  - Hardened guided target behavior to reduce stuck states: stale-target auto-heal, auto-scroll target into view, stronger target visibility gating, and explicit blocked-state messaging instead of silent no-op.
  - Removed onboarding back navigation in the coachmark to keep a single forward action and avoid dead/ambiguous controls.
  - Added typed-field gating so `Next` for text-entry steps only appears after actual input starts in the highlighted field.
  - Updated reset behavior so admin onboarding reset can fully clear onboarding + profile setup fields for true first-time walkthrough testing.
- Added (May 1, 2026): Deterministic conversation routing foundation for Linq inbound/outbound classification.
  - Introduced canonical conversation thread registry primitives (`conversationThreads` + resolver entries by provider thread and phone) under `web/lib/conversation-thread-registry.ts` with strict lane/purpose typing in `web/lib/conversation-routing-types.ts`.
  - Wired registry upserts into outbound referral, conservation, policy-review, and beneficiary send paths (AI and manual) so inbound messages can resolve against a single source of truth instead of campaign-specific heuristics.
  - Added feature-flagged webhook routing controls in `web/app/api/linq/webhook/route.ts`:
    - `THREAD_ROUTER_ENABLED` (registry-first routing),
    - `PHONE_FALLBACK_STRICT_MODE` (disable secondary phone fallback),
    - `BENEFICIARY_AUTO_REPLY_ENABLED` (default false).
  - Added beneficiary hard-fence behavior when routed in beneficiary lane (no automatic non-beneficiary AI response) plus unresolved inbound lead inbox creation path.
  - Added migration tooling: `web/scripts/backfill-conversation-thread-registry.ts` (`npm --prefix web run backfill:thread-registry`) to seed registry records from existing referral/conservation/policy review chat IDs before enabling strict routing in production.
- Updated (May 2, 2026): Linq messaging policy hardening + beneficiary outreach guardrails.
  - Welcome and invite SMS flows now append a conversational delivery confirmation prompt to improve reciprocity ("Could you confirm you got this by replying or giving a thumbs up here?").
  - Beneficiary intro messages now send as single-touch intros only (no automatic Day 2/5/10 follow-up queueing from intro sends).
  - `/api/cron/beneficiary-followups` is now a disabler path that marks queued follow-ups as `skipped` with `reason: followups_disabled`.
  - Beneficiary holiday outreach is now push-only in `/api/cron/beneficiary-holiday-check`; no SMS/email fallback when push is unavailable.
  - Beneficiary lane auto-reply remains feature-flagged and default-off (`BENEFICIARY_AUTO_REPLY_ENABLED=false`) behind thread-lane routing checks in the Linq webhook.
  - Documentation alignment: Linq's "50 unique new conversations per line per day" is recorded as a **recommended ceiling** (not a hard cap), and undocumented numeric limits are no longer represented as Linq requirements. See `docs/linq-messaging-safety-policy.md` (v2) for source-labeled guidance.
- Added (May 2, 2026): Linq scale playbook draft committed at `docs/linq-scale-playbook.md`. Captures scaling tension, lane priority framework, response-aware retry cadence, packaging options, and a near-90% gross margin guardrail. Now superseded as primary source-of-truth by `docs/AFL_Messaging_Operating_Model_v3.1.md` for capacity/lane decisions; retained as supporting reference.
- Updated (May 3, 2026): Bulk Import temporarily disabled in dashboard UI.
  - The "Bulk Import" CTA in `web/app/dashboard/clients/page.tsx` is now visually struck through with a red `Currently under construction` label and is non-interactive (`disabled` button + `cursor-not-allowed`).
  - Underlying import pipeline code remains in place; only the entry point is gated until the Phase 2 onboarding ceremony re-enables it under the new drip rules.
- Added (May 4, 2026): Three new source-of-truth documents committed under `docs/`.
  - **Architectural rule established: anniversary, holiday cards, and birthday cards = push only, no fallback.** If push is unavailable for a client (notifications off, app uninstalled, or token revoked), the cycle ends silently for that client until the next scheduled cycle. No SMS fallback. No email fallback. No outreach attempt at all. This overrides v3.1 §3.2 / §4.2's anniversary email fallback. Holiday and birthday cards already operate this way in production today; anniversary requires the Phase 0 hotfix to `REVIEW_STAGE_FALLBACK_ORDER` in `web/lib/conservation-types.ts`.
  - `docs/AFL_Strategy_Decisions_2026-05-04.md` (highest precedence; locks the anniversary/holiday/birthday push-only-no-fallback rule, beneficiary channel flexibility for activated beneficiaries, provider abstraction → Phase 4, push permission lifecycle in Phase 1, and the Phase 0 → Phase 4 sequence).
  - `docs/AFL_Messaging_Operating_Model_v3.1.md` (channel architecture, lane rules, capacity model, KPI tier system, two-step welcome flow with Activate button + vCard + thumbs-up, beneficiary invite mechanic, three bulk-import paths, Concierge add-on).
  - `docs/AFL_Pricing_Packaging_Playbook_v3.md` (Starter/Growth/Pro/Agency at $29/$59/$119/$199+$39, founding 34 grandfathered at Growth-equivalent, $0.50/conv overage, Concierge $1,500/$2,500, 14-day trial, pricing locked through Phase 3 + 90 days, Q4 annual review, 12-month loyalty grandfather).
  - CONTEXT.md updated to reconcile all three: new top-level `Channel Rules`, `Phased Roadmap`, `Capacity Model`, `KPI Tier System`, and rebuilt `Business Model` sections; Open Questions pruned (sender identity and line-capacity policy are now answered); Key Decisions Made appended with v3.1 §14.1 architectural decisions.
- Fixed (May 4, 2026): **Phase 0 anniversary push-only hotfix shipped.** Brings the anniversary lane into compliance with the architectural rule established earlier today (CONTEXT.md `Channel Rules` line 116 + `docs/AFL_Strategy_Decisions_2026-05-04.md` §1, §6). Anniversary outreach can no longer reach SMS or email under any condition; when push is unavailable for a client, the cycle ends silently for that client until the next scheduled anniversary.
  - `web/lib/conservation-types.ts`: `REVIEW_STAGE_FALLBACK_ORDER` narrowed from `['push', 'sms']` / `['sms', 'push']` to `['push']` for all four stages (`initial`, `followup_3d`, `followup_7d`, `followup_14d`). `REVIEW_STAGE_COMPLEMENT_EMAIL` reduced from `{ followup_14d: true }` to `{}`. JSDoc on both constants documents the rule and instructs future maintainers to surface objections against the strategy doc rather than re-adding channels.
  - `web/app/api/cron/policy-review/route.ts` (Job B initial outreach, runs daily for `policyReviewAIEnabled !== false` agents): when the channel loop produces no `usedChannel` (no push token, or Expo push send failed), the policy is now marked `policyReviewNotifiedAt: <now>` + `policyReviewSkippedReason: 'push_unavailable' | 'push_send_failed'` so the same anniversary cycle is not re-attempted on subsequent days within the Day +1 window. No `policyReviews` campaign doc is created. No client `notifications` doc is written. Strict semantics: one push attempt per anniversary; if it fails, the cycle ends until next year. Telemetry: structured `console.log('[policy-review] skipped (push unavailable)', { agentId, clientId, policyId, reason, hasPushToken, lane: 'anniversary' })` + new `clientOutreachSkipped` count in the JSON response.
  - `web/app/api/cron/policy-review-drip/route.ts` (every 4 hours): when the channel loop produces no `usedChannel`, the campaign is now terminated cleanly (`status: 'drip-complete'`, `touchStage: 'followup_14d'`, `nextTouchAt: null`, `pushSkippedAt: <serverTimestamp>`, `pushSkippedReason`) so the drip cron stops re-attempting every 4 hours. Telemetry: structured `console.log('[policy-review-drip] skipped (push unavailable)', { agentId, reviewId, clientId, stage, reason, hasPushToken, lane: 'anniversary' })` + new `dripsSkipped` count in the JSON response.
  - **Not modified** (intentional, per Phase 0 scope): `web/app/api/cron/anniversary-check/route.ts` legacy push-only fallback path was already compliant; `web/app/api/cron/holiday-check/route.ts` and `web/app/api/cron/birthday-check/route.ts` already operate push-only-no-fallback; `web/app/api/linq/webhook/route.ts` `handlePolicyReviewReply` (conversation continuation in legacy active SMS threads created before this hotfix) and `web/app/dashboard/policy-reviews/page.tsx` `handleSendMessage` (manual agent-initiated send, guarded by existing `chatId`) are not governed by the no-fallback rule and naturally become inert for new anniversary campaigns once the cron stops creating SMS chats. The retention lane (`STAGE_FALLBACK_ORDER`, separate constant) is unaffected. Phase 1 push permission lifecycle (`pushPermissionRevokedAt`, Expo `DeviceNotRegistered` handling) was intentionally not pulled forward — that ships with the welcome flow per `docs/AFL_Strategy_Decisions_2026-05-04.md` §4.
  - The dead SMS branches inside the channel loops in both crons were intentionally retained (not deleted) to keep the diff narrow and to preserve the shared channel-loop vocabulary; they cannot be reached for the anniversary lane because `REVIEW_STAGE_FALLBACK_ORDER` no longer contains `'sms'`. The dead `REVIEW_STAGE_COMPLEMENT_EMAIL` block in the drip cron similarly stays in place but never enters now that the table is empty.
  - Hotfix did not introduce a feature flag (architectural rule, not a feature gate). Shipped as commit `ac4144d` ("Enforce anniversary push-only outreach with no fallback (Phase 0 hotfix)") — see Phase 0 implementation note in `Phased Roadmap`.
- Fixed (May 5, 2026): **Phase 1 Track A — Push permission lifecycle shipped.** Resolves the `if (pushToken !== undefined)` foot-gun that conflated "ever opted in" with "currently allows notifications," which had been silently breaking the push-only rule for any client who revoked notifications in iOS settings. Rule source: `docs/AFL_Strategy_Decisions_2026-05-04.md` §4 + CONTEXT.md `Channel Rules` → `Push permission lifecycle`. Continues the Phase 0 anniversary hotfix (`ac4144d`); the lifecycle work was intentionally deferred there per strategy §4 and is now landed.
  - **New helper: `web/lib/push-permission-lifecycle.ts`.** Single source of truth for push eligibility and Expo send semantics. Exports `isPushEligible(clientData)`, `readValidPushToken(clientData)`, `getPushPermissionStatus(clientData)` (`'eligible' | 'never_opted_in' | 'revoked'`), `sendExpoPush(payload, holder?)`, and the `PUSH_PERMISSION_REVOKED_FIELD` constant. `sendExpoPush` runs the Expo POST, parses the ticket, and on a permanent-failure code (currently only `DeviceNotRegistered` per Expo docs — `MessageTooBig`, `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials` are payload/credential issues and are explicitly NOT in the invalidation set) atomically deletes the stored `pushToken` and stamps `pushPermissionRevokedAt: <serverTimestamp>` on the holder doc inside a Firestore transaction guarded against concurrent re-registration.
  - **Schema: `pushPermissionRevokedAt`.** New optional Firestore field on `agents/{agentId}/clients/{clientId}` documents. Presence distinguishes "never opted in" (no token, no field) from "opted in then revoked" (no token + field set). Beneficiary records do not currently store their own push token; the beneficiary-holiday lane invalidates against the parent client doc as before. **Backfill: not required.** Existing clients with valid tokens stay routable; existing clients with stale tokens that have actually been revoked at the OS level will self-heal on the next push attempt (Expo will return `DeviceNotRegistered` and the helper will invalidate them in place). A one-shot backfill against historical Expo receipts is out of scope for this task; revisit only if telemetry shows a long tail of stale tokens.
  - **Re-registration clears revocation.** `web/app/api/push-token/register/route.ts` (called by the mobile app) now clears `pushPermissionRevokedAt` whenever it writes a new `pushToken`, so a client who revokes and later re-grants permission returns to the eligible state without an admin touch. Same behavior is mirrored in the dev-only `web/app/api/test/set-push-token/route.ts`.
  - **Push-only crons short-circuit on revocation BEFORE Expo (clean telemetry).** `web/app/api/cron/policy-review/route.ts`, `web/app/api/cron/policy-review-drip/route.ts`, `web/app/api/cron/anniversary-check/route.ts` (legacy push-only fallback), `web/app/api/cron/holiday-check/route.ts`, `web/app/api/cron/birthday-check/route.ts`, and `web/app/api/cron/beneficiary-holiday-check/route.ts` all source eligibility through `readValidPushToken` / `getPushPermissionStatus` and skip Expo entirely for revoked clients. Skip-reason taxonomy on the policy-review path extended from `'push_unavailable' | 'push_send_failed'` to `'push_unavailable' | 'push_revoked' | 'push_send_failed' | 'push_send_invalidated'`. The drip cron now always re-reads the client doc (instead of trusting the cached `clientPushToken` on the review doc) so a client revoked between drips is not re-attempted on stale cache.
  - **Fallback lanes invalidate but keep walking the channel order.** `web/app/api/cron/conservation-outreach/route.ts`, `web/app/api/conservation/outreach/route.ts`, and `web/app/api/conservation/update/route.ts` (saved-policy celebration push → SMS → email) route through the helper so permanent failures invalidate the token, while transient or invalidated outcomes simply walk to the next channel per `STAGE_FALLBACK_ORDER`. `clientHasApp` in `web/lib/conservation-core.ts` now reflects `isPushEligible` so retention alerts no longer claim push availability for revoked clients.
  - **Single-send manual push surfaces revocation.** `web/app/api/notifications/send/route.ts` (the dashboard-initiated single push) gates on `isPushEligible`, returns a 422 with `pushPermissionStatus: 'revoked'` when the client has revoked since the agent last sent, and includes `tokenInvalidated: true` in the success-path response when the send hit `DeviceNotRegistered`.
  - **Telemetry.** Every invalidation emits a `console.log('[push-lifecycle] token invalidated', { agentId, clientId | beneficiaryId, reason: 'DeviceNotRegistered', previousTokenSuffix })` log line — token suffix only, never the full token, per the hotfix telemetry pattern. Push-only cron handlers added two new counters to their JSON responses: `tokensInvalidated` and `pushSkippedRevoked`. Fallback crons added `tokensInvalidated`. Existing counters (`clientOutreachSkipped`, `dripsSkipped`, etc.) are unchanged. Read-only `web/app/api/test/check-push-token/route.ts` now surfaces `pushPermissionRevokedAt` and a derived `pushPermissionStatus` for ops debugging.
  - **Intentionally not changed** (per Track A scope, see strategy decisions §4 and the `ac4144d` Phase 0 commit message):
    - The two-step welcome flow (one-tap "Send from my phone", in-app Activate, vCard MMS, thumbs-up ask) is Track B and is not part of this commit.
    - Pricing tiers / conversation counter / pricing page rebuild are Track C and are not part of this commit.
    - The PDF extraction pipeline (`gcf/ingestion-v3-processor`, `web/lib/pdf/...`, `web/app/dashboard/clients/page.tsx` PAGE_MAP) is untouched.
    - The dead SMS branches inside the policy-review / policy-review-drip channel loops that the hotfix retained are still in place. They cannot be reached for the anniversary lane because `REVIEW_STAGE_FALLBACK_ORDER` is `['push']` for every stage.
    - Server-side PostHog instrumentation was not added to cron handlers — match the current hotfix posture; PostHog wiring is its own follow-up.
    - No feature flag introduced (architectural correction, not a feature gate).
  - **Pre-commit checks.** `npx tsc --noEmit -p web/tsconfig.json` clean across the workspace. ESLint clean on every touched file (0 errors, 0 new warnings; the 5 pre-existing `no-unused-vars` warnings on `policy-review-drip/route.ts` lines 90-91, `beneficiary-holiday-check/route.ts` line 182, `test/send-holiday-card/route.ts` line 98, and `lib/conservation-core.ts` line 22 were verified as present in `HEAD` before changes and left alone).
- Shipped (May 5, 2026): **Phase 1 Track B — Two-step welcome flow + PWA install + agent Web Push + vCard pipeline + welcome action item surface.** Replaces the legacy pooled-Linq-line welcome path with the locked two-step model from `docs/AFL_Messaging_Operating_Model_v3.1.md` §3.3 + `CONTEXT.md > Channel Rules > The two-step welcome flow > Phase 1 implementation constraints` (mobile-only on agent side; no desktop send fallback; PWA + Web Push as hard onboarding gates). Establishes the forward-compat `actionItems` Firestore collection that Phase 2 lanes (anniversary / retention / referral) will write to. Continues from the May 5 Phase 1 Track A push-permission-lifecycle commit (`028491e`).
  - **New schema: `actionItems` collection** at `agents/{agentId}/actionItems/{itemId}`. Forward-compatible across welcome / anniversary / retention / referral lanes per `CONTEXT.md > Channel Rules > Agent action item surface`. Phase 1 Track B writes ONLY welcome entries. Per-lane lookup tables for expiration windows (welcome 30 / anniversary 30 / retention 7 / referral 14 days) and suggested actions (welcome = `['text_personally']` only — no skip per locked Q2) live in `web/lib/action-item-types.ts`. Server-only store with idempotency, in-place refresh, and lane-agnostic expiration cron entry point lives in `web/lib/action-item-store.ts`. Firestore rules: client-direct reads (for `onSnapshot`-driven dashboard surfaces); writes server-only via API routes that enforce schema invariants.
  - **Welcome trigger contract (Daniel's locked Q1):** action item is queued the moment the agent confirms PDF extraction and creates the client profile (the "create profile" UI action — both `handleManualCreateAndContinue` and `handleReviewConfirmAndCreate` in `web/app/dashboard/clients/page.tsx` call the new `queueWelcomeActionItem` helper after `createClientFromAddFlow` resolves). If the agent later edits the client profile in a way that changes name or code, the writer at `web/lib/welcome-action-item-writer.ts` refreshes the action item's `displayContext` in place via `refreshActionItemDisplayContext` — does not duplicate, does not regenerate. `handleInlineUpdateClient` and `handleSubmitClient` both call the same queue helper for in-place refresh on edit. Idempotency key `welcome:{clientId}`.
  - **Welcome queue UX (Daniel's locked Q2):** new dashboard route `/dashboard/welcomes` lists all pending welcome action items grouped by date created, oldest first, with subtle color-shift age affordances (neutral → amber at ≥4d → red at ≥15d) and an "Nd ago" pill on every row. **No skip, no dismiss** — only `text_personally` action is surfaced (server-side validation in `/api/agent/action-items/[itemId]/complete` rejects any other `completionAction` for welcome items). **30-day expiration** via daily cron at `/api/cron/welcome-action-item-expiry` (16:00 UTC, runs `expireOverdueActionItemsForAgent` against every agent, lane-agnostic so Phase 2 lanes inherit the hygiene). Expired items emit `[welcome-action-item-expiry] expired` structured logs with `agentId`, `itemId`, `daysQueued`. New nav entry `Welcomes` in dashboard sidebar + mobile bottom nav.
  - **Mobile-only "Send from my phone" surface:** `web/components/WelcomeActionItemCard.tsx` is the one-tap UI primitive (reusable across Phase 2 lanes per CONTEXT.md spec). On mobile installed PWA (`canSendFromPhone === true` from new `web/lib/use-mobile-pwa.ts` hook combining `(max-width: 767px)` + `(display-mode: standalone)` + iOS `navigator.standalone`), the card renders a real `sms:+15551234567&body=...` anchor that launches iMessage pre-filled with the locked welcome body. On desktop OR non-installed mobile browser, the card and the page-level banner show "Open AFL on your phone to send" — exactly per the locked Phase 1 constraint that there is **no desktop send fallback** (not via deep link, not via QR code, not via Continuity). Tap on mobile fires the `sms:` URL AND POSTs to `/api/agent/action-items/{itemId}/complete` with `completionAction: 'text_personally'` so the queue updates without waiting for agent send confirmation.
  - **PWA + agent Web Push (HARD onboarding gates per locked Phase 1 implementation constraint):** new manifest at `web/public/manifest.webmanifest`, minimal hand-rolled service worker at `web/public/sw.js` (push receive + notificationclick navigate; no Workbox / next-pwa / runtime caching to keep the surface area small), root layout links the manifest. Server-side helper `web/lib/web-push-lifecycle.ts` (mirrors Track A's lifecycle pattern but for Web Push, NOT Expo — explicitly separate infrastructure per Daniel's task contract): VAPID-keyed `sendAgentWebPush` with per-subscription fan-out, atomic invalidation on 404/410/403 push gateway responses, and `webPushPermissionRevokedAt` revocation marker on the agent doc parallel to client-side `pushPermissionRevokedAt`. Subscription stored as `agents/{agentId}.webPushSubscriptions` array (multi-device — agent may install on phone home screen + macOS PWA). API routes at `/api/agent/web-push/subscribe` and `/api/agent/web-push/unsubscribe`. Client-side `web/components/PWAInstaller.tsx` mounted in dashboard layout: registers the SW, captures the `beforeinstallprompt` event for one-tap install on Chrome/Edge/Android, exposes globals (`__aflPwaPromptInstall`, `__aflRequestWebPush`) so the onboarding overlay invokes them from a user gesture, syncs subscription state on every load, and detects display-mode standalone (covers iOS Add to Home Screen).
  - **Two new onboarding milestones:** `pwaInstalled` and `webPushGranted` added to `OnboardingMilestones` interface, defaults, normalizer, OnboardingChecklistRail items, and OnboardingOverlay STEPS. Both are HARD gates — Skip Tutorial in `web/app/dashboard/layout.tsx > handleSkipTutorial` blocks completion if either is unsatisfied (other milestones remain skippable). `pwaInstall` step: tries the captured install prompt; if no prompt available (iOS Safari has no API), shows platform-specific Add-to-Home-Screen instruction copy and self-heals when the agent re-opens AFL from the home screen (PWAInstaller flips the milestone via display-mode-standalone detection). `webPushPermission` step: invokes `Notification.requestPermission()` then `pushManager.subscribe(applicationServerKey)` on grant, POSTs to `/api/agent/web-push/subscribe`, marks the milestone.
  - **vCard generation pipeline:** `web/lib/vcard.ts` builds RFC 2426 vCard 3.0 strings with embedded base64 JPEG photo (folded per RFC §2.6 for older Android SMS parsers). `web/lib/agent-vcard-store.ts` is the cache layer: source-fingerprint (sha256 over name + agency + Linq line phone + email + note + photo bytes) drives invalidation; cache-hit path is a single Firestore read; on miss, regenerate + upload via `uploadAttachment` to Linq + persist `vcardLinqAttachmentId` + `vcardSourceFingerprint` + `vcardSizeBytes` + `vcardPhotoEmbedded` + `vcardGeneratedAt` on the agent doc. Carrier MMS budget: photo ≤60KB JPEG (drops PHOTO field if larger and logs a warning rather than ship a >100KB MMS); total .vcf ≤90KB with defensive recursive recompose without photo if exceeded. API route `/api/agent/vcard/regenerate` is called fire-and-forget from the settings save path after every save (idempotent on cache hit). Server-side `sharp` not added — agent profile photos already arrive at 400×400 JPEG q0.85 from `web/app/dashboard/settings/page.tsx > getCroppedImage`; if telemetry shows photos routinely over 60KB, add `sharp` in a follow-up.
  - **Linq webhook welcome_activation handler:** new lane `welcome_activation` added to `ConversationLane` union (`web/lib/conversation-routing-types.ts`), with two purposes (`welcome_activation_inbound` and `welcome_activation_response`), a new `client` `LinkedEntityType`, a new `welcome_activation` `AllowedResponder`, and matching default-responder branches in `conversation-thread-registry.ts` and `conversation-lane-guard.ts`. `web/lib/welcome-activation-handler.ts` recognizes inbounds via the `welcome_pending_{clientId}` placeholder thread (pre-registered against client phone E.164 by the welcome action item writer at queue-time, with idempotency key `welcome:{clientId}`) AND verifies via clientCode regex match in inbound body (defense in depth — covers both the registry-resolver path and the body-token path). Detection runs at the TOP of `handleDirectMessage` BEFORE the `THREAD_ROUTER_ENABLED` branch, so the welcome flow does NOT depend on the routing flag (per the task contract). On match: atomic activation claim stamps `clientActivatedAt` + `welcomeActivationInboundAt` + `welcomeActivationProviderThreadId` + `welcomeActivationMatchedByCodeInBody`, fetches/regenerates the agent's vCard attachment, sends Linq's first response ("Hey [Client]! You're all set...") with vCard MMS via `createChat`, upgrades the placeholder thread to the real Linq threadId (placeholder marked `lifecycleStatus: 'archived'` with `upgradedToProviderThreadId` pointer), and increments the welcome action item view counter. Defensive rollback if the first response send fails (clears the activation claim so a future inbound can retry).
  - **Thumbs-up reciprocity tracking:** post-activation inbounds on `welcome_activation_response` threads run a conservative thumbs-up regex (matches 👍 + skin-tone variants, "thumbs up", "tu", "+1", "y", "yes", "got it", "received", "confirmed"). On match, stamps `welcomeThumbsUpReceivedAt` on the client doc and upgrades the thread lane to `manual` so subsequent inbounds route through the existing lead/manual handlers. Non-thumbs-up replies fall through to lead inbox handling so the agent sees them on the dashboard. Telemetry: `client_activation_thumbs_up_received` event from the dashboard surface; structured `[welcome-activation] thumbs_up_received` log from the webhook.
  - **PostHog event registry expansion (`web/lib/analytics-events.ts`):** 15 new typed events. **Generic action item funnel** (cross-lane, lane is a property): `action_item_created`, `action_item_viewed`, `action_item_completed`. **Welcome-specific funnel** (Phase 1 leading indicators per locked Q2): `welcome_action_item_expired`, `welcome_send_initiated`, `welcome_send_completed`, `client_activated`, `client_activation_thumbs_up_received`. **PWA + Web Push (agent side, browser, NOT Expo)**: `pwa_install_prompted`, `pwa_install_completed`, `web_push_permission_requested`, `web_push_permission_granted`, `web_push_permission_denied`, `web_push_subscription_registered`, `web_push_subscription_invalidated`. Each event has a typed properties signature in `AnalyticsEventPropertiesMap`.
  - **Cutover (Daniel's locked Q9 = HARD cutover, deprecate-not-delete):** the `welcome` add-flow stage in `web/app/dashboard/clients/page.tsx` no longer renders the legacy "Send Welcome Text" button; it now shows "Welcome added to your queue" + "View queue" CTA that routes to `/dashboard/welcomes`. The `Send to Client` button in `web/components/ClientDetailModal.tsx` (`handleSendCode`) no longer POSTs to `/api/client/welcome-sms` — it queues the action item and routes to the queue. Both legacy server routes (`/api/client/welcome-sms` and `/api/client/send-bulk-intro`) keep their full implementations and have been marked with `@deprecated Phase 1 Track B cutover (May 5, 2026)` JSDoc blocks documenting the new code path; rollback is a one-line revert of the dashboard call sites + redeploy. Deletion of the deprecated routes happens in a separate commit at least 30 days post-cutover.
  - **Forward-compat hooks for Phase 2 lanes:** action item types + store + suggested-actions table + per-lane expiration table + idempotency key helpers all carry placeholder entries for `anniversary` / `retention` / `referral` already so Phase 2 writers (`anniversary-action-item-writer.ts` etc.) plug into the same surface without schema migration. The expiration cron is lane-agnostic. The dashboard one-tap card primitive (`WelcomeActionItemCard.tsx`) is welcome-specific in name today but all lane-aware logic uses the typed unions, so the Phase 2 anniversary/retention/referral cards can either reuse the component (with a lane prop) or compose against `web/lib/action-item-types.ts` directly.
  - **Intentionally not changed** (per Track B scope, see Daniel's task message and locked decisions):
    - Track C work (pricing tiers / conversation counter / pricing page rebuild) is a separate parallel workstream — the new `Welcomes` nav item lands but the dashboard pricing surfaces are untouched.
    - The mobile React Native client app (`mobile/app/`) — the in-app Activate screen ships in the follow-up commit immediately after this one (`mobile/app/activate.tsx` + `mobile/app/_layout.tsx` Stack registration + `mobile/app/index.tsx` `navigateToProfile` routing + `web/app/api/mobile/lookup-client-code/route.ts` response extension to surface `linqLinePhone` + `clientActivatedAt`). Until that ships, the welcome flow works end-to-end on a phone where the client manually texts the Linq line after downloading the app.
    - The PDF extraction pipeline (`gcf/ingestion-v3-processor`, `web/lib/pdf/...`, `web/app/dashboard/clients/page.tsx` PAGE_MAP) is untouched.
    - `THREAD_ROUTER_ENABLED` posture is unchanged. The welcome flow is designed to work regardless of the flag state.
    - Server-side PostHog ingestion of cron-fired events (`welcome_action_item_expired` from the daily expiry cron) is deferred — matches Track A posture; logged to console as structured `[welcome-action-item-expiry] expired` until the cross-cron PostHog ingestion follow-up lands.
    - The pre-existing `react-hooks/set-state-in-effect` lint error in `web/components/OnboardingChecklistRail.tsx` line 53 was verified as present in `HEAD` before this commit and left alone (Track A pattern). The 6 pre-existing TypeScript / React lint errors in `web/app/dashboard/clients/page.tsx` (lines 2905, 2960, 4083, 4108, 4648 × 2) were also verified as present in `HEAD` and left alone.
  - **New environment variables required (Vercel):**
    - `WEB_PUSH_VAPID_PUBLIC_KEY` — base64-url VAPID public key. Generate with `npx web-push generate-vapid-keys`.
    - `WEB_PUSH_VAPID_PRIVATE_KEY` — corresponding base64-url VAPID private key.
    - `WEB_PUSH_VAPID_SUBJECT` — `mailto:` address or HTTPS URL identifying the application.
    - `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` — same value as the public key, exposed to the browser for `pushManager.subscribe(applicationServerKey)`.
    - Without these, `sendAgentWebPush` logs a configured-error and returns zero attempts; the welcome queue still works (cards still render), agents just don't get the phone notification when a welcome lands.
  - **New Firestore fields:**
    - `agents/{agentId}.webPushSubscriptions` (array of `{endpoint, p256dh, auth, userAgent, addedAt, lastSendAt, lastSendStatus}`).
    - `agents/{agentId}.webPushPermissionRevokedAt` (server timestamp; presence indicates the agent's last subscription was invalidated and they need to re-grant).
    - `agents/{agentId}.vcardLinqAttachmentId` + `vcardSourceFingerprint` + `vcardSizeBytes` + `vcardPhotoEmbedded` + `vcardInputPhotoBytes` + `vcardGeneratedAt` (vCard cache).
    - `agents/{agentId}.onboarding.requiredMilestones.pwaInstalled` and `.webPushGranted` (the two new HARD onboarding gates).
    - `agents/{agentId}/clients/{clientId}.clientActivatedAt` + `welcomeActivationInboundAt` + `welcomeActivationProviderThreadId` + `welcomeActivationMatchedByCodeInBody` + `welcomeActivationVCardAttached` + `welcomeActivationFirstResponseAt` + `welcomeThumbsUpReceivedAt` (welcome activation funnel).
    - `agents/{agentId}/actionItems/{itemId}` — full doc per `web/lib/action-item-types.ts > ActionItemDoc`.
    - `agents/{agentId}/conversationThreads/{welcome_pending_{clientId}}` — placeholder welcome activation thread, upgraded to a real Linq threadId on first inbound.
  - **Backfill:** none required. Existing clients without a welcome action item are not retroactively queued (that would explode the queue with stale entries from agents who already manually welcomed everyone). New welcomes start the moment a new client profile is created. Daniel handles the small-cohort cutover communication out-of-band (founding 34 email).
  - **Pre-commit checks.** `npx tsc --noEmit` clean across the workspace. `npm run build` clean (`/dashboard/welcomes` prerenders). ESLint clean on every newly-created file (0 errors, 0 new warnings). `web-push` v3.6.7 + `@types/web-push` v3.6.4 added to `web/package.json`.
- Shipped (May 6, 2026): **Phase 1 Track B mobile Activate screen — completes the client-side half of the two-step welcome flow.** Brand-new clients downloading AFL after their agent's one-tap welcome text now land on a dedicated Activate screen between login and the agent profile. Tap composes a pre-filled `sms:` outbound from the client's phone to the Linq line per `docs/AFL_Messaging_Operating_Model_v3.1.md` §3.3 ("Hi [Agent], it's [Client] — I'm set up on the app!"); the Linq webhook handler shipped May 5 (`web/lib/welcome-activation-handler.ts`) recognizes the inbound via the `welcome_pending_{clientId}` placeholder thread the action item writer pre-registered server-side. Closes the Track B contract end-to-end. Shipped as commit `55ab665` ("Ship Phase 1 Track B mobile Activate screen — completes the client-side half of the two-step welcome flow.").
  - **New screen: `mobile/app/activate.tsx`.** Renders ONCE per client between successful login and the agent profile. Pre-prompts push notification permission via the existing `registerForPushNotificationsAsync` from `_layout.tsx` (denial does NOT block Activate — channel matrix in `Channel Rules` makes it clear that anniversary / holiday / birthday cards silently end for clients without push, but activation is independent). Activate button uses `Linking.openURL` with platform-canonical `sms:` URL form (iOS `&body=`, Android `?body=`). Body intentionally does NOT contain the `clientCode` — the `welcome_pending` byPhone placeholder is the primary detection mechanism in the webhook handler; the body-token regex match (when it fires) is a verification signal stored on the client doc as `welcomeActivationMatchedByCodeInBody`, NOT a gating condition. Activations from the mobile flow land with `matchedByCodeInBody: false` — expected and tracked. Skip button is intentionally available on the CLIENT side (not the agent side, where the locked Q2 forbids it) — forcing a stranger to send a text on their first app open is hostile UX; the agent's queued action item stays open and they can re-prompt later. AppState listener auto-advances to `/agent-profile` when the user returns from iMessage (350ms grace period for the iMessage transition; `forwardToProfile` held in a ref so the listener doesn't re-bind on every render). Defensive fallbacks for unconfigured `linqLinePhone` (env var missing) and devices without SMS support (e.g. iPad without cellular) — both route directly to `/agent-profile` so login is never blocked.
  - **Stack registration: `mobile/app/_layout.tsx`.** `<Stack.Screen name="activate" />` added between `index` and `agent-profile`. The 3 pre-existing `tsc` errors at lines 18, 103, 104 (expo-notifications API type drift) were verified as present in HEAD before this commit and left alone (Track A pattern).
  - **Routing: `mobile/app/index.tsx > navigateToProfile`.** Routes unactivated clients (`clientData.clientActivatedAt` null/missing) through `/activate` first; activated clients (already through the flow) go straight to `/agent-profile` as before. Beneficiaries always go directly to `/agent-profile` — the v3.1 beneficiary invite mechanic (`Channel Rules > Beneficiary invite mechanic`) is parallel architecture deferred to Phase 2 and will introduce a beneficiary-specific activation flow when it ships. `linqLinePhone` passed through from the lookup-client-code response via three call sites (auto-login fresh fetch, auto-login cached fallback, manual handleLogin). Cached `LookupResult` docs from before this commit don't have `linqLinePhone` — they fall through to empty string which the Activate screen handles gracefully (skip to profile). The `'/activate'` pathname is cast as `as never` because expo-router regenerates its typed pathname union from the filesystem on every dev-server / EAS build; until that runs, `'/activate'` is missing from the union and TS errors. Runtime behavior is identical; the cast is purely a tsc compatibility shim and will become unnecessary on the next expo-router type-gen pass.
  - **Server response extension: `web/app/api/mobile/lookup-client-code/route.ts`.** Response now includes top-level `linqLinePhone` (sourced from `agents/{agentId}.linqPhoneNumber` if set — forward-compat for multi-line Phase 4 — otherwise from the platform-level `LINQ_PHONE_NUMBER` env var via `resolveLinqLinePhone`). `clientData` now includes `clientActivatedAt` and `welcomeThumbsUpReceivedAt` (both nullable; serialized to ISO if the Firestore Timestamp is set, else null). The mobile app uses `clientActivatedAt` to decide whether to show the Activate screen.
  - **Operational note.** Works correctly under the current `LINQ_OUTBOUND_DISABLED=true` freeze (commit `e017d55`). The client tapping Activate composes an outbound from the CLIENT's phone (their carrier, their messaging app), NOT from the Linq line. The resulting message is INBOUND to Linq, which the kill switch intentionally does not gate. The webhook handler will fire, `clientActivatedAt` will stamp, telemetry will fire. The agent's vCard MMS reply (outbound from Linq) will fail per the freeze with the existing graceful rollback in `handleWelcomeActivationInbound`; resumes cleanly once Linq is re-enabled.
  - **Intentionally not changed.** The web dashboard surfaces (`/dashboard/welcomes`, action item card, queue route), the Linq webhook welcome-activation handler, and the agent-side PWA + Web Push infrastructure are all untouched — already shipped in `99e134f` and `a1e1d06`. The PDF extraction pipeline is untouched per the `.cursorrules` lockdown. The beneficiary activation flow remains deferred to Phase 2. The `/api/mobile/agent-extras` endpoint is untouched — it already returns `linqPhoneNumber` (per-agent override) for the agent profile screen's separate concerns; lookup-client-code adding `linqLinePhone` at the top level is for the activation gate specifically.
  - **Pre-commit checks.** Web `npx tsc --noEmit` clean across the workspace. Mobile `./node_modules/.bin/tsc --noEmit` shows 0 new errors (the 3 pre-existing errors at `mobile/app/_layout.tsx` lines 18 / 103 / 104 are unrelated `expo-notifications` API type drift and were left alone). ESLint clean on every touched file (0 errors, 0 warnings on `mobile/app/activate.tsx`, `mobile/app/index.tsx`, `web/app/api/mobile/lookup-client-code/route.ts`).
- Fixed (May 4, 2026): **Dashboard auth gate hang** ("Checking account access" spinner stuck on load) eliminated, plus a defensive timeout-with-recovery added so any future regression in this code path fails loudly instead of stranding users on a spinner. Bug source: `CONTEXT.md` `Known Issues / Next Session` line item, present since the May 2 access-gate resilience pass (commit `582263d`).
  - **Root cause.** Cleanup race in `web/app/dashboard/layout.tsx` `SubscriptionGate`. On the success path of founding-member auto-activation, `await refreshProfile()` flips `profileLoading` to `true` synchronously inside `DashboardContext.fetchProfile`, which is a dep of the activation effect. The effect re-runs and triggers cleanup (`cancelled = true`, `clearTimeout(failSafeTimeout)`) while the in-flight activation Promise is still suspended on `await refreshProfile()`. When control returns to `tryFoundingActivation`'s `finally`, the `if (!cancelled) setActivatingFounding(false)` guard skips the state update, so `activatingFounding` stays `true` permanently. The 13s in-effect failsafe was already cleared by the cleanup, so it can no longer recover. Result: render branch is `if (activatingFounding) return <CheckingSpinner />` with no path to clear it. Distorted activation funnel measurements because the user got activated successfully but stranded before any post-onboarding telemetry could fire.
  - **Implementation (three independent escape hatches).**
    - `web/app/dashboard/layout.tsx`: removed the `cancelled` guard from `setActivatingFounding(false)` in `finally`. Setting state on a stale closure is a React 18+ no-op; the unconditional call is what makes the spinner exit hang-proof. The `cancelled` flag and the in-effect `failSafeTimeout` are gone; the effect no longer returns a cleanup function (in-flight activation must run its `finally`).
    - `web/app/dashboard/layout.tsx`: new effect keyed solely on `activatingFounding` runs the activation hard timeout (`ACCESS_GATE_ACTIVATION_HARD_TIMEOUT_MS = 13000`). Its lifetime is tied to the spinner being shown, not to the activation effect's deps, so `profileLoading` flicker cannot clear it.
    - `web/app/dashboard/layout.tsx`: new top-level gate ceiling effect keyed on `loading || profileLoading || activatingFounding` (`ACCESS_GATE_OVERALL_HARD_TIMEOUT_MS = 15000`) renders a user-visible recovery UI with **Refresh page** + **Sign out and try again** buttons matching the existing `<SubscriptionRequired>` card style. Independent of every other timer; this is the backstop for hypothetical regressions in `loading` or `profileLoading` paths too. UI replaces both spinners when the ceiling fires.
  - **Telemetry.** Two new typed events added to `web/lib/analytics-events.ts` registry (`DASHBOARD_AUTH_GATE_RESOLVED`, `DASHBOARD_AUTH_GATE_TIMEOUT`) with full property-map type entries.
    - `dashboard_auth_gate_resolved` fires exactly once per gate cycle (resets on user change and on retry-button click). Outcomes wired today: `'authenticated'` when sub-active dashboard children render, `'redirect_signin'` from `web/app/dashboard/DashboardContext.tsx` before the `/login` push, `'error'` when the soft-retry banner is rendered with `activationError` set, `'timeout'` when the hard-ceiling UI fires. `'redirect_onboarding'` is allowed by the type union but not fired today (onboarding is a modal overlay, not a redirect). All carry `duration_ms` measured from gate-cycle start.
    - `dashboard_auth_gate_timeout` fires alongside `'timeout'` resolutions with `phase: 'activation' | 'overall'`, `duration_ms`, and a state snapshot (`was_loading`, `was_profile_loading`, `was_activating_founding`, `had_user`, `subscription_status_known`). The snapshot is read from a ref that mirrors latest state values so timer callbacks stay accurate without re-running the effect on every flag flip.
    - All properties exclude client PII (state booleans + numerics only); the existing `clientPiiKeyPattern` filter in `web/lib/posthog.ts` `sanitizeEventProperties` is unchanged and continues to apply to all `captureEvent` calls.
  - **Intentionally not changed.**
    - Firebase → Clerk auth migration is a separate strategic workstream (`Stack` table line 361 + `Closr AI Integration`) and is not pre-empted by this fix. The gate still uses Firebase Auth + Firestore profile fetch as before.
    - The auth gate is not weakened. The dashboard still requires real auth + active subscription before rendering children. The hard-ceiling UI surfaces recovery actions (Refresh / Sign out); it never bypasses the gate.
    - No feature flag introduced (this is a bug fix, not a feature).
    - Phase 1 Track A territory (push permission lifecycle, cron handlers, Expo, `pushToken` schema) was not touched. The PDF extraction pipeline (`gcf/ingestion-v3-processor`, `web/lib/pdf/...`, `web/app/dashboard/clients/page.tsx` PAGE_MAP) was not touched. The April 26/27 onboarding revamp surface area (`OnboardingOverlay`, `OnboardingChecklistRail`, milestone state in `DashboardContext`) was not touched.
    - Inner per-request timeouts inside `tryFoundingActivation` (12s on `getIdToken`, 12s on the activate-API fetch via `AbortController`) and the existing `dashboard_access_gate_check` event are preserved unchanged; they still fire as the first-line per-request safety net before the new activation hard timeout.
  - **Pre-commit checks.** `npx tsc --noEmit` clean across the workspace. `npm --prefix web run build` clean (all `/dashboard/*` routes prerender). ESLint clean on every touched file (0 errors, 0 new warnings; 6 pre-existing warnings in `layout.tsx` and `DashboardContext.tsx` — `showSettingsModal`, three `<img>` warnings, `DEFAULT_ONBOARDING_STATE` — were verified as present in unmodified code regions and left alone).

**Founding Member Program:** 34 founding agents are grandfathered at Growth-equivalent capacity (75 conversations/month, 8/day cap) free for life under the v3 pricing model. Free seat is permanent and exempt from base-tier price increases; overage is at the full $0.50/conv rate. Founding agency owners get the $199 platform fee waived and pay $39/seat for downline. Founding members are subject to the same KPI throttling rules as paid tiers. Full terms in `Business Model → Founding 34`.

## Key Decisions Made

### Strategic
- AFL will become a Closr AI add-on module (not merged/rebranded — retains its identity).
- The call-to-client pipeline is the integration priority.
- Auth migration from Firebase to Clerk is required for unification.
- Standalone access remains available for agents not on Closr AI.
- NEPQ methodology is the foundation for all AI-generated messaging.
- Linq handles iMessage/SMS (migrated from SendBlue).
- Closr AI bundle pricing is **deferred** until Closr AI is post-MVP. AFL standalone pricing launches independently.

### Channel architecture (per v3.1 §14.1 + strategy §1, §2)
- **Push is the universal first-choice channel** for every lane that supports push delivery (anniversary, retention, holiday/birthday, beneficiary). App dormancy is **not** a disqualifier — permission is.
- **Anniversary, holiday cards, birthday cards = push only, NO fallback.** Architectural, not tunable. (Strategy §1 overrides v3.1 §3.2 / §4.2 anniversary email fallback.)
- **Welcome flow is two-step:** (1) agent sends from personal phone via one-tap, including app download link AND login code; (2) client downloads, logs in with code, taps Activate → `sms:` URL scheme composes pre-filled outbound to Linq line. Linq line's first response includes vCard + thumbs-up ask.
- **Identity on Linq line:** agent identity preserved (NEPQ-tuned voice signed under agent's name). EA framing considered and **deferred**.
- **Thumbs-up reciprocity mechanic** used on activation, anniversary check-ins via SMS fallback, and time-sensitive sends — not on every message.
- **vCard generation** is server-side, per-agent, with embedded compressed photo (<60 KB JPEG, ~400×400). Two photo derivatives stored — display and vCard — generated on agent profile photo upload. Delivered as MMS attachment from the Linq line.
- **Beneficiary invite mechanic** parallels client activation, initiated by the policyholder. Three invite prompts: during policyholder activation, annual beneficiary verification, always-on access. **No cold beneficiary outreach** via any channel.
- **Beneficiary lane stays channel-flexible** for activated beneficiaries (push primary for cold contact, SMS/email available as future tools). Strategy §2 overrides any push-only-locked reading of v3.1 §4.5.
- **Lapse/retention cadence:** push first → 1st SMS automatic if push unavailable/unengaged → **agent action item surfaced when 1st SMS unanswered (48h or 5d unresolved)** → if agent toggles AI back on, chain resumes with second-touch email + final SMS at end of campaign → 60-day quiet period after campaign ends. The action-item gate replaces the prior "max 2 SMS automatic + mandatory email at third touch" pattern; total touch budget unchanged but middle of chain becomes agent-discretion. See `Channel Rules > Agent action item surface`.
- **Bulk import is a once-per-agent-lifecycle ceremony.** Three paths (Onboarding Ceremony / Hybrid / Concierge). Never bulk through the Linq line (Linq confirmed).
- **Number replacement is a Phase 4 contingency**, triggered by a second Limited episode under the new operating model.
- **Push permission lifecycle management shipped May 5, 2026 (Phase 1 Track A).** Centralized in `web/lib/push-permission-lifecycle.ts`: `isPushEligible` gates routing on token presence + `pushPermissionRevokedAt` absence; `sendExpoPush` invalidates tokens on `DeviceNotRegistered` inside a Firestore transaction. Push-only lanes (anniversary, holiday, birthday) short-circuit BEFORE Expo for revoked clients; fallback lanes (welcome, retention, beneficiary post-activation) walk to the next channel. Strategy §4.

### Capacity & pricing (per v3.1 §14.2 + v3 §15)
- Per-line operating target: 70 agents/line steady state. Optimization ceiling: 100 agents/line. Ramp 70 → 100 over 60–90 days based on reply rate and opt-out rate.
- Linq has confirmed: 50/day applies to outbound new conversations only; client-initiated inbound does not count.
- Unit of sale: conversations, not messages.
- Tiers: Starter $29 / Growth $59 / Pro $119 / Agency $199 + $39/seat. Conversation budgets pool at the agency level for Agency.
- Overage: $0.50/conversation across all individual tiers and the Agency pool.
- Founding 34 grandfathered at Growth-equivalent (75 convs/mo); free seat permanent; overage at full price.
- Founding agency owners: $199 platform fee waived; $39/seat for downline.
- Concierge add-on: $1,500 email-only / $2,500 email + SMS. Available now to any tier.
- 14-day trial on Starter/Growth; no trial on Pro/Agency. Pricing locked through Phase 3 + 90 days. Q4 annual review, Feb 1 effective. 12-month loyalty grandfather on price increases. Founding members exempt from base-tier increases.

### Technology (per v3.1 §14.3 + strategy §3)
- **Provider abstraction layer (`MessagingProvider` interface) deferred to Phase 4.** Strategy §3 overrides v3.1 §10.2 / §14.3 ("implemented in code before any Phase 2 work begins") — at one Linq line and one provider, the abstraction is engineering effort that does not move toward shipping welcome flow or pricing tiers. AFL absorbs the refactor cost only if a Linq outage or pricing dispute forces a switch before Phase 4.
- Stay on Linq through Phase 1–2; add Twilio as warm-standby at 5+ lines.
- Agent tooling: PWA-first (mobile-optimized agent dashboard with `sms:` URL scheme one-tap and Web Push). Native app deferred to Phase 4 pending usage data.
- One-tap mechanic is mobile-primary. Desktop dashboard surfaces queues but actual sends route through agent's phone.
- Confirm device mix among founding 34 in Phase 1; produce Phone Link onboarding doc if Android contingent is meaningful.
- vCard delivered as MMS attachment from the Linq line (the `sms:` URL scheme cannot attach files).
- AMB confirmed unavailable through Linq. Direct registration with Apple is the only path; Phase 4 contingency only.
- No SendBlue, Beeper-style relays, or other iMessage-bridge services.
- Concierge operator dashboard role with scoped data access: client list (names, phone numbers, basic context). Sends originate from agent's account.

### Operational (per v3.1 §14.4)
- KPI tier system: five tiers (Tier 0 Healthy → Tier 4 Lockdown), 7-day rolling, line-level.
- Steady-state per-line operating target: 35 outbound new conversations per day (70% of Linq's 50/day recommended ceiling).
- Re-consent flow for lapse/retention: built in Phase 2, deployed in Phase 3 if consent audit findings warrant.
- Push opt-in rate is a top-three operational metric; tracked from Phase 1; influences Phase 4 capacity planning.
- Three Phase 2 success metrics: (a) agent welcome-send compliance > 80%, (b) client app activation rate > 70%, (c) thumbs-up response rate to first Linq line response > 60%.

## Linq Confirmations (May 2026)

From v3.1 §13.1 / §12.6, recorded in `docs/linq-decision-record-2026-05.md`:

- **Client-initiated inbound is NOT counted** against the 50/day outbound new-conversation cap. Validates the Activate-button welcome flow architecture.
- **Capacity definition and ramp.** The 50/day new outbound conversation cap is the real ceiling. Start at 70 agents/line, watch reply rate and opt-out rate for 60–90 days, push toward 100 if both stay clean. Behavior-based, no formal milestone checklist.
- **AMB is not available through Linq.** Their lines are standard P2P iMessage on dedicated hardware. Direct registration with Apple is the only path.
- **Bulk import** cannot run through the Linq line under any circumstances. Confirmed agent-personal-phone only.

## Open Questions

### Product / strategy
- Is the mobile app essential at launch of the Closr AI integration, or can client lifecycle features work via SMS/email/web first?
- How do founding members transition into the Closr AI module distribution (their AFL standalone status is preserved under the new pricing v3 — but the Closr AI bundle implications are still TBD)?
- Should the referral pipeline be accessible from the Closr AI dashboard directly, or only through AFL?
- What drove low activation? Onboarding friction? Data entry burden? Unclear value prop? Need agent interviews. (Phase 2 milestone-driven onboarding revamp is the current intervention.)
- Closr AI bundle pricing: deferred until Closr AI is post-MVP.

### Phase 1 product questions still open (gates Track B / Track C kickoff)
Source: `docs/AFL_Phase_1_Planning_Notes_2026-05-04.md` Q1–Q10. The §1–§3 decisions in that doc are locked. The Q1–Q10 questions are partially answered ad-hoc in agent sessions; the unresolved subset below should be answered before the corresponding Track agent designs against them.

**Track B blockers (welcome flow):**
- **Q1. What is the trigger for a welcome being "ready to send"?** Today the client record exists as soon as PDF auto-extract finishes. Sub-questions: queue immediately on extract completion, or wait until agent verifies extraction? Any agent action between PDF upload and welcome-ready state? If the agent corrects extraction errors, does the welcome regenerate?
- **Q2. What does the welcome queue look like on the agent's phone?** Single list or grouped (date, urgency)? How long does an unsent welcome stay queued before it expires or escalates? Can the agent dismiss/skip a welcome — and if yes, does the v3.1 §4.1 7-day email fallback still apply? Visual treatment for 1-day-old vs 5-day-old vs 7-day-old unsent welcomes?
- **Q9. Are we retiring the old Linq welcome path entirely, or running both in parallel for a transition period?** Three options: hard cutover (cleanest, riskiest), per-agent flag `WELCOME_FLOW_V2_ENABLED` (most flexible, code-surface debt), 30-day parallel period with telemetry comparison. Recommendation needed before Track B designs the deprecation path.

**Track C blockers (pricing tiers):**
- **Q6. How do the founding 34 migrate to the new pricing structure?** Today they're on legacy free or `$25/$35/$49` Stripe products. Mechanics of landing them on the new internal-flag founding tier without disruption. Notification copy. Visible dashboard changes (founding-member badge, conversation count widget). What happens to in-flight Stripe subscriptions on legacy products (cancel, refund, migrate).
- **Q7. When does the new pricing go live for new signups?** Strategy doc says Phase 3, but cutover date is not nailed down. Do new signups during Phase 1 land on legacy tiers and migrate later, or land on new tiers immediately? Soft-launch / private-beta to a small cohort first?

**Already answered in spec or session conversation:**
- Q3 (Activate screen layout) — mostly answered in v3.1 §3.3; remaining details are implementation choices the Track B agent can resolve and surface for confirmation.
- Q4 (Linq line first response copy) — copy template in v3.1 §3.3 is a starting point; treat as locked unless explicit reason to test variants.
- Q5 (vCard regeneration timing) — v3.1 §9.7 answers: "regenerated when name or photo changes." Trigger location is implementation detail (Cloud Function on agent doc write or inline at first-response send time with caching).
- Q8 (Closr AI bundle pricing) — deferred per strategy doc; confirmed above.
- Q10 (Phase 1 sub-task priority order) — Track A complete; current sequencing is Track B + Track C in parallel via worktrees.

### Open Linq questions (still pending Linq response, from v3.1 §13.2)
1. **Reputation scope.** Per-number, per-tenant (across AFL agents), or per-platform (across Linq customers)? Determines §12.1–12.2 sensitivities in v3.1.
2. **10DLC brand vetting score.** Current score determines per-carrier throughput tier and risk tolerance.
3. **Per-carrier reputation visibility post-recovery.** Especially T-Mobile. Determines whether number replacement should activate sooner or later.
4. **TCR campaign use-case classifications.** How is each lane currently registered? Lapse/retention specifically — Account Notification, Customer Care, or Marketing?
5. **Per-carrier delivery rates (ongoing).** Especially T-Mobile.
6. **STOP rate, 30007 rate, 30008 rate.** Required to layer carrier-level KPI triggers into the tier system.
7. **Carrier pass-through fees.** Whether $250/line/month is fully loaded or whether CCMI/AT&T/T-Mobile fees apply on top.
8. **Account isolation guarantees.** Specifically, is AFL's account architecturally isolated from other Linq tenants?

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

1. Lock the production routing strictness plan (`THREAD_ROUTER_ENABLED` rollout, `PHONE_FALLBACK_STRICT_MODE` posture, and beneficiary auto-reply policy under the v3.1 invite-only beneficiary model).
2. Re-test Whole Life with updated PAGE_MAP `[1, 2, 3, 4, 5]` and scanning supplement. Use Barbara Seaton PDF (Bank Draft on page 3, expected policy number `AM02488865`).
3. Re-test IUL Conditional Receipt fallback. Robin Howard's page 5 signature date was blank - verify that Image 5 (Conditional Receipt, page 22) now provides the date `11/18/2025`.
4. Document `unknown` carrier handling. Current behavior works (renders first N pages, no supplement, base prompt does best-effort). Just needs to be intentional and documented.
5. Production validation pass across the newly-added carriers (AMAM Mortgage Protection, AMAM Term, Foresters, all three MOO forms, Banner/LGA) — each currently has supplement + PAGE_MAP shipped but limited real-world sample coverage.

### Key files

- `gcf/ingestion-v3-processor/src/index.ts` — Cloud Function: download images, call Claude, normalize, completeness gate
- `web/lib/pdf/render-selected-pages-to-jpeg.ts` — Browser PDF-to-JPEG rendering utility
- `web/app/dashboard/clients/page.tsx` — PAGE_MAP, application type dropdown, upload flow, job polling
- `web/lib/ingestion-v3-store.ts` — Job creation with `gcsImagePaths`
- `web/lib/ingestion-v3-types.ts` — Type definitions including `gcsImagePaths`
- `web/app/api/ingestion/v3/jobs/route.ts` — API endpoint for job creation

### Repository rule

The canonical working repo is `/Users/danielroberts/Developer/insurance-app`. The iCloud Desktop copy (`~/Library/Mobile Documents/com~apple~CloudDocs/Desktop/insurance-app`) is stale and must not be used for development. Always verify you are in the Developer path before making changes.

## Known Issues / Next Session

- "0 pages" metadata bug in extraction summary.
- Bulk import intelligence notes are concatenated into an unreadable wall of text (needs per-file collapsible notes). Note: import entry point is currently disabled in the UI.
- Single-file Upload Application modal does not support multi-select.
- PostHog instrumentation files for Closr AI are still uncommitted.

## IP & Legal

- AgentForLife trademark filed with USPTO
- Provisional patent filing deadline: January 2, 2027 (covers self-learning system, call-to-client pipeline, AI referral methodology)
- Terms of Service, Privacy Policy, and EULA recently updated
- Apple Developer Program enrolled under Brainstorm Labs LLC
- Domain: brainstormlabs.co (primary), support@agentforlife.app (alias)

## Company Context

Brainstorm Labs LLC, founded by Daniel (CEO). Based in St. Louis. Daniel is also an active independent insurance agent under Symmetry Financial Group / Crosswinds Financial Group. He holds a JD from SLU. ARCH Grants 2026 application is active — AFL and Closr AI are the core of the pitch.
