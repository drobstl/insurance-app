# Handoff — Cursor → Claude Code (May 8, 2026)

> **For the agent picking this up.** This is the durable artifact. Daniel was working with Cursor agents up through May 8 morning; from this point forward the work moves to Claude Code. This doc is self-contained: read it cold and you have everything you need to start.

## 1. What this is

You're a Claude Code agent at `/Users/danielroberts/Developer/insurance-app`. The user is **Daniel Roberts** — founder of Brainstorm Labs LLC, building AgentForLife (AFL). Solo founder, not a traditional engineer. He talks plainly; you should too.

Today is **Friday, May 8, 2026**. The relaunch target is **Tuesday, May 12, 2026** — that morning the maintenance window lifts, the Linq outbound kill switch flips back on, and the cohort gets the rebuild announcement. Four working days from now, with a weekend in the middle.

You are inheriting an in-flight relaunch. Track A (push permission lifecycle) and Track B (two-step welcome flow) shipped May 5–7; the May 7 amendment then pivoted Track B's agent-facing surface from async-with-hard-gates to inline-at-create-time (Mode 1) with bulk-import-async (Mode 2) deferred. Track C (conversation-based Stripe pricing) has not started.

Daniel's stated scope for you on May 8:
> "Claude is finishing everything and taking over from here. What's not done that needs to be done is the Mode 2 drip engine and making sure we have clear rules and behaviors around the channels we use for comms with clients of agents in terms of push vs sms vs email and when and how often etc... also the testing of iOS app and submission to the store for update to live app. Writing the cohort email... and anything else related to the v3.1 and pricing and packaging docs that we still need to implement."

That is a lot. Triage in §5 below.

## 2. Required reading order

In precedence order. If two docs disagree, the higher one wins.

1. `.cursorrules` — load-bearing rules (PDF pipeline lockdown, TypeScript deploy guardrails, repo safety, **Context-Use Guardrail**, **NEVER push without being asked**). Read before any code change.
2. `CONTEXT.md` — full file. The single source of truth for product state, business model, channel rules, phased roadmap, decisions, open questions. Updated every session that changes architecture or strategy. Especially:
   - `Source-of-Truth Documents` (precedence list)
   - `Channel Rules > Per-lane channel matrix` (push vs SMS vs email rules per lane)
   - `Channel Rules > The two-step welcome flow > Phase 1 implementation constraints (REVISED May 7)` (note the SUPERSEDED callout)
   - `Channel Rules > Bulk import — three paths` (Mode 2 framing)
   - `Channel Rules > Agent action item surface` (cross-lane Phase 2 architecture)
   - `Phased Roadmap` (Phase 1 → Phase 4 sequencing)
   - `Recent fixes` from May 4 onward (the relaunch story in commit-by-commit detail)
   - `Open Questions > Phase 1 product questions still open`
3. `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` — the locked spec for the Mode 1 / Mode 2 architecture. Wins over v3.1 §3.3 / §9.3 wherever they conflict on the welcome flow.
4. `docs/AFL_Strategy_Decisions_2026-05-04.md` — the May 4 strategy lock (anniversary push-only-no-fallback, beneficiary channel-flexible post-activation, provider abstraction deferred to Phase 4, Phase sequencing).
5. `docs/AFL_Phase_1_Planning_Notes_2026-05-04.md` — Phase 1 scoping conversation. §1–§3 decisions are locked; §4–§10 product questions are partially answered (see CONTEXT.md `Open Questions`).
6. `docs/AFL_Pricing_Packaging_Playbook_v3.md` — pricing tiers, founding-34 grandfathering, concierge add-on, trial/refund/tier-change mechanics. The source for Track C work.
7. `docs/AFL_Messaging_Operating_Model_v3.1.md` — operational model: lane-specific channel rules (§3, §4), Linq operating model (§5), KPI tier system (§6), bulk import (§7), implementation specs (§9, §10), open Linq questions (§13).
8. `docs/handoffs/HANDOFF_2026-05-07_welcome_flow_pivot.md` — historical handoff describing the May 7 Mode 1 implementation pivot. Work fully shipped. Read for what's already done, not for what to do next.
9. `git log --oneline -30` to see the relaunch commit-by-commit story.

## 3. State of the world today (May 8, 2026, 12:30 PM CT)

