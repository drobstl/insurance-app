# Handoff — May 8, 2026 evening → Phase 2 (retention + Mode 2 bulk)

> **For the agent picking this up.** Daniel ran an "all gas no brakes" sprint May 8 to set up the May 12 relaunch. We shipped the welcome flow inversion + Phase 2 anniversary/referral action item writers. You're picking up at the retention cadence rewrite + Mode 2 bulk import, the two biggest remaining pieces. Read this doc cold and you have what you need.

## Context inheritance

Read in order:

1. `.cursorrules` — load-bearing rules (PDF pipeline lockdown, commit-before-modify, never push without ask, Context-Use Guardrail).
2. `CONTEXT.md` — full file. The single source of truth.
3. `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` — Mode 1 / Mode 2 framing.
4. `docs/handoffs/HANDOFF_2026-05-08_to_claude_code.md` — Cursor's morning handoff that kicked off today's work.
5. `git log --oneline -30` — today's commit history is the source of truth for what shipped.
6. Your memory — I've added several feedback memories today (no skip on Activate, EAS-bundles-from-cwd, match-scope-to-data).

## What shipped today (May 8, 2026)

**Reactivation safety pass (morning):** Pre-relaunch audit + small toolkit. Audit found 0 active backlog state across 27 agents. New `web/lib/reactivation-fence.ts` Layer-2 gate (auto-expiring), welcome-activation rollback bug fix, audit + nuke scripts.

**Activate screen iteration (afternoon, multiple commits):** Started as a redesign of the existing post-login Activate screen. Three iterations (v1 → v2 → v3). Then Daniel pivoted: instead of polishing the post-login version, **invert the flow** so Activate runs BEFORE login. The argument: activation + notification permission are the two critical capture steps; personalization (agent photo, name) is nice-to-have, not crucial. Inversion lets us capture the critical actions BEFORE the friction of code entry.

**Mobile flow inversion (commit `9c4d78e`):** New default route is the depersonalized Activate screen. After SMS sent → `/login` (new route, code-entry form lifted from index.tsx). After login → `/agent-profile`. Auto-login from cached session bypasses Activate. Fresh installs go through Activate first.

**Activate screen v3 final state (commit `bb1f736`):**
- Title: "You're almost in."
- Photo placeholder: AFL infinity icon (from `mobile/assets/icon.png`) instead of agent photo
- Body: one short line — "Tap Activate to text your agent's office line at +1 (404) 645-3010."
- Numbered steps anchored to bottom, arrows inline next to text:
  - **1. Tap "Allow"** ⤴
  - **2. Then tap Activate** ⤵
- Activate button: pulse animation + teal accent border + glow shadow
- Hint: "Opens Messages with your hello pre-written — just tap Send."
- Generic SMS body: "Hi! I just downloaded the AgentForLife app — ready to connect. Keep me updated."
- Fixed permission bug: re-checks `Notifications.getPermissionsAsync()` after the prompt instead of trusting the token-fetch return value.

**Web SMS copy step swap (commit `37e4902`):** Welcome SMS step order swapped to match the new mobile flow:
> 1. Download
> 2. Tap Activate, then tap Send
> 3. Log in with code {code}

Updated all 4 English locations + minimal Spanish addition (`toca Activar y luego` before `ingresa con el codigo`).

**Phase 2 action item writers (commits `a1635a6`, `9ab2fa8`):**
- `web/lib/anniversary-action-item-writer.ts` (NEW). Wired into `policy-review` cron (Job B initial outreach skip block) and `policy-review-drip` cron (drip stage skip block). Idempotent per (client, cycleYear).
- `web/lib/referral-action-item-writer.ts` (NEW). Wired into `referral-drip` cron with a new scan loop for `drip-complete` referrals 24h+ stale with no client reply since lastDripAt. Idempotent per referralId.
- Both writers mirror the welcome writer pattern (Track B, May 5).

**Other small items shipped today:**
- Floating autosave indicator on Settings page (commit `b0ec34b`)
- Last-First name parsing fix for inline welcome SMS (commit `aa13220`)
- Cohort relaunch email draft at `docs/cohort_relaunch_email_2026-05-12.md` (commit `ffc03f7`)
- Fresh EAS production builds completed (iOS build `4cf2f063` / Android `71462c71`); Daniel submitting manually from terminal (in flight at handoff time).

## What's left for May 12

Daniel reframed scope to "all gas no brakes" — try to land all of Phase 2 + as much Phase 3 as possible before May 12 morning. Four working days available. Realistic estimate I gave him: items 1-7 are tight-but-doable; items 8+ stretch beyond unless he's OK with rough edges.

### Items remaining in priority order

**6. Retention lane action item writer + lapse/retention cadence rewrite.** This is THE big one. Pre-this work the retention chain is the legacy SMS-heavy cadence in `web/app/api/cron/conservation-outreach/route.ts` (Stage 1 Push → Stage 2 Text 24h → Stage 3 Email day 3 → Stage 4 Push day 7). The new cadence per `CONTEXT.md > Channel Rules`:

