# AFL Backlog

> **Living working list** of what's on tap, organized by category and risk. Update as items ship (move to Recently Shipped), get bumped (move between sections), or drop out of scope (remove with a one-line `> dropped because…` note).
>
> **Source of truth for deeper context:** `CONTEXT.md` + `docs/AFL_Growth_Distribution_Lock_2026-05-30.md`. This doc is the short, scannable working list — not the full strategy.
>
> **Status conventions:**
> - 🟡 Open — not started
> - 🟢 In progress — a session is actively working on it; Notes column says which session / branch / PR
> - 🔴 Blocked — work paused with the reason in Notes
> - ✅ Shipped — moves to the "Recently shipped" section at the bottom with its PR #
>
> **Last re-ranked:** May 31, 2026 evening — folds in the May 30 Growth + Distribution Lock (no-card 30-day Pro entry, permanent Free tier, Performance gating, Starter migration, FirstPromoter affiliate, IMO leader free seat, FFL/Rob distribution priority).

---

## 🚨 Acute — finish today/tonight

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Smoke-test live Growth signup end-to-end | ~30 min | Daniel (Stripe Checkout needs hands) | Test card 4242 → walk full flow → verify Firestore + welcome email arrives. Real card live test after. |
| 🟡 Verify Activate-reply fix (PR #69) on a real device | 5 min | Daniel | Trigger a fresh client activation → confirm welcome text + action item auto-completes. New diagnostic logs in `welcome-activation-handler.ts` will pinpoint any residual issue. |
| 🟡 Verify Compliance Part 1 (PR #70) on the live Linq line | 5 min | Daniel | Text "STOP" to the AFL line → expect confirmation reply + `suppressed_numbers/{phoneE164}` doc + `consent_events` ledger entry. Then text "START" to verify resubscribe. |

---

## 🚀 Entry-mechanism cutover — the May 30 strategy shift

The biggest net-new work area. Per `docs/AFL_Growth_Distribution_Lock_2026-05-30.md`: new agents sign up with **no card**, get **30 days of full Pro**, then default to a **permanent Free tier** unless they pick a paid plan. This replaces the card-at-signup flow (PR #38) as the front door. Multi-week build broken into stages — DO NOT touch `/pricing` or marketing CTAs until the cutover ships as one coordinated change.

| Item | Effort | Notes |
|---|---|---|
| 🟡 **No-card signup flow** (email + name + phone, no payment) | 2–3 days | New `/signup` surface that creates the Firebase user + Stripe customer (no subscription) + `agents/{uid}` doc with `tier: 'trial'`, `trialStartedAt`, `trialEndsAt` (30 days out). |
| 🟡 **30-day Pro feature unlock** during trial window | 1–2 days | Tier-gating helpers check `tier === 'trial' && trialEndsAt > now` → grant Pro-equivalent access. Existing `canAccessLeads` / `canAccessActivity` etc. get a trial branch. |
| 🟡 **Day-25 plan-choice email** | ~half day | Cron at day-25 of trial → email: *"Pick your plan in 5 days — Pro $99, Growth $49, or stay Free with limits"* with explicit picker links. Stripe Checkout starts from those links. |
| 🟡 **Day-30 default-to-Free auto-transition** | ~half day | Cron at day-30 → if agent hasn't selected a paid plan, set `tier: 'free'`, `subscriptionStatus: 'free'`. No charge, no interruption, just feature gating tightens. |
| 🟡 **Free tier feature gating + caps** | 1–2 days | 25-contact hard cap on `clients` collection writes, 5-PDF/month cap on the upload pipeline, cadences ENABLED on those 25 (touch the conservation/anniversary/holiday cron eligibility), Activity Policy Ledger / bulk-import / pre-sale features hidden. Upgrade prompts explain which tier resolves each cap. |
| 🟡 **Starter $29 → Growth feature migration** | ~half day | Existing 11 Starter customers: keep $29/mo price (grandfather), unlock Growth feature set in code (tier-gating helpers treat `tier === 'starter'` as Growth-equivalent). One-time announcement email. |
| 🟡 **Performance feature metering on Growth** | 1 day | Growth gets 4 Performance scores/month (Free: 0, Pro+: unlimited). New per-month counter on `agents/{uid}.performance.usedThisMonth`. Resets on billing-cycle anchor. UI shows remaining count. |
| 🟡 **Pricing-page cutover** (4 tiers including Free, signup-first CTAs, remove Coming Soon pills) | ~half day | Tear out the `comingSoon: true` flags. Pricing page becomes informational comparison (not transactional). Marketing CTAs point at the new `/signup` surface. Ships as one coordinated change when the no-card flow is built and tested. |
| 🟡 **IMO leader free-seat mechanic** | 1 day | When an IMO leader's referred-agent count crosses 10, auto-grant them a free Growth-equivalent seat. Tracked via `agents/{leaderUid}.imoLeader.activeDownlineCount`. |
| 🟡 **Decide:** PR #38 (pre-pay signup) — keep as the explicit-paid-pick path, or rewrite? | Decision-only | Talk through how the no-card entry coexists with PR #38's card-at-signup flow. Probably: PR #38 stays as the path when an agent explicitly picks paid mid-trial or at day-30; the no-card flow is the default front door. |

---

## 🤝 Distribution — FFL/Rob priority

Per the May 30 lock: ~50K-agent network, Rob actively driving signups, highest-leverage lever on the board. Mix of operational + light-engineering work.

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Commission schedule letter to Rob (20% year-1, per §6 of the strategy doc) | 30 min | Daniel | Doc-only. Memorialize the terms. |
| 🟡 Issue Rob a FirstPromoter tracking link | 5 min | Daniel (FirstPromoter dashboard) | One-line in the dashboard. |
| 🟡 One-page pitch script for the next national call | 1–2 hr | Daniel + Claude | Marketing copy. Daniel drafts the pitch, Claude polishes. |
| 🟡 30/60/90-day FFL signup targets | 30 min | Daniel + Claude | Decision-only — sets the joint review cadence. |
| 🟡 Onboard 5–10 additional high-reach affiliates | Ongoing | Daniel | Each gets their own FirstPromoter link + a simple promo kit (copy, screenshots, calculator angle). |
| 🟢 Refer & Earn dashboard nav + page cosmetic polish | ~1 hr | Parallel session | **In flight — May 31.** Cosmetic follow-up on top of the shipped Refer & Earn page (PR #72). |

---

## 🔧 Small wins — under 2hr each

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Update dial script with Daniel's actual sales script | 30–60 min | Daniel + Claude | Default lives in `web/lib/dial-script.ts`; per-agent override in Settings → Lead-mode. Daniel pastes script, Claude wires it in. |
| 🟡 Founding-member approval email copy refresh | 15 min | Claude | Drops dead "no CC" line + dead `/signup` link from `web/app/api/admin/applications/approve/route.ts` email template. |
| 🟡 Founding 34 → Pro $50 Stripe Coupon (`FOUNDING34_PRO`) | 5 min | Daniel (Stripe Dashboard) | $50/mo recurring forever. Required if founding mechanic stays after May 30 strategy. |
| 🟡 Verify failing e2e specs are actually fixed | 15 min | Claude | Old memory said 3 specs broken; recent CI green. Reconcile. |
| 🟡 Deep-link in activation reply that opens the AFL app back up | 30–60 min once activate-reply bug is fixed | Claude | Universal Links + App Links recommended. Bundle with the activate-reply fix (PR #69). |
| 🟡 Refer & Earn nav + CTA subtle "breathing" animations | ~1 hr | Claude | **Daniel-locked direction Jun 1: calm/breathing, always idle-animate.** Two surfaces, shared 3–4s rhythm so they feel coherent. **Nav button (sidebar):** soft pulse on the existing gold accent — opacity 0.6 ↔ 1.0 over 3–4 seconds — plus hover intensify (gold expands/brightens). Lives in `web/app/dashboard/layout.tsx`. **CTA button ("Get my referral link" on the Refer & Earn page):** gentle teal `box-shadow` halo pulse (4–8px, 2–3s cycle), plus hover lift (`translateY(-2px)` + glow intensify), plus click tactile feedback (0.97 scale snap on mouse-down, snap back on release). Lives in `web/app/dashboard/refer-and-earn/page.tsx`. **Composition story:** the shared rhythm connects sidebar to page so the whole referral surface feels alive but calm. No shimmer sweeps, no notification dots, no arrow nudges — those were considered and rejected as too salesy / wrong job-to-be-done framing. Tailwind config gets two new `@keyframes` (one for opacity-pulse, one for shadow-halo); reuse a `motion-safe:` modifier so users with `prefers-reduced-motion` get static states. |

---

## ⚖️ Legal — protect the shared line

| Item | Effort | Notes |
|---|---|---|
| 🟡 Compliance Part 2 (full consent log: welcome opt-in capture + conservation contact-basis log) | ~1 day | Part 1 shipped May 31 (PR #70). Part 2 adds the missing opt-in capture moments — currently only resubscribe/help paths write `opt_in` events; the welcome-activation handler is unchanged. |
| 🟡 Compliance Part 3 (richer-channel detection, FL-specific edge cases) | TBD | Optional refinement |

---

## 🚀 Pro features — what makes Pro worth $99/mo at day 31

Pro is no longer "Coming Soon" — every new agent gets it for 30 days under the new strategy. The work below is what makes Pro worth PAYING for once the 30 days expire.

| Item | Effort | Notes |
|---|---|---|
| 🟢 BunnyStream video integration for mobile lead-home (intro + FAQs + case studies) | Multi-day | **In flight — parallel session May 31.** Replaces / supplements `agentProfile.leadContent` with BunnyStream as the video CDN. Mobile lead-home rendering + upload + manifest endpoints. |
| 🟡 **MIA lead extraction (handwritten Mail-In OCR)** ⬆️ *bumped per Daniel May 26* | 1–2 days | Claude vision for handwritten Mail-In Application PDFs → structured fields. Rob's call action item #2. |
| 🟡 **Performance page MVP (call scoring + AI coaching)** | 3–5 days | Paste call transcript → Claude scores against ideal script → coaching feedback. **Gating per May 30 lock: Growth gets 4 scores/month, Pro unlimited.** |
| 🟡 **SME / FIF tracking** | 2–3 days | Appointment + APV-split tagging for mortgage-protection → IUL specialist referrals. CONTEXT backlog. |
| 🟡 Virtual-number dialing from the lead queue (investigation) | TBD scoping | Today's `tel:` URL only dials from primary cell; Funnel supports virtual numbers. See PR #61 for the full scoping notes. |

---

## 🏢 Agency tier — sales-led; build follows the band-pricing decision

Agency stays sales-led until the band-pricing decisions land. Then it unlocks team-aggregation features.

| Item | Effort | Notes |
|---|---|---|
| 🟡 **Agency band pricing decisions** (9 open Qs in CONTEXT § Pricing band parking lot) | 30 min decision-only | **Unblocks everything below.** Sets band sizes + floor + how agent count is measured. |
| 🟡 Team Performance dashboard (leaderboards + coaching priorities widget) | 2–3 days | Sits on top of individual Performance. Rob's call action item. |
| 🟡 Team admin tools + per-agent dashboards | 3–5 days | |
| 🟡 Pooled conversation budget across all seats | 1–2 days | Depends on conversation counter (infrastructure below) |
| 🟡 Mentor calendar | 2–3 days | CONTEXT backlog. |
| 🟡 Chargeback comparison vs Symmetry average | 1–2 days | Single manual number until a Symmetry data feed exists. Rob's call action item #10. |
| 🟡 ROI calculator for agency dashboard | 1–2 days | Real-time ROI across team production. Rob's call action item #9. |

---

## 💰 Infrastructure — Phase 3 enablers

| Item | Effort | Notes |
|---|---|---|
| 🟡 Conversation counter + overage enforcement | ~1 week | Per-agent monthly counter + dashboard widget + 80%/100% notifications + Stripe metered SKU + cap-aware send logic. **Policy locked May 26:** auto-prompt upgrade at 80% + auto-bill overage at $0.50/conv. Unlocks Agency pooled budget. |
| 🟡 Pricing rollout validation with first 5–10 agent cohort | Ongoing | Watch real signups, fix what breaks |

---

## 📦 Backlog (not yet phased)

Strategic items captured so they don't get lost — pull into a tier section above when their phase opens.

| Item | Notes |
|---|---|
| 🟡 Agency Rocket partnership discovery call | Rob's call action item #3 — non-engineering, Daniel-led |
| 🟡 LettrLabs direct mail integration | Automated postcards + robotic handwritten letters. Fits the branded-touchpoint pitch. Variable per-send cost → Pro+ add-on with usage billing. URL: https://www.lettrlabs.com |
| 🟡 Email infrastructure cleanup (Resend centralization, bounce/complaint webhook, suppression list) | Phase 2 backlog. Overlaps with compliance Part 1/2 suppression — design once, ship in two PRs (SMS first, email second). |
| 🟡 Auto-throttle at KPI Tier 1 / Tier 2 | Phase 2 backlog. Deferred until 1–2 weeks of real reply-rate data. |
| 🟡 Phase 2 success metrics dashboard | Phase 2 backlog. Welcome-send compliance, activation rate, thumbs-up rate, retention reply rate. |
| 🟡 Reach out to Jeff (Intelra) | Rob's call action item #11 — non-engineering |
| 🟡 Configurable production-month boundary for Activity APV lifecycle | Pro-tier follow-on. Symmetry runs 28th → 28th, not calendar month. Agent-level `productionMonthStartDay` setting + IMO presets. Triggered when an agent complains their numbers don't match their commission statement. |
| 🟡 Mobile client onboarding redesign: split Activate screen + add notification pre-prompt | Multi-day mobile EAS. X-app pattern with pulsating-blue-ring Allow → separate Activate screen with compliance verbatim consent copy. Bundles with Compliance Part 1 ship (both touch the Activate screen). |

---

## ✅ Recently shipped

When a backlog item ships, move it here with its PR # and date. Older items get pruned monthly into CONTEXT.md's timeline.

| Item | PR | Shipped |
|---|---|---|
| AFL compliance layer Part 1: opt-out suppression + STOP/HELP/START + consent ledger + Activate verbatim consent copy | #70 | May 31 |
| Activate-reply fix: decouple vCard MMS, add diagnostic logs | #69 | May 31 |
| FirstPromoter affiliate plumbing + Refer & Earn dashboard page | #58, #71, #72 | May 28–31 |
| Growth + Distribution Lock doc landed on main | #74 | May 31 |
| CONTEXT.md: compliance audit findings + dropped stale row | #67 | May 31 |
| BACKLOG status convention + tag in-flight sessions | #73 | May 31 |
| Activity APV lifecycle + editable policy ledger | #60 | May 30 |
| Close Sale dropping application email/DOB/phone fix | #68 | May 31 |
| deploy.sh stale-deploy guard | #62 | May 31 |
| CLAUDE.md repo-wide deploy rule | #63 | May 31 |

---

## How to use this doc

- **Status conventions:** 🟡 Open / 🟢 In progress / 🔴 Blocked / ✅ Shipped (move to Recently Shipped). Default emoji is 🟡 if unset.
- **Adding items:** drop into the right section with effort estimate + notes. If you don't know which section, "Backlog" is fine. Mark 🟢 immediately if you've already spawned a session for it.
- **Starting work:** if you spawn a parallel session for an item, tell the organizing session ("I just kicked off X for Y"). The organizing session marks the row 🟢 and tracks PR state by polling `gh pr list`.
- **Shipping items:** the orchestrator moves the row to "Recently shipped" when its PR merges. Older shipped items get pruned into CONTEXT.md's timeline monthly.
- **Re-prioritizing:** move rows between sections. Don't agonize about precise rank within a section — categories matter more than fine-grained ordering.
- **Open clarifications:** if an item needs more info, mark it explicitly (e.g., "*scope pending — Daniel to clarify*").