### Git
- Branch: `main`, up to date with `origin/main`.
- Most recent commits (newest first):
  - `bedbf82` — Set up `docs/handoffs/` archive + log v1.6.1 store submission in CONTEXT.md (this commit, prepared for your handoff).
  - `f56d640` — Bump mobile to 1.6.1 (iOS build 36, Android versionCode 28) for v1.6.1 store submission.
  - `ab52960` — Unify welcome send UX across inline compose surface and queue card.
  - `012d2f3` — Set up EAS Updates + strengthen Activate screen notification ask.
  - `0fcca3e` — Tighten welcome SMS closing line to make notification ask explicit.
  - `32e5203` — Update welcome SMS copy to numbered-step format (May 7, 2026 lock).
  - `7f77817` — Add QR code + auto-complete welcome on client activation (welcome flow Option D).
  - `9c051b3` — Build the Mode 1 inline welcome compose surface (welcome flow amendment, May 7).
  - `af36ffe` — Drop PWA + Web Push hard gates from onboarding (welcome flow amendment, May 7).
  - `e8c1b27` — Add Welcome Flow Amendment (May 7, 2026) — Mode 1 / Mode 2 framing.
- No uncommitted changes. No untracked files of consequence.

### Mobile binary
- `mobile/app.json`: `version: "1.6.1"`, iOS `buildNumber: "36"`, Android `versionCode: 28`.
- EAS builds completed:
  - iOS build id `1ba5d0de` — IPA artifact ready.
  - Android build id `0850893a` — AAB artifact ready.
- `runtimeVersion: { policy: 'appVersion' }` set; `updates.url: https://u.expo.dev/6765db0c-dbc2-48e1-8082-ec16e721c096`. EAS Updates production channel wired in `mobile/eas.json`.
- **Not yet submitted to App Store Connect / Play Console.** Submission is part of your scope.

### Deployed Vercel state
- Production is live (Daniel has Vercel auto-deploy on every push to `main` — pushes go live in ~60 seconds).
- Active env flags (set via Vercel dashboard, NOT in repo):
  - `MAINTENANCE_MODE_READONLY=true` — amber maintenance banner visible on the dashboard; mutation API routes outside the allowlist throw a maintenance error. See `web/lib/maintenance-mode.ts` for the allowlist (action items routes are allowlisted; the welcome compose surface relies on this).
  - `LINQ_OUTBOUND_DISABLED=true` — Daniel's kill switch from commit `e017d55`. Every outbound Linq call (`createChat`, `sendMessage`, `uploadAttachment`) throws `LinqOutboundDisabledError`. Inbound webhooks still work (the welcome-activation handler runs; the vCard MMS reply throws and is caught).
  - VAPID keys (4 vars) — set, used by agent-side Web Push. Web Push is now opt-in upsell only (not gating onboarding) per the May 7 amendment.
- Both flags lift on May 12 morning. **Daniel will do the flip himself via Vercel dashboard or CLI; this is not your code change.**

### Pre-commit baseline (carry these forward; don't try to fix)
- `cd web && npx tsc --noEmit`: clean.
- `npm --prefix web run build`: clean (all `/dashboard/*` routes prerender).
- ESLint pre-existing in `web/app/dashboard/clients/page.tsx`: 6 errors (two `no-explicit-any`, two `rules-of-hooks` for conditional `useMemo`, two `no-unescaped-entities`). Documented as present in HEAD before recent changes; left alone per "Track A pattern."
- ESLint pre-existing in `web/components/OnboardingChecklistRail.tsx`: 1 warning (declared in handoff May 7 doc).
- Mobile `./node_modules/.bin/tsc --noEmit` (from `mobile/`): 3 pre-existing errors at `mobile/app/_layout.tsx` lines 18 / 103 / 104 — unrelated `expo-notifications` API type drift. Left alone.
- **Track A pattern:** introduce 0 new lint errors / 0 new warnings on touched files. Don't fix pre-existing unless the file is the focus of your change.

## 4. What's already shipped (don't redo)

If you're tempted to build any of the below, stop — it already exists. Files listed for orientation only; do not modify without explicit Daniel sign-off.

### Track A — Push permission lifecycle (May 5)
- `web/lib/push-permission-lifecycle.ts` — central `isPushEligible`, `sendExpoPush`, `pushPermissionRevokedAt` invalidation transaction.
- Anniversary / holiday / birthday short-circuit BEFORE Expo for revoked clients.
- Welcome / retention / beneficiary fall back to next channel.
- `Channel Rules > Push permission lifecycle` in CONTEXT.md is the spec.