- Push first
- 1st SMS automatic via Linq if push unavailable/unengaged
- **Action item created when 1st SMS goes 48h without reply OR 5d unresolved** (whichever fires first)
- "Toggle AI back on" mechanic on the action item — if agent toggles, chain resumes with 2nd-touch email + final SMS at end of campaign
- 60-day quiet period after campaign ends

**Action item card UX (Daniel's May 8 evening call — Model A locked):**
- ONE Firestore doc per stalled retention (idempotency key = conservationAlert id + touch index, per `actionItemIdempotencyKey.retention(...)`).
- TWO prominent CTAs on the card:
  - **`📞 Call`** — opens `tel:` URL on agent's phone (uses `subjectPhoneE164` from displayContext)
  - **`💬 Text personally`** — opens `sms:` URL with a STATIC pre-populated body (per-lane template, NOT agent-customizable in Settings). The static template lives in code (suggest `web/lib/retention-action-item-writer.ts > buildPretextRetentionSms` or similar). Mirror the welcome card's `text_personally` action.
- Smaller secondary actions: `Toggle AI back on` (re-enable AI on the conservationAlert), `Send templated email` (server-side templated send), `Skip` (close without action).
- Card style: same visual primitive as `WelcomeActionItemCard` but with the two big CTAs instead of three. Reuse the platform-detect helper from `web/lib/sms-url.ts`.

The writer goes at `web/lib/retention-action-item-writer.ts`. Trigger reasons: `retention_first_sms_unanswered_48h`, `retention_first_sms_unresolved_5d`. Suggested actions are already defined in `web/lib/action-item-types.ts:94` — `text_personally`, `call`, `send_templated_email`, `toggle_ai_back_on`, `skip`. The `text_personally` action's pre-filled SMS body is NEW infrastructure for this lane (welcome lane's `welcomeMessageBody` field on `displayContext` doesn't fit semantically, so add `retentionMessageBody` or similar — or better: rename the field generically to `prefilledSmsBody` so anniversary's future text-personally action has somewhere to put its body too).

The toggle-AI mechanic is the new behavioral piece: a flag on the conservationAlert doc (`aiPausedAt`, `aiResumedAt`?) that the action item card writes when the agent taps "Toggle AI back on", and that the conservation-outreach cron reads to decide whether to resume the chain. Design this carefully — it's a state machine and gets bug-prone fast.

Effort: ~2-3 days realistic for a clean implementation including tests.

**7. Cross-lane dashboard surface for action items.** Anniversary + referral writers shipped today, but `/dashboard/welcomes` filters lane='welcome' only, so anniversary and referral items live in Firestore invisible to the agent. Build a lane-agnostic surface OR add per-lane filters to the welcomes page OR build separate `/dashboard/anniversaries`, `/dashboard/retention`, `/dashboard/referrals` pages.

Recommend: extend `/dashboard/welcomes` → rename to `/dashboard/action-items` or add a top-level "Action Items" nav with lane tabs. Reuse `WelcomeActionItemCard` as the base component. Per-lane the card needs slightly different actions (anniversary: text/call/skip; retention: text/call/email/toggle-ai/skip; referral: text/call/skip).

Effort: ~1-2 days.

**8. Mode 2 bulk import drip engine.** Re-enable the bulk import UI (currently struck through with "Currently under construction" in `web/app/dashboard/clients/page.tsx`). Build:
- Drip-release cron at `web/app/api/cron/bulk-import-drip-release/route.ts`. Daily, releases ≤15/day per agent from the bulk-imported batch into the `actionItems` collection (lane='welcome', source marker `'bulk_import'`).
- Window rules: 9am-6pm recipient-local, no weekends, no Friday after 4pm.
- ≥3 message variants per v3.1 §7. Daniel needs to sign off on the variant copy before code lock.
- Notification path: daily Web Push to the agent when their batch is ready. Existing `web/lib/web-push-lifecycle.ts` and `/api/agent/web-push/*` routes are in place; just need a new cron at `web/app/api/cron/bulk-import-batch-ready-notification/route.ts` and a daily-batch query on the queue page.
- PWA + Web Push become a hard requirement at the moment the agent initiates bulk import (per amendment §4.2). Add a wizard step.

Effort: ~2-3 days.

### Post-May-12 items (lower priority)

9. Email infrastructure cleanup (Resend centralization, bounce/complaint webhook, suppression list) — ~1-2 days
10. KPI tier system + line-health widget + auto-throttle — ~3 days
11. Beneficiary invite mechanic — ~3-5 days
12. Track C pricing tiers in Stripe — ~3-5 days
13. Concierge add-on — ~2-3 days

## Locked product decisions today (do NOT relitigate)

These were Daniel calls today; they override prior CONTEXT.md / amendment text:

