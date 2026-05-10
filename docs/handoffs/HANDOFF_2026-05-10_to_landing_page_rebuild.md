# Handoff — May 10, 2026 → marketing landing page rebuild

> **For the agent picking this up.** Daniel ran an "all gas no brakes" sprint May 10. Today closed out Phase 2 (Items 6/7/8 from the May 8 handoff) AND knocked off Track C pricing + KPI tier visibility + Linq copy audit + beneficiary invite mechanic. May 12 relaunch is two days away and the platform is in a solid state. You're picking up the **marketing landing page rebuild** — the last thing left on the priority list before launch week. Read this doc cold and you have what you need.

## Context inheritance

Read in order:

1. `.cursorrules` — load-bearing rules (PDF pipeline lockdown, commit-before-modify, never push without ask, Context-Use Guardrail).
2. `CONTEXT.md` — full file. The single source of truth.
3. `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` — Mode 1 / Mode 2 framing.
4. `docs/handoffs/HANDOFF_2026-05-08_evening_to_phase2.md` — what the May 8 sprint set up.
5. This doc — what May 10 shipped + what's next.
6. `git log --oneline -20` — today's commit history is the source of truth for what shipped.
7. Your memory — Daniel added a critical feedback memory today (`feedback_marketing_narrative_frame.md`) about how to frame AFL marketing copy. **Read it before touching `/v5` or `/m`.**

## What shipped today (May 10, 2026)

10 commits + 1 OTA push. All committed to `origin/main`, all deployed via Vercel (web) or EAS Update (mobile).