### Track B — Two-step welcome flow (May 5–7, originally async; pivoted to Mode 1 May 7)
- `actionItems` Firestore collection — `web/lib/action-item-types.ts` (per-lane expiration windows, suggested actions); `web/lib/action-item-store.ts` (idempotent server-side store).
- Welcome action item writer — `web/lib/welcome-action-item-writer.ts` (idempotency, thread placeholder, English/Spanish copy branches).
- Welcome activation Linq webhook handler — `web/lib/welcome-activation-handler.ts` (recognizes inbound via `welcome_pending_{clientId}` placeholder, stamps `clientActivatedAt`, sends vCard MMS reply, idempotent action item completion).
- Linq webhook entry — `web/app/api/linq/webhook/route.ts`.
- Daily expiry cron — `web/app/api/cron/welcome-action-item-expiry/route.ts`.
- vCard pipeline — `web/lib/vcard.ts`, `web/lib/agent-vcard-store.ts`, `web/app/api/agent/vcard/regenerate/route.ts`.
- Mobile Activate screen — `mobile/app/activate.tsx`, routing in `mobile/app/index.tsx > navigateToProfile`, server response extension at `web/app/api/mobile/lookup-client-code/route.ts` (now surfaces `linqLinePhone` + `clientActivatedAt`).
- Action item API — `web/app/api/agent/action-items/welcome/queue/route.ts`, `.../[itemId]/view/route.ts`, `.../[itemId]/complete/route.ts`.
- Welcomes queue page (audit + recovery + Mode 2 working surface, NOT primary) — `web/app/dashboard/welcomes/page.tsx` + `web/components/WelcomeActionItemCard.tsx` (rewritten May 7 evening to share Send / Copy / QR helpers with the inline compose surface).

### Mode 1 inline welcome compose (May 7)
- `web/app/dashboard/clients/page.tsx` — `addFlowStage === 'welcome'` block renders inline compose (Send via iMessage / Copy / QR / Skip).
- `web/lib/sms-url.ts` — shared platform-detection + URL-building helpers (`detectAgentPlatform`, `buildSmsUrlForPlatform`, `buildSmsUrlForQr`, `platformSupportsInlineSend`, `platformIsMobile`, `getSendButtonLabel`, `getSendCaption`). Single source of truth; both inline surface and queue card import from here.
- QR code via `qrcode.react` v4.2.0 (added May 7); RFC 5724 `sms:{phone}?body={urlEncoded}` form, hidden on iOS/Android.
- Activation auto-completes the action item server-side (commit `7f77817`) — `welcome-activation-handler` calls `completeActionItem(completionAction: 'text_personally', completedBy: 'system:welcome_activation', ...)` on inbound; idempotent if already completed via Send / Copy.
- OnboardingOverlay reverted to 4-step (welcome / profile / firstClient / firstWelcome / patch); PWA + Web Push milestones tracked but optional.
- May 6 existing-agent re-onboarding gate in `web/app/dashboard/layout.tsx` reverted.
- `web/components/onboarding/PlatformInstructions.tsx` deleted.

### Mobile v1.6.1 (May 7 evening)
- Marketing version bumped 1.6.0 → 1.6.1 to give the EAS-Updates-capable binary its own runtime-version channel.
- iOS build 31 → 36, Android versionCode 23 → 28 to dodge TestFlight / Play Console internal-track collisions.
- Activate screen notification copy strengthened (`mobile/app/activate.tsx`).
- Welcome SMS copy locked to numbered-step format (commit `32e5203`); closing line tightened to make notification ask explicit (commit `0fcca3e`). Source-of-truth files: `DEFAULT_WELCOME_SMS_TEMPLATE` in `web/app/dashboard/clients/page.tsx`, `buildWelcomeMessage` (English) in `web/lib/client-language.ts`, `buildPhase1WelcomeBody` (English) in `web/lib/welcome-action-item-writer.ts`, settings textarea placeholder in `web/app/dashboard/settings/page.tsx`. **All four kept in sync — if you change one, change all.**