- **No skip on the client-side Activate screen.** Activation is a hard gate. Memory `feedback_no_client_activate_skip` has the rationale.
- **Flow inversion: activate-first, then login.** Reverses CONTEXT.md `Channel Rules > The two-step welcome flow` ordering. Welcome SMS step order matches.
- **Generic SMS body** ("Hi! I just downloaded the AgentForLife app — ready to connect. Keep me updated."). Personalization deferred — line-health rules apply to outbound, not inbound, so this is fine. Deep link with code is a future polish path that brings personalization back without rebuilding flow.
- **AFL infinity icon as photo placeholder** in the depersonalized Activate flow.
- **Founding 34 will start over on relaunch.** No backfill of state, no migration of in-flight campaigns. The May 8 audit confirmed 0 active state to worry about.
- **App store submissions = production review** (not just internal). iOS goes through TestFlight first, manual promote in App Store Connect. Android internal track first, smoke, then promote.
- **Referral chain capped at 2 Linq SMS max** (initial outreach + drip 1). Drip 2 (Day 5) and drip 3 (Day 8) dropped. After drip 1, AI is done; 24h later the action item fires for agent personal call. Reason: too many unanswered outbound SMS to strangers is risky for line reputation. Shipped tonight in a follow-up commit to `9ab2fa8` — referral-drip cron's `DRIP_STATUSES` shrunk to `['outreach-sent']` only, action item scan now queries `status='drip-1'` (the new terminal state).
- **Retention action item card uses Model A: ONE card with TWO prominent CTAs.** Per Daniel's call: card shows `[📞 Call] [💬 Text personally]` as two big buttons, not two separate Firestore docs. Model B (two separate items per stalled retention) was considered and rejected — feels duplicative when both items are about the same client. The text-personally pre-populated message is **STATIC** (per-lane template), NOT agent-customizable in Settings. Same as the welcome card pattern but with two CTAs instead of three.

## Open questions / things untested

- **A1b full E2E with real iPhone install of v1.6.1 build 37 + the OTA bundle** has not been completed. Daniel was force-quitting + reopening between OTA updates today. The cold-install path (delete + reinstall via TestFlight) was hit briefly but the final v3 + flow inversion combo wasn't walked end-to-end. Worth doing once Daniel finishes the manual store submissions.
- **Anniversary + referral action item writers have no UI surface.** Items get created but agents can't see them. Item 7 above closes this loop.
- **Retention writer + cadence rewrite have not been started.** Item 6 is your main task.
- **Welcome activation handler's vCard MMS reply is fully personalized server-side** (agent's name, NEPQ voice, vCard attachment). Unchanged by the flow inversion. Confirmed working under `LINQ_OUTBOUND_DISABLED=true` (gracefully suppresses without rolling back the activation per the May 8 fix).
- **Spanish welcome copy** is still on the v3.1 paragraph form with the May 8 minimal addition (toca Activar y luego). Full re-translation to numbered-step structure is open.

## Vercel + EAS state

- All commits through `9ab2fa8` are pushed to `main` and Vercel-deployed.
- iOS build `4cf2f063-1900-4aa5-9c9e-121f36401058` (1.6.1 build 37) — finished, ready to submit
- Android build `71462c71-beff-47fe-850c-6ba1310f44de` (1.6.1 versionCode 29) — finished, ready to submit
- Daniel is running `eas submit` manually for both
- `MAINTENANCE_MODE_READONLY=true` and `LINQ_OUTBOUND_DISABLED=true` are still on. May 12 morning Daniel flips both `false`.
- `REACTIVATION_FENCE_AT` is NOT configured. Available in `web/lib/reactivation-fence.ts` if Daniel wants belt-and-suspenders for the lift.

## Pre-commit baseline (carry-forward)

- Web `npx tsc --noEmit -p web/tsconfig.json` clean.
- Web ESLint pre-existing baseline: 6 errors in `clients/page.tsx` (two `no-explicit-any`, two `rules-of-hooks`, two `no-unescaped-entities`); 1 warning in `OnboardingChecklistRail.tsx`; 2 warnings in `policy-review-drip/route.ts` (agentEmail/agentPhone unused). Don't fix unless that file is the focus of your change.
- Mobile `tsc` baseline: 3 pre-existing errors at `mobile/app/_layout.tsx` lines 18 / 103 / 104 (expo-notifications API drift). Don't fix.

## How Daniel wants to work right now

- "All gas no brakes" — try to land Phase 2 in 4 days even though the realistic estimate is 12-20 days.
- Push and OTA after every meaningful commit so he can verify on his iPhone.
- He runs binary submissions himself; he expects you to handle code + commits.
- Ask before destructive / hard-to-reverse actions. Don't ask before normal local edits.
- He'll push back fast on overengineering — keep proposals scoped and pragmatic.

Good luck. The retention rewrite is the most consequential remaining piece. Take your time on the state machine; it touches saved-policy revenue.