| Commit | What |
|---|---|
| [44aae01](https://github.com/drobstl/insurance-app/commit/44aae01) | Welcome `prefilledSmsBody` rename — additive with deprecated alias, drop after June 11 |
| [afda165](https://github.com/drobstl/insurance-app/commit/afda165) | **Item 6: Retention cadence rewrite** — push → 1 Linq SMS → call action item → text action item → email at 48h intervals. 60-day quiet period. Toggle-AI-back-on dropped. |
| [ed87766](https://github.com/drobstl/insurance-app/commit/ed87766) | **Item 7: Cross-lane Action Items dashboard** — replaced `/dashboard/welcomes` with `/dashboard/action-items` tabbed surface across welcome / retention / anniversary / referral lanes |
| [8fc48b5](https://github.com/drobstl/insurance-app/commit/8fc48b5) | **Item 8: Mode 2 bulk-import drip release** — re-enabled Bulk Import CTA, daily cron releases 15/day per agent into the action items queue with cold-context Mode 2 copy |
| [bf3f3de](https://github.com/drobstl/insurance-app/commit/bf3f3de) | Dead-state cleanup — removed unreachable client-side intro-blast state in `clients/page.tsx` |
| [1fd0f48](https://github.com/drobstl/insurance-app/commit/1fd0f48) | **Track C pricing v3** — Starter $29 / Growth $59 / Pro $119 / Agency contact-sales. `/pricing` Next.js route. Legacy charter/inner_circle/standard SKUs deleted. 14-day free trial on Starter+Growth. |
| [5dc255e](https://github.com/drobstl/insurance-app/commit/5dc255e) | Linq line-health copy audit — killed booking URL injection on cold SMS first contact, tightened referral + retention prompts |
| [e5fb91e](https://github.com/drobstl/insurance-app/commit/e5fb91e) | **KPI tier system Phase A** — line-health admin widget at `/dashboard/admin/line-health`. Counters at every Linq outbound + webhook inbound. Visibility only; no auto-throttle yet (Phase B). |
| [5dd3998](https://github.com/drobstl/insurance-app/commit/5dd3998) | Per-tier recommended-action guidance on the line-health widget |
| [5a87169](https://github.com/drobstl/insurance-app/commit/5a87169) | **Beneficiary invite mechanic** — v3.1 invite-only flow. Mobile Invite button (OTA'd same day). Server-side queue-invite endpoint, beneficiary activation handler, webhook routing, multi-policy coalescing. |

**Mobile OTA pushed**: update group `6635b2bf-047f-4863-a156-4d4956518e80`, commit `5a87169`, branch `production`. Beneficiary Invite button live in users' apps on next launch.

**Other operational moves today:**
- `LINQ_OUTBOUND_DISABLED` kill switch flipped to `false` (Daniel) — line is live again
- Stripe: archived 6 legacy AFL products (Charter Monthly/Annual, Inner Circle Monthly/Annual, Standard Monthly/Annual); kept "Per Agent Seat" + "Closr Platform" (those are Closr AI side); created 3 new SKUs (Starter $29, Growth $59, Pro $119) and set their price IDs as `STRIPE_PRICE_ID_STARTER_MONTHLY`, `STRIPE_PRICE_ID_GROWTH_MONTHLY`, `STRIPE_PRICE_ID_PRO_MONTHLY` in Vercel. Legacy env vars (`STRIPE_PRICE_ID_CHARTER_*`, `STRIPE_PRICE_ID_INNER_CIRCLE_*`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`) deleted.

## What's next: marketing landing page rebuild

**Scope:** surgical update. Keep existing visual structure / Framer Motion animations / leaky-bucket calculator on `/v5` (desktop, 786 lines) and `/m` (mobile, 970 lines). Replace outdated copy section by section. NOT a full rebuild.

**Estimate:** ~2 days.

### Locked narrative direction

> **CRITICAL — read `feedback_marketing_narrative_frame.md` in memory first.** Daniel corrected the narrative direction mid-planning today. The lock:
>
> AFL marketing copy speaks to **agent business outcomes**, not platform mechanics. Lead with the 3x book / more referrals / fewer losses / more rewrites story. **Never** lead with line health, Linq, KPI tiers, conversation budgets, push permission lifecycle, action items collection, retention cadence stages, or any other internal architecture. Those are real, they matter to Daniel as a business owner — they're not customer-facing value.

The locked positioning:

> AFL turns your existing book into your biggest growth engine.

Three value levers, in priority order — each is a number the agent feels in their business:

1. **More referrals out.** Every client has a one-tap referral button. AI engages the referral on iMessage, qualifies them, books on the agent's calendar. Warm referrals on autopilot.
2. **Fewer policies lost.** When a policy lapses or cancels, AFL reaches out automatically AND flags the ones that need the agent's personal touch. Saves happen instead of slipping past.
3. **More rewrites earned.** Every anniversary becomes a booked appointment. Automated outreach beats the carrier auto-renewing on the agent.

The **3x math** is Daniel's framing: every closed sale should pay three times — once at close, once at the referral, once at the anniversary rewrite. Agents are realizing 1 of 3 because they don't have tools to automate the other two. AFL captures all three.

### Hero line — IN ACTIVE DELIBERATION

Current hero (still on the page):

> Chargebacks happen when clients forget you exist.
> We built a system that makes sure they never do. A branded app on their phone. An AI that never sleeps.
> - Stopping chargebacks before they happen.
> - Delivering warm referrals on autopilot.
> - Catching every rewrite opportunity.

The existing hero is well-crafted — strong loss frame, agent language, concrete mechanism, three bullets covering all three 3x levers. The audit recommendation was **not** to rewrite it, but to either:

- **Minimal change**: replace ONE line — `"Chargebacks happen when clients forget you exist."` → `"You're getting 1 out of 3 sales."` — and update the connector paragraph from `"We built a system that makes sure they never do"` to `"We built the system that captures all three."` Everything else stays.
- **Or:** keep the hero exactly as-is and add a "1 of 3 math" callout in a body section near the calculator.

Daniel was deliberating when this session wrapped. **Confirm with Daniel before touching the hero.** Default to the minimal change above unless he says otherwise.

### Surgical section-by-section plan

| Section | Current state | Change |
|---|---|---|
| Hero | Strong, three bullets aligned with 3x levers | Minimal change OR leave (see above) — confirm with Daniel |
| Referrals | "AI texts referral via iMessage" — aligned | Light copy refresh; keep screenshots |
| Rewrites / Anniversary | "Every anniversary is a booked appointment" — aligned | Keep; tighten copy |
| **Retention (BIG REWRITE)** | "AI extracts the client info... Day 2/5/7 drip" — outdated mechanism description | Rewrite to value frame: "AFL reaches out automatically when a policy slips, and surfaces the at-risk ones that need YOU." NO "Day 2/5/7" mechanic detail. NO line-health mention. |
| Holiday cards / touchpoints | Aligned | Keep |
| Pipeline diagram | Aligned | Keep |
| Pricing section | Just updated for Track C (commit 1fd0f48) | Keep |
| FAQ | Already updated for Track C | Light review; consider adding a 3x-math FAQ ("How does AFL 3x my book?") |
| Founding member references | Cohort closed | Remove |
| **Missing — welcome flow** | Not mentioned anywhere | NEW small section: "Onboarding that actually finishes" — agent sends one tap, client installs + activates, contact card lands automatically |
| **Missing — action items dashboard** | Not mentioned | Light callout: "Your dashboard tells you which conversations need you personally — not all of them" |
| **NEW — 3x math callout** | n/a | Add a section near the leaky-bucket calculator that makes the "every sale should pay three times" math explicit |

### Things specifically NOT to mention anywhere on the rebuilt page

(Per `feedback_marketing_narrative_frame.md`.) These belong in internal docs, not on `/v5` or `/m`:

- Line health, line reputation, line capacity, KPI tiers
- Linq, the pooled SMS line, message budgeting, conversation caps
- Carrier filtering, deliverability, STOP rates, T-Mobile filtering
- 50/day cap, KPI thresholds, push permission lifecycle
- Internal architecture (action items Firestore collection, welcome flow amendment, retention cadence stages, bulk-import-drip cron)

### Screenshots audit

Existing assets (mostly still accurate, don't replace unless flagged):
- `screenshot-referral-sent.png` — referral sent confirmation. Still accurate.
- `screenshot-referral-message.png` — referral message with business card. Still accurate.
- `screenshot-rewrite-convo.png` — AI rewrite conversation. Still accurate.
- `screenshot-rewrite-app.png` — rewrite rate review in app. Still accurate.
- `screenshot-retention-message.png` — conservation message. Still accurate.
- `screenshot-retention-booking.png` — booking calendar. Still accurate.
- `screenshot-thanksgiving-card.png` — holiday card. Still accurate.

If you discover one looks dated (e.g. UI has shifted), flag it to Daniel before substituting; don't bake replacement into the rebuild silently.

## Carry-forward items (calendar reminders)

| Date | Task | Why |
|---|---|---|
| ~June 4 | Delete `/api/client/welcome-sms` and `/api/client/send-bulk-intro` server routes | 30-day cooldown post-Track-B + Item 8 cutover. Marked `@deprecated` already. |
| ~June 9 | Delete `/api/beneficiary/send-intro` server route | 30-day cooldown post-beneficiary-invite cutover (May 10). Marked `@deprecated` already with console warning. |
| ~June 11 | Drop deprecated `displayContext.welcomeMessageBody` alias from `web/lib/action-item-types.ts` | 30-day cooldown post-rename. All in-flight welcome action items will have expired by then. |
| When data lands | **KPI tier system Phase B** (auto-throttle enforcement) | Watch the `/dashboard/admin/line-health` widget for 1-2 weeks of real reply-rate data. Confirm spec thresholds (15%/20%/25%) match AFL traffic before wiring auto-throttle gates. Per strategy doc, "auto-throttle is provisional pending data." |
| Pending Linq response | **Per-carrier overlay metrics** (STOP rate, T-Mobile delivery, 30007/30008 codes) | Daniel has a draft email to Ben (his Linq contact) ready to send — content is in the conversation history. Awaiting response on what carrier-level signals Linq exposes via webhook. |
| Phase 3 | **Conversation counter** | Per-agent monthly bucket. Foundation for overage billing. Spec'd in CONTEXT.md but deferred pending need. |
| As needed | Stripe customer cleanup for 4 founding members with CCs on file | Inert customer records, harmless to leave. Daniel said he'd handle manually if needed. |

## Pre-commit baseline (carry-forward)

- Web `npx tsc --noEmit -p web/tsconfig.json` clean.
- Web ESLint pre-existing baseline: 6 errors in `clients/page.tsx` (two `no-explicit-any`, two `rules-of-hooks`, two `no-unescaped-entities`); 1 warning in `OnboardingChecklistRail.tsx`; 1 warning in `referral-ai.ts` (`recordExperimentOutcome` unused). Don't fix unless that file is the focus of your change.
- Mobile `tsc` baseline: 3 pre-existing errors at `mobile/app/_layout.tsx` lines 18 / 103 / 104 (expo-notifications API drift). Don't fix.
- Mobile `policies.tsx` has 1 pre-existing useEffect exhaustive-deps warning at line 63. Don't fix.

## Vercel + EAS state

- All commits through `5a87169` are on `main` and Vercel-deployed.
- Mobile binary: v1.6.1 build 37 (iOS) / versionCode 29 (Android), in stores.
- Latest OTA update: `6635b2bf-047f-4863-a156-4d4956518e80` (commit `5a87169`), shipped May 10.
- `LINQ_OUTBOUND_DISABLED` is **false** in Vercel — line is live.
- `MAINTENANCE_MODE_READONLY` is **false** in Vercel — dashboard fully writeable.
- `REACTIVATION_FENCE_AT` is **not configured** — available in `web/lib/reactivation-fence.ts` if Daniel wants belt-and-suspenders.

## How Daniel wants to work right now

- "All gas no brakes" through May 12 relaunch (~2 days from this handoff).
- Push and OTA after every meaningful commit so he can verify on his iPhone.
- He runs binary submissions himself; OTA via `eas update` Claude can run with explicit instruction.
- Ask before destructive / hard-to-reverse actions. Don't ask before normal local edits.
- He'll push back fast on overengineering — keep proposals scoped and pragmatic.
- **Frame everything from the agent's POV.** This was the big lesson of May 10 — see `feedback_marketing_narrative_frame.md` in memory.

Good luck. The landing page is the last thing on the list before launch week. Once it ships, AFL is in a state where the next priorities are post-launch hardening (Phase B auto-throttle, per-carrier overlays, conversation counter) — not pre-launch scrambles.