### Maintenance mode (May 6)
- `web/lib/maintenance-mode.ts` — middleware-based readonly enforcement; allowlist for routes that must work during maintenance.
- `web/proxy.ts` — maintenance proxy.
- `MaintenanceBanner.tsx` — amber dashboard banner.
- `/api/system/maintenance-status` — status endpoint.
- Allowlist currently includes `/api/agent/action-items/` (added May 7 so the inline compose surface's complete + queue + view calls succeed during the May 12 readonly window).

### Dashboard auth gate fix (May 4)
- `web/app/dashboard/layout.tsx` — three-tier escape hatch (in-effect timeout, gate-keyed timeout, top-level gate-ceiling timeout) preventing the "Checking account access" hang. Telemetry: `DASHBOARD_AUTH_GATE_RESOLVED`, `DASHBOARD_AUTH_GATE_TIMEOUT`.

## 5. What you're finishing

Daniel said "everything." Honest triage: a real "everything" list crosses Phase 2, Phase 3, and Phase 4. Some is critical for May 12; most is post-relaunch. Be ruthless about what ships in the next 4 working days vs. what waits until after the maintenance lift.

### 5A. May 12 relaunch critical path (must land before maintenance lifts)

**A1. End-to-end test of the welcome flow on Daniel's actual setup. UNTESTED so far.**
This is the single highest-priority item. Nothing has been exercised end-to-end. Daniel confirmed May 8 that none of the Send / Copy / QR paths have been walked, the v1.6.1 binary has not been side-loaded for smoke testing, and the activation auto-completion has not been verified against a real client activation.

Test plan (Daniel's setup is Mac + iPhone with iMessage Continuity):

1. **Prep:** ensure `MAINTENANCE_MODE_READONLY` is FALSE in Vercel for the test session OR coordinate with the allowlist (the inline compose path's `/api/agent/action-items/` calls are allowlisted, but `POST /api/clients` for actually creating a client probably isn't — verify by reading `web/lib/maintenance-mode.ts`). Easier: ask Daniel to flip `MAINTENANCE_MODE_READONLY=false` for ~30 min.
2. **Reset onboarding** via the admin button on the dashboard (admin → "Reset my onboarding"). Should land on step 1/4 (welcome). Walk through 4 steps (no PWA install, no push permission step — they were removed in commit `af36ffe`).
3. **Create a test client** with Daniel's own iPhone number as the client phone. The inline compose surface should appear immediately after profile creation: pre-filled welcome message, Send via iMessage button, Copy button, QR code (since on Mac), Skip link.
4. **Tap Send via iMessage.** iMessage should open with body pre-filled. Send to the iPhone.
5. **On the iPhone:** receive the SMS. Tap the download link. Either install or open AFL v1.6.1 (whichever binary state). Enter the login code. Should land on the Activate screen (the new copy: "Important: allow notifications").
6. **Tap Activate.** `sms:` outbound should compose to the Linq line with the pre-filled "Hi Daniel, it's [Client] — I'm set up on the app!" body.
7. **Send that activation message.** Linq inbound webhook fires. Verify (via Vercel logs OR Firestore directly):
   - `clientActivatedAt` stamped on the client doc.
   - The action item flips from `pending` to `completed` (with `completionAction: 'text_personally'`, `completedBy: 'system:welcome_activation'`).
   - `onboarding.requiredMilestones.firstWelcomeSent` stamped.
   - vCard MMS reply attempt logs `LinqOutboundDisabledError` (expected with `LINQ_OUTBOUND_DISABLED=true`); the activation flow itself does not error.
8. **Verify in dashboard:** `/dashboard/welcomes` shows the action item as completed. Refresh and confirm.
9. **Test Copy fallback:** repeat 3–5 with a second test client, tap Copy instead. Action item should mark complete (`completionNote: 'Sent via copy-paste fallback.'`).
10. **Test QR fallback:** repeat 3–5 with a third test client, scan the QR with the iPhone. QR doesn't auto-complete — completion fires when the client activates.
11. **Test Skip:** repeat 3–5 with a fourth test client, tap Skip. Action item stays `pending`. Verify it appears on `/dashboard/welcomes` queue. Send via the queue card (which uses the same Send / Copy / QR pattern after the May 7 unification commit `ab52960`).

If any step fails, that's a blocker. Document the failure and discuss with Daniel before fixing.

**A2. iOS + Android binary submission for v1.6.1.**
Both EAS builds completed (IPA: `1ba5d0de`, AAB: `0850893a`). Submission has not happened.

Decision Daniel needs to make first: side-load smoke test before submission, OR submit and rely on Apple TestFlight / Google internal track for smoke?
- Side-load IPA on Daniel's iPhone via `eas build:run -p ios --id 1ba5d0de` or similar (requires UDID provisioning if not in the EAS-managed dev profile — confirm).
- TestFlight is faster: `eas submit -p ios --latest` pushes to App Store Connect; once Apple processes (~5–30 min), Daniel can install via TestFlight on his iPhone for smoke before promoting to production review.
- Android: Play Console internal track via `eas submit -p android --latest`; install on test device or own phone for smoke.

After smoke passes, submit for production review. Apple typical SLA <24h; Google often faster. With the May 12 deadline, **submit no later than Saturday May 9 AM** to leave a 72h buffer.

Read EAS submit docs and the existing `mobile/eas.json` config before running submit commands. Don't blindly invoke.

**A3. Cohort email — written, not sent.**
Audience: founding 34 + any other active agents. Channel: Daniel's preferred (probably Resend through the existing email infrastructure — confirm).

Framing per the May 7 unification commit message:
> "We rebuilt the welcome flow. Now when you create a new client, AFL gives you a one-tap Send button that opens iMessage with the welcome pre-filled. No setup needed."

What it must cover:
- The relaunch happened May 12; service was paused for ~6 days.
- The new Mode 1 inline compose flow (pre-filled welcome, Send via iMessage / Copy / QR options).
- The new Activate screen behavior on the client side.
- That existing welcome-flow muscle memory is no longer relevant — there's no "open AFL on your phone to send" step anymore; the workstation works.
- That PWA install + Web Push are no longer required (Mode 1) but still available as opt-in.
- App Store / Play Store update (v1.6.1) — agents should make sure their iPhone clients update / re-download.

What it should NOT promise:
- Bulk import (Mode 2). Even if you ship Mode 2 before May 12, decide with Daniel whether to surface it in the cohort email or save it for a follow-up announcement.
- Pricing changes. Track C is not done.
- New lanes (anniversary action items, retention rewrite, etc.). Phase 2.

Draft the email in a doc, NOT in code. Daniel may want to send it from his own email client. Keep it under 250 words.

**A4. Mode 2 (bulk import) drip engine — Daniel's stated priority for May 12.**
Source spec: `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` §4.2, §6.2; v3.1 §4.7 Path 1, §7; CONTEXT.md `Channel Rules > Bulk import — three paths` + `Phased Roadmap > Phase 2`.

Honest assessment: building this in 4 working days is aggressive. The pieces:

1. **Re-enable bulk import UI.** Currently struck through with "Currently under construction" in `web/app/dashboard/clients/page.tsx` (per the May 3, 2026 disable). Find the disabled CTA, restore it, gate it behind PWA + Web Push checks per amendment §4.2.
2. **Drip-release engine.** Server-side scheduler that releases ≤15 sends/day per agent from the bulk-imported batch, in 9am–6pm recipient-local windows, no weekends, no Friday after 4pm. Writes to `actionItems` collection with `lane: 'welcome'` and a Mode-2-specific source marker (e.g. `source: 'bulk_import'`). The existing welcome action item writer handles the Firestore write; the scheduler is new code.
3. **Mode 2 welcome copy + ≥3 variants.** v3.1 §7 requires "at least three pre-approved content variants." Mode 2 framing differs from Mode 1 because bulk import is for existing-book clients who already know the agent — "welcome / get connected" lands wrong. Draft copy needs Daniel sign-off before code lock. New helper alongside `buildPhase1WelcomeBody` (English): something like `buildBulkImportWelcomeBodyVariant(agent, client, variantIndex)`.
4. **Notification when daily batch is ready.** Per amendment §4.5, Mode 2 is the place where agent-side Web Push earns its keep. The agent gets a Web Push notification that today's batch (5–15 items) is ready; tap → `/dashboard/welcomes` opens with today's batch filtered. Web Push infrastructure is in place (PWAInstaller, service worker, manifest, `web/lib/web-push-lifecycle.ts`, `/api/agent/web-push/*`). New: a daily cron that triggers per-agent batch readiness notifications.
5. **Bulk import wizard hard-gates PWA + Web Push.** When the agent initiates bulk import, the wizard checks for both. If missing, walks them through install + permission grant before proceeding. Existing PWAInstaller + onboarding milestone tracking can be reused.

If the timeline is too tight: **scope-cut to ship the queue card + drip scheduler + variant copy without the agent-side notification path.** Agents check the queue manually until Web Push notification wires up post-May-12. That trades the "no setup needed" promise of Mode 1 for "you'll need to check the dashboard daily" — which is acceptable for a once-per-agent-lifetime ceremony but worth flagging to Daniel.

**Key files for Mode 2:**
- `web/app/dashboard/clients/page.tsx` (bulk import CTA + import flow)
- `web/lib/welcome-action-item-writer.ts` (extend for Mode 2 source tagging)
- `web/lib/action-item-store.ts` (lane / source filtering for the daily batch query)
- `web/app/dashboard/welcomes/page.tsx` (already device-agnostic post-unification commit; should filter to today's batch when in bulk-import mode)
- New: `web/app/api/cron/bulk-import-drip-release/route.ts` (daily release cron)
- New: `web/app/api/cron/bulk-import-batch-ready-notification/route.ts` (per-agent notification cron)
- `vercel.json` for cron registration

### 5B. Spec → implementation gap (Phase 2 / 3 / 4 — post-relaunch backlog)

Daniel asked for "anything else related to the v3.1 and pricing and packaging docs that we still need to implement." This is the gap. **None of these are May 12 critical path.** Build them after the relaunch lifts, in priority order.

**5B-1. Per-lane channel matrix codification (Phase 2 — highest priority post-relaunch).**
Daniel explicitly called this out. The spec is `CONTEXT.md > Channel Rules > Per-lane channel matrix`. Status by lane:

| Lane | Spec | Implemented? | Gap |
|------|------|--------------|-----|
| Welcome (Mode 1) | Inline at create, Send/Copy/QR | ✅ | — |
| Welcome (Mode 2) | Bulk import drip | 🟡 | See §5A4 |
| Anniversary | Push only, no fallback | ✅ Phase 0 hotfix May 4 | Action item writer for push-failure case |
| Lapse / Retention | Push → 1st SMS automatic → action item at 48h/5d → if AI re-enabled, 2nd-touch email + final SMS → 60d quiet | ❌ | Full rewrite per Phase 2 |
| Referral | Existing client one-tap → group SMS → AI on Linq line | ✅ pre-existing | Action item writer for 24h-no-reply |
| Beneficiary | Push primary post-activation; cold outreach invite-only | ✅ structurally | Beneficiary invite mechanic itself is Phase 2 |
| Holiday cards | Push only, no fallback | 🟡 partial | Verify the lane respects `isPushEligible`; silent-end on push-unavailable |
| Birthday cards | Push only, no fallback | 🟡 partial | Same as holiday |
| Bulk import | Agent-phone drip OR email blast; never Linq | 🟡 | See §5A4 |

**Action item writers for anniversary / retention / referral** need to be built against the existing `actionItems` schema. CONTEXT.md `Channel Rules > Agent action item surface` has the contract: triggers, options, completion semantics. Track B's welcome writer (`web/lib/welcome-action-item-writer.ts`) is the template.

**Lapse/retention rewrite** is the largest single piece in Phase 2. The current implementation is the legacy SMS-heavy chain. The rewrite needs:
- Push first (with `isPushEligible` check)
- 1st SMS automatic via Linq pooled line (subject to KPI tier throttling)
- Agent action item created when 1st SMS goes 48h without reply OR 5d unresolved (whichever fires first)
- "Toggle AI back on" mechanic on the action item — if agent toggles, chain resumes with 2nd-touch email and one final SMS at end of campaign
- 60-day quiet period after campaign ends
- Reuses Track B's one-tap UI primitive on the action item

**5B-2. Track C — pricing tiers in Stripe (Phase 1, deferred).**
Source: `docs/AFL_Pricing_Packaging_Playbook_v3.md` and CONTEXT.md `Business Model > As standalone (AFL pricing v3 — launches in Phase 1)`.

Pieces:
- Four new Stripe products: Starter $29 / Growth $59 / Pro $119 / Agency $199 + $39/seat. Conversation budgets metered per product (30 / 75 / 200 / 100-pooled-per-seat). Daily caps (3 / 8 / 20 / 10-per-seat).
- Overage: $0.50/conv across all individual tiers and the Agency pool. Stripe usage-based metering or post-hoc invoicing.
- Conversation counter — per-agent monthly bucket, resets first of month. Increments on every Linq pooled-line outbound new conversation. Client-initiated inbound activation messages do NOT count (Linq confirmed, May 2026 — see CONTEXT.md `Linq Confirmations`). Bulk import + welcome agent-phone sends do NOT count.
- Founding 34 grandfathered at Growth-equivalent (75 convs/mo, 8/day cap). Free seat permanent; overage at full $0.50/conv. Implementation note: today they're on legacy `$25/$35/$49` Stripe products OR free.
- Pricing page rebuild on the marketing site.
- 14-day trial on Starter/Growth (no CC required to start; CC required day 7 to continue).
- Tier change mechanics: upgrades immediate + prorated; downgrades at end of period; max 1 downgrade per quarter without friction.

**Open questions blocking Track C** (CONTEXT.md `Open Questions > Phase 1 product questions still open > Track C blockers`):
- Q6: Founding-34 migration mechanics. How do they transition from legacy products to the new internal-flag founding tier without disruption? Notification copy. Visible dashboard changes (founding-member badge, conversation count widget). What happens to in-flight Stripe subscriptions on legacy products.
- Q7: When does the new pricing go live for new signups? Strategy doc says Phase 3, but cutover date is not nailed down.

These are decisions, not implementation. Surface them to Daniel before starting Track C code.

**5B-3. Other Phase 2 supporting infrastructure.**
- KPI tier system (5 tiers, 7-day rolling, line-level — see `KPI Tier System` in CONTEXT.md).
- Line-health dashboard widget.
- Auto-throttle at Tier 1 / Tier 2 (provisional — may downgrade to manual triage).
- Beneficiary invite mechanic (parallel to client activation, three invite prompts).
- Email infrastructure cleanup (centralize Resend usages, bounce/complaint webhook, suppression list).
- Engineering dependency for Phase 3 Agency tier: pooled-capacity logic, team admin dashboard, per-seat dashboard.
- Server-side PostHog ingestion of cron-fired events (specifically `welcome_action_item_expired` from the daily expiry cron). Currently logs to console as `[welcome-action-item-expiry] expired`; the cross-cron PostHog ingestion follow-up is queued.

**5B-4. Phase 3.**
- Concierge add-on (operator dashboard role with scoped data access, $1,500 / $2,500 SKUs).
- Pricing rollout completion + overage billing validation with a small cohort (5–10 agents) before general release.
- Book-size-aware multi-line eligibility unlocked for Pro tier.

**5B-5. Phase 4.**
- Provider abstraction layer (`MessagingProvider` interface, `LinqProvider` adapter). Deferred from v3.1's Phase 1 per strategy §3.
- Twilio as warm-standby once line count reaches 5.
- Multi-line provisioning with lane specialization.
- AMB direct-Apple registration (Linq confirmed they do not run AMB).
- Number replacement playbook (only on second Limited episode).
- Pause functionality (deferred pending churn pattern data).
- Annual prepay (deferred pending demand signal).
- Native iOS/Android agent app (deferred pending PWA usage data).

**5B-6. Smaller open follow-ups.**
- Spanish welcome copy translation (CONTEXT.md `Open Questions`). The English `buildWelcomeMessage` (English branch) was updated to the locked May 7 numbered-step structure; Spanish branch in `web/lib/client-language.ts` still uses the v3.1 paragraph form. Mobile Activate screen labels (Spanish: "Activar" / "Enviar" or English) need to be confirmed in concert. Low priority — most cohort is English-speaking.
- Telemetry gap from inline compose surface (commit `9c051b3`): `WELCOME_SEND_INITIATED` / `WELCOME_SEND_COMPLETED` events are NOT yet fired from `clients/page.tsx` inline compose path. Filling this gap helps measure real-world send-channel mix once the relaunch is live.
- "0 pages" metadata bug in extraction summary (CONTEXT.md `Known Issues`).
- Bulk import intelligence notes are concatenated into an unreadable wall of text (per-file collapsible notes needed).
- Single-file Upload Application modal does not support multi-select.
- PostHog instrumentation files for Closr AI are still uncommitted (per `Known Issues`).

## 6. Constraints to respect

- **`.cursorrules` is binding.** Especially: PDF pipeline lockdown, "investigate before changing," "commit before modifying" if there are uncommitted changes, "never push without being asked," Context-Use Guardrail (preflight + sources cited).
- **The amendment is locked.** `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` wins over v3.1 / strategy doc / planning notes wherever they conflict on the welcome flow architecture. Don't relitigate Mode 1 vs Mode 2.
- **PDF extraction pipeline is architecturally frozen** per `.cursorrules`. Do not touch `gcf/ingestion-v3-processor`, `web/lib/pdf/...`, or `web/app/dashboard/clients/page.tsx`'s PAGE_MAP. The clients page change for the inline compose surface is in the add-flow `welcome` stage UI, not the PDF pipeline — verify before editing.
- **Maintenance allowlist.** `web/lib/maintenance-mode.ts`. If Mode 2 introduces new mutation API routes that need to work during the May 12 relaunch (it shouldn't, since the maintenance lift is May 12 morning), add them to the allowlist with a comment explaining why.
- **Linq outbound is OFF until May 12 morning.** `LINQ_OUTBOUND_DISABLED=true`. Every `createChat`, `sendMessage`, `uploadAttachment` call throws `LinqOutboundDisabledError`. Wrap in try/catch where new code might call them; verify your code path doesn't break when the call throws. Inbound Linq webhook still fires.
- **TypeScript deploy guardrail.** Don't use `as const` on conditional expressions; type dynamic React style helper return values as `CSSProperties`. Run `npm --prefix web run build` before commits that touch typed UI helpers.
- **Push permission lifecycle is canonical.** Use `isPushEligible(...)` from `web/lib/push-permission-lifecycle.ts` for routing. Don't check bare `pushToken` presence.
- **NEPQ messaging voice.** All AI conversation logic goes through `web/lib/ai-voice.ts`. If you're writing client-facing messaging copy, confirm voice rules from `ai-voice.ts` apply (per the Context-Use Guardrail messaging-specific checklist).
- **Anniversary / holiday / birthday are push-only-no-fallback.** Architectural, not tunable. Don't introduce SMS or email fallback paths to those lanes under any condition.
- **Single source of truth for welcome SMS copy.** If you change one of the four locations (`DEFAULT_WELCOME_SMS_TEMPLATE` in `clients/page.tsx`, `buildWelcomeMessage` in `client-language.ts`, `buildPhase1WelcomeBody` in `welcome-action-item-writer.ts`, settings textarea placeholder in `settings/page.tsx`), change all four.
- **Don't push.** Never push to remote without explicit ask. Daniel has Vercel auto-deploy on every push to `main`; pushes go live in ~60s.
- **Update CONTEXT.md** when your changes affect product strategy, architecture, business logic, pricing, or integration with Closr AI. Also update on status changes (e.g. moving an item from "open question" to "decided"). Use the existing `Recent fixes` style.

## 7. How Daniel works

- Founder, solo, not a traditional engineer. Plain language. No jargon-bombing.
- He's been iterating on this relaunch for ~10 days and is tired. Be a real partner, not sycophantic. Short sentences with reasoning beat long sentences with hedging.
- He wants synthetic thinking — read the relevant docs and integrate them BEFORE responding, not piecemeal as he reveals context. The amendment + CONTEXT.md are the integrated picture.
- He's currently in the maintenance window so he's the only "user." He'll test changes himself on his Mac + iPhone setup.
- When you complete commits, push them only when he asks. Daniel has Vercel auto-deploy on `main`; pushes go live in ~60 seconds.
- Apply the Context-Use Guardrail to recommendation-style responses: short preflight (constraints + sources), and end with `Constraints used: ...` and `Sources checked: ...` bullets. Skip the audit only on small mechanical work.
- Daniel commits in worktrees sometimes. Don't be surprised if he mentions a worktree branch like `adoring-solomon-f891a3`. The canonical repo path is `/Users/danielroberts/Developer/insurance-app`; iCloud paths (`~/Library/Mobile Documents/...`) are stale per `.cursorrules`.

## 8. Pre-commit checklist

Run before every commit that touches code:
- `cd web && npx tsc --noEmit` — must be clean.
- `npm --prefix web run build` — must be clean (run at least on the final commit of a session, even if you skip on intermediate commits).
- ESLint on touched files — must introduce 0 new errors / 0 new warnings.
- Mobile-only changes: `cd mobile && ./node_modules/.bin/tsc --noEmit` — should show 0 NEW errors (the 3 pre-existing in `_layout.tsx` are documented baseline).
- Pre-existing-error baseline (don't try to fix unless the file is the focus of your change):
  - `web/app/dashboard/clients/page.tsx`: 6 ESLint errors (two `no-explicit-any`, two `rules-of-hooks`, two `no-unescaped-entities`).
  - `web/components/OnboardingChecklistRail.tsx`: 1 ESLint warning.
  - `mobile/app/_layout.tsx` lines 18 / 103 / 104: 3 `expo-notifications` API type drift errors.

## 9. How to test on Daniel's setup

- Daniel's primary device is **Mac with iPhone (iMessage Continuity)**. Most testing happens here.
- Web: `npm --prefix web run dev` runs the dashboard locally on port 3000. Production is at the live AFL domain.
- Mobile: `cd mobile && npx expo start` for Expo dev client; tap into the EAS dev profile build on Daniel's iPhone if installed. For v1.6.1 testing: TestFlight is the fastest path post-submission.
- Firestore inspection: Firebase console (Daniel has access). Or via `web/lib/firebase-admin.ts` with a small server-side script in `web/scripts/` if you need to inspect doc state.
- Vercel logs: `vercel logs --prod` or via Vercel dashboard.
- PostHog: production project; Daniel has access. Telemetry events live in `web/lib/analytics-events.ts`.
- Linq webhook testing during `LINQ_OUTBOUND_DISABLED=true`: the inbound webhook still fires; the outbound vCard reply throws `LinqOutboundDisabledError`. Check Vercel logs for the activation flow continuing despite the outbound failure (it should — wrapped in try/catch).
- Test client phone: Daniel's iPhone number, or a test client doc he creates manually. Don't text random numbers.

## 10. When you're done with each work block

- Tell Daniel what you changed (commit-message-style summary, not a wall of text).
- List the commits (`git log --oneline -N` for whatever N covers your session).
- Confirm pre-commit checks passed.
- Suggest specific sanity tests on his setup.
- Ask whether to push.
- Update CONTEXT.md `Recent fixes` with a new entry summarizing the work, in the style of existing entries (look at the May 7 entries for length + structure).
- Update `docs/handoffs/` with a new handoff entry IF you're handing off to another session. (Don't write a handoff just for committing your own work; CONTEXT.md is sufficient for that.)

## Final notes

Daniel asked for everything to be finished. Honestly: the May 12 critical path (§5A) is doable in 4 working days; the post-relaunch backlog (§5B) is months of work and should be sequenced with him in pinned scoping conversations, not auto-built. After the May 12 lift, expect Daniel to want a fresh scoping pass on Phase 2 priorities — line-health KPI tiers, retention rewrite, beneficiary mechanic, action item writers — before any of that codes up.

If you find an actual bug or contradiction between the locked specs and the code, raise it with Daniel — don't silently work around it.

The amendment is the result of a long iterative conversation that reached clarity. It's the locked spec for the welcome flow. Trust it. Don't relitigate the architecture; just implement the gaps cleanly.

Good luck.
