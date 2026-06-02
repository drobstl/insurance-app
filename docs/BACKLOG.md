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
> **Last re-ranked:** May 31, 2026 evening — folds in the May 30 Growth + Distribution Lock (no-card 14-day Pro entry, permanent Free tier, Performance gating, Starter migration, FirstPromoter affiliate, IMO leader free seat, FFL/Rob distribution priority).
>
> **Last updated:** Jun 1, 2026 — folds in the Jun 1 strategic-planning-session notes (lead-queue "AI recommends" ordering, lead-disposition UX, agency-owner mode, gamification, Europe coaching overlay, recruiting workflows, financial scoring, Wave dialer, Just Insurance + grant/domain business threads) and rescues the stranded Jun-1 commission-engine / lead-spend / field-underwriting / white-label / two-tier-affiliate rows. **Near-term goal: product to 80–90% complete by end of June.** *(Second pass off the full meeting transcript also folds in: referral + rewrite capture, show-rate-aware appointment confirmation, goal-setting, lead-vendor → in-house lead-gen, and email-based cancellation/deposit detection.)*

---

## 🚨 Acute — finish today/tonight

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Smoke-test live Growth signup end-to-end | ~30 min | Daniel (Stripe Checkout needs hands) | Test card 4242 → walk full flow → verify Firestore + welcome email arrives. Real card live test after. |
| 🟡 Verify Activate-reply fix (PR #69) on a real device | 5 min | Daniel | Trigger a fresh client activation → confirm welcome text + action item auto-completes. New diagnostic logs in `welcome-activation-handler.ts` will pinpoint any residual issue. |
| 🟡 Verify Compliance Part 1 (PR #70) on the live Linq line | 5 min | Daniel | Text "STOP" to the AFL line → expect confirmation reply + `suppressed_numbers/{phoneE164}` doc + `consent_events` ledger entry. Then text "START" to verify resubscribe. |

---

## 🚀 Entry-mechanism cutover — the May 30 strategy shift *(amended Jun 1: 14-day trial, not 30)*

> **⚠️ Jun 1, 2026 amendment** to `docs/AFL_Growth_Distribution_Lock_2026-05-30.md`:
> Trial duration is now **14 days, not 30**. Plan-choice moment moves to **day 12**, and the soft email is replaced with a **strong full-screen in-dashboard forcing function** (non-dismissable until the agent picks Growth / Pro / Stay Free). Personalized with the agent's actual trial usage numbers. **Heads-up to the spawned Phase 1 session:** update your `trialEndsAt = now + 14 days` (was 30). No other Phase 1 changes — same architecture, same tier-gating, same data shape. No-card-at-signup decision unchanged.
>
> **Jun 1 planning-session input (corroborates the cut):** a prospective agency-owner partner independently recommended a **1–2 week** trial, leaning toward **1 week**, to avoid giving away too much value. 14 days sits at the top of that range; **Daniel decided Jun 1 to keep 14 days** (not tighten to 7). (His "$49 post-sale / $99 full end-to-end" tier framing matches the locked Growth/Pro split.)

The biggest net-new work area. Per the amended `docs/AFL_Growth_Distribution_Lock_2026-05-30.md`: new agents sign up with **no card**, get **14 days of full Pro**, then default to a **permanent Free tier** unless they pick a paid plan. This replaces the card-at-signup flow (PR #38) as the front door. Multi-week build broken into stages — DO NOT touch `/pricing` or marketing CTAs until the cutover ships as one coordinated change.

| Item | Effort | Notes |
|---|---|---|
| 🟢 **No-card signup flow** (email + name + phone, no payment) | 2–3 days | **In flight — session spawned Jun 1 on branch `entry-mechanism-phase-1`, worktree at `insurance-app-entry-mechanism-phase-1/`. Phase 1 scope.** New `/signup` surface that creates the Firebase user + Stripe customer (no subscription) + `agents/{uid}` doc with `tier: 'trial'`, `trialStartedAt`, `trialEndsAt` (**14 days out — amended Jun 1**, was 30). |
| 🟢 **14-day Pro feature unlock** during trial window | 1–2 days | **In flight — same session (Phase 1 scope).** Tier-gating helpers check `tier === 'trial' && trialEndsAt > now` → grant Pro-equivalent access. Existing `canAccessLeads` / `canAccessActivity` etc. get a trial branch. |
| 🟡 **Day-12 strong in-dashboard "pick your plan" forcing function** *(new, replaces the soft day-25 email)* | 1–2 days | Full-screen, non-dismissable surface that renders on every dashboard route from day 12 onward. Personalized with the agent's actual trial usage: *"You added N clients, tracked $X APV, watched Y clients activate the app. On Free you'll keep 25 of those clients and lose the Activity dashboard."* Three buttons: Growth $49 / Pro $99 / Stay Free. Each picks a plan and dismisses the surface (Stripe Checkout starts for paid picks; "Stay Free" sets `tier: 'free'` immediately). Same surface keeps appearing every login through day 14 if they keep dismissing → but it cannot be dismissed without picking. **This is the load-bearing conversion mechanism — invest hard here.** |
| 🟡 **Day-14 default-to-Free auto-transition** | ~half day | Cron at day-14 → if agent hasn't selected a paid plan, set `tier: 'free'`, `subscriptionStatus: 'free'`. No charge, no interruption, just feature gating tightens. Lower priority than the day-12 surface since most conversions should happen via that. |
| 🟡 **Free tier feature gating + caps** | 1–2 days | 25-contact hard cap on `clients` collection writes, 5-PDF/month cap on the upload pipeline, cadences ENABLED on those 25 (touch the conservation/anniversary/holiday cron eligibility), Activity Policy Ledger / bulk-import / pre-sale features hidden. Upgrade prompts explain which tier resolves each cap. |
| 🟡 **Starter $29 → Growth feature migration** | ~half day | Existing 11 Starter customers: keep $29/mo price (grandfather), unlock Growth feature set in code (tier-gating helpers treat `tier === 'starter'` as Growth-equivalent). One-time announcement email. |
| 🟡 **Performance feature metering on Growth** | 1 day | Growth gets 4 Performance scores/month (Free: 0, Pro+: unlimited). New per-month counter on `agents/{uid}.performance.usedThisMonth`. Resets on billing-cycle anchor. UI shows remaining count. |
| 🟡 **Pricing-page cutover** (4 tiers including Free, signup-first CTAs, remove Coming Soon pills) | ~half day | Tear out the `comingSoon: true` flags. Pricing page becomes informational comparison (not transactional). Marketing CTAs point at the new `/signup` surface. Ships as one coordinated change when the no-card flow is built and tested. |
| 🟡 **IMO leader free-seat mechanic** | 1 day | When an IMO leader's referred-agent count crosses 10, auto-grant them a free Growth-equivalent seat. Tracked via `agents/{leaderUid}.imoLeader.activeDownlineCount`. |
| 🟡 **Decide:** PR #38 (pre-pay signup) — keep as the explicit-paid-pick path, or rewrite? | Decision-only | Talk through how the no-card entry coexists with PR #38's card-at-signup flow. Probably: PR #38 stays as the path when an agent explicitly picks paid mid-trial or at day-14; the no-card flow is the default front door. |

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
| 🟡 Prospective agency-owner partner: demo via Griff + pitch in team huddles | Ongoing | Daniel + partner | **Jun 1** — a prospective partner (potential CSO; strong industry contacts, spearheading marketing/sales/product ideas) will talk to Griff about demoing the product in meetings and pitch AFL in huddles with other agents. Non-engineering. See "Prospective partner — define role/comp" in Backlog. |

---

## 🔧 Small wins — under 2hr each

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Update dial script with Daniel's actual sales script | 30–60 min | Daniel + Claude | Default lives in `web/lib/dial-script.ts`; per-agent override in Settings → Lead-mode. Daniel pastes script, Claude wires it in. The richer keyword/notes-driven *adaptive* version is tracked under "Adaptive in-call dial-script prompts" (Pro features). |
| 🟡 Carrier name + logo polish in client/policy views | ~1 hr | Claude | **Jun 1 partner ask** — show the carrier logo on client cards / policy rows to make the app feel more premium and aesthetically polished. |
| 🟡 FAQ doc: how to export a CSV from Symmetry's opt system | ~30 min | Daniel + Claude | **Jun 1** — short how-to so agents can self-serve the CSV bulk-lead import (shipped PR #86). Pairs with the Symmetry → AFL lead-import flow. |
| 🟡 Founding-member approval email copy refresh | 15 min | Claude | Drops dead "no CC" line + dead `/signup` link from `web/app/api/admin/applications/approve/route.ts` email template. |
| 🟡 Founding 34 → Pro $50 Stripe Coupon (`FOUNDING34_PRO`) | 5 min | Daniel (Stripe Dashboard) | $50/mo recurring forever. Required if founding mechanic stays after May 30 strategy. |
| 🟡 Verify failing e2e specs are actually fixed | 15 min | Claude | Old memory said 3 specs broken; recent CI green. Reconcile. |
| 🟡 Deep-link in activation reply that opens the AFL app back up | 30–60 min (now unblocked) | Claude | Universal Links + App Links recommended. **Unblocked** — the activate-reply fix shipped (PR #69). This is the deferred *native* piece of the mobile onboarding redesign (needs an EAS build for the Universal/App Links entitlements; the JS screen-split + push pre-prompt ship separately, OTA). |
| 🟡 Refer & Earn nav + CTA subtle "breathing" animations | ~1 hr | Claude | **Daniel-locked direction Jun 1: calm/breathing, always idle-animate.** Two surfaces, shared 3–4s rhythm so they feel coherent. **Nav button (sidebar):** soft pulse on the existing gold accent — opacity 0.6 ↔ 1.0 over 3–4 seconds — plus hover intensify (gold expands/brightens). Lives in `web/app/dashboard/layout.tsx`. **CTA button ("Get my referral link" on the Refer & Earn page):** gentle teal `box-shadow` halo pulse (4–8px, 2–3s cycle), plus hover lift (`translateY(-2px)` + glow intensify), plus click tactile feedback (0.97 scale snap on mouse-down, snap back on release). Lives in `web/app/dashboard/refer-and-earn/page.tsx`. **Composition story:** the shared rhythm connects sidebar to page so the whole referral surface feels alive but calm. No shimmer sweeps, no notification dots, no arrow nudges — those were considered and rejected as too salesy / wrong job-to-be-done framing. Tailwind config gets two new `@keyframes` (one for opacity-pulse, one for shadow-halo); reuse a `motion-safe:` modifier so users with `prefers-reduced-motion` get static states. |

---

## ⚖️ Legal — protect the shared line

| Item | Effort | Notes |
|---|---|---|
| 🟡 Compliance Part 2 (full consent log: welcome opt-in capture + conservation contact-basis log) | ~1 day | Part 1 shipped May 31 (PR #70). Part 2 adds the missing opt-in capture moments — currently only resubscribe/help paths write `opt_in` events; the welcome-activation handler is unchanged. |
| 🟡 Compliance Part 3 (richer-channel detection, FL-specific edge cases) | TBD | Optional refinement |

---

## 🚀 Pro features — what makes Pro worth $99/mo at day 15

Pro is no longer "Coming Soon" — every new agent gets it for 14 days under the new strategy. The work below is what makes Pro worth PAYING for once the 14-day trial expires. Lead mode (`canAccessLeads`) is a gated surface, so lead-queue enhancements live here.

| Item | Effort | Notes |
|---|---|---|
| 🟡 **Performance page MVP (call scoring + AI coaching)** | 3–5 days | Paste call transcript → Claude scores against ideal script → coaching feedback. **Gating per May 30 lock: Growth gets 4 scores/month, Pro unlimited.** |
| 🟡 **Referral + rewrite capture — the post-sale opportunities currently lost** *(Jun 1)* | 2–3 days | **Partner's stated #1 thing about the whole system.** Today AFL helps at the point of sale but has NO system to capture the two highest-value *post-sale* opportunities: (1) **referrals** from happy clients and (2) **rewrites** of existing policies — right now "those are just lost." Build explicit prompts/workflows that surface these moments (after activation, at retention touchpoints, on a client anniversary) and let the agent log + act on a referral or rewrite. Frame the ROI hard in-app: ~one referral a month ≈ 20x the AFL subscription. Post-sale value → strengthens the Growth ($49) core; lives here in Pro for now. Reuses the role-aware client relationship + the shipped retention cadence. |
| 🟡 **Lead-queue "AI recommends" mode (smart call ordering + best-call-window)** *(Jun 1)* | 2–3 days | A toggle at the top of the call queue: when on, it re-ranks WHO to call next AND suggests WHEN. Builds on the queue's existing logic (never-dialed → oldest, dialed → bumps up). Layer in signals: client age + the time-of-day windows where they didn't pick up → *"call these between 8–12."* Needs an input/learning ramp: agent dials for a bit, then the model starts recommending. Show a short "why" summary. **Also push-notify a batch:** *"call these N in the next hour."* (depends on push infra — `feature/push-notifications`.) Strong demo/retention lever — Symmetry agents' activity is weak, so a "what AI recommends" nudge stands out. |
| 🟡 **Lead disposition UX (status chip by name + disposition without a forced Call + history)** *(Jun 1)* | ~half day | Surface the current disposition (appointment / call-back / no-show / converted-no-sale) right next to the lead name in the queue + all-leads, not just buried below. Add a lightweight disposition dropdown so you can disposition WITHOUT being forced to hit Call first (mirror how opt lets you tag contact/no-answer). Keep the Call button (shows engagement), but don't require it. Preserve disposition history + outcomes through the lead→client transition. |
| 🟡 **Automated appointment confirmation + warming (show-rate-aware, configurable)** *(Jun 1)* | 2–3 days | Core to the $99 pre-sale package: warm the lead and confirm the appointment so the agent can "roll through dialing without stopping to confirm" — confirmation is automatic. **But make it configurable, shaped by the partner's show-rate psychology:** reactive (CI / internet) leads respond to a *live* "is now still a good time?" call far better than to automated reminders, and an early "heads-up" reminder an hour ahead can actually DECREASE show rate for that profile (it hands them an opening to reschedule). So: let the agent toggle reminders on/off and set timing per lead type; offer a "live confirmation call" path; and support the **thumbs-up-emoji confirmation** technique (ask the lead to reply 👍 to the reminder — a commitment device that lifts show rate). Default conservatively for reactive profiles. |
| 🟡 **Adaptive in-call dial-script prompts (keyword/notes-driven)** *(Jun 1)* | 2–3 days | The live dial-script panel (shown while on a call) updates based on what the agent types in notes — deterministic: trained keywords/tags/issues → surface the matching line to say next. Lighter-weight than always-listening audio (that's the Europe overlay, Agency tier). Pre-fills parts of the script per the agent's own answers; especially valuable for newer agents. Cross-links the **Field-underwriting assistant** (underwriting-aware recommendations) below. |
| 🟡 **Commission engine: master schedule upload + comp level → advance / in-the-pipe / month 10–11 tail** *(Jun 1)* | 3–5 days | Upload the carrier master commission grid (Symmetry first); agent enters their street level (e.g. 85%). On a closed deal, compute expected first-year commission → the upfront **advance** (cash now), what's left **in the pipe** (as-earned remainder), and the **month 10–11 tail**. **Compare expected vs. actual deposits and flag discrepancies** so agents catch missed/incorrect payments. **Auto-compute expected chargebacks on cancel** (e.g. a month-6 cancellation). **Stretch: ingest carrier emails/notices to auto-detect deposits posted + policies canceled** so the ledger self-updates without manual entry (partner: "if we see an email that this one canceled… it'll help us stay on top of our business"). Surfaces on the Activity ledger so each policy shows real dollars, not just APV. Numbers must be editable/verifiable — the uploaded schedule is source of truth; a wrong advance kills trust. Add an "advance at risk" view off the existing chargeback tracking (chargeback inside the advance window = clawback). **Keystone — also powers lead-spend profitability + white-label/Enterprise.** NOTE: distinct from "Commission schedule letter to Rob" (that's *affiliate* 20% comp; this is *carrier* comp). |
| 🟡 **Lead-spend capture (weekly) + agent profitability** *(Jun 1)* | 1–2 days | Per-agent weekly lead-spend entry on the Activity surface (where APV / placed business already lives). Surfaces true profit = advances received − lead cost, plus cost-per-placed. Start simple: one weekly total, not per-vendor. Measure profit against the **advance** (cash), not APV (overstates). This is the per-agent feed for the team "ROI calculator" row in Agency tier, and for the agency owner's bird's-eye business view. |
| 🟡 **Activity tracker metrics (dials / presentations / quotes / closes + carrier policy counts)** *(Jun 1)* | 1–2 days | Extend the shipped Activity ledger (PR #60) from APV/placed into the full activity funnel the partner tracks on his Google sheet: dials, presentations, quotes, closes, policy numbers by carrier, deposits, business expenses, existing clients. This is the personal "issue-paid tracker" view; the **agency owner bird's-eye rollup** of the same data lives in Agency tier. |
| 🟡 **Goal setting (personal + agency-visible)** *(Jun 1)* | 1–2 days | Per-agent goal setting on the Activity surface (monthly apps / closes / APV / dials targets) with progress vs. goal. From the partner's tracker sheet, where goals were a first-class tab alongside the funnel metrics. **Rolls up to Agency tier:** an agency owner can see each agent's goals + progress AND set their own agency-level goals. Pairs with Agency owner mode (Agency tier). |
| 🟡 **Field-underwriting assistant — Pio's underwriting system as a natural chat** *(Jun 1)* | Multi-day; scoping blocked on Pio's system format | Bring Pio's fully-built underwriting system into AFL as a **conversational** assistant: agent describes the client in plain language → it asks the natural follow-ups a senior underwriter would → recommends best-fit carrier / product / likely rate class + what to avoid. NOT a checkbox decision tree. Reuses existing Claude infra (PDF extraction, Performance scoring) and feeds the adaptive in-call prompts above. **Critical: chat is the interface, but answers must be grounded in Pio's actual rules (look-up / constrained output), NOT the model's general knowledge** — freestyled underwriting hallucinates carrier guidelines → declines, mis-placed business, chargebacks. Output must explain *why* + cite the rule (agent + compliance trust). Pre-sale → Pro tier; feeds the close-of-sale upload/activate flow. **#1 open Q — ask Pio: what form is the system in?** (if-then rules / guideline docs / carrier×condition spreadsheet) → that decides the grounding layer. Note: Pio is now affiliate connector + IP contributor — possible licensing/attribution piece on the business side. |
| 🟡 **Gamified milestone moments (animations + sound + shareable badges)** *(Jun 1)* | 1–2 days | Xbox-achievement-style: when an agent hits a milestone (first 5K APV, badges), play a short celebratory animation + sound on login, then dismiss. Builds on the existing badge art + share feature. Makes the app feel like leveling up a game. Ties into the agency-culture flywheel (Agency tier) for one-click shareables. |
| 🟡 **Client financial-scoring tool (debt-free-life projections + charts)** *(Jun 1)* | 2–3 days | Landing-page / client-facing feature: give the client a financial score and show debt-free-life program projections with charts. Reinforces the protection narrative at point of sale. Cross-links the **Ken Fearer debt-action-plan** integration (Backlog). |
| 🟡 **Optional Google Calendar booking integration** *(Jun 1)* | 1–2 days | Let an agent optionally link Google Calendar so booked appointments land on their calendar. A Google import route already exists (`web/app/api/integrations/google/import/route.ts`) — extend toward calendar/booking. Optional, not required. |
| 🟡 **SME / FIF tracking** | 2–3 days | Appointment + APV-split tagging for mortgage-protection → IUL specialist referrals. CONTEXT backlog. |
| 🟡 Virtual-number dialing from the lead queue (+ Wave dialer API plugin) | TBD scoping | Today's `tel:` URL only dials from primary cell; Funnel supports virtual numbers. **Jun 1: also look into an API plugin to integrate with existing dialers like Wave.** See PR #61 for the full scoping notes. |

---

## 🏢 Agency tier — sales-led; build follows the band-pricing decision

Agency stays sales-led until the band-pricing decisions land. Then it unlocks team-aggregation features. **Mental model (Jun 1):** keep it ONE cohesive app — not two mega-tabs. A simple divider (like admin/settings) separates the agency-owner features; everything below the line is the value the Agency tier pays for.

| Item | Effort | Notes |
|---|---|---|
| 🟡 **Agency band pricing decisions** (9 open Qs in CONTEXT § Pricing band parking lot) | 30 min decision-only | **Unblocks everything below.** Sets band sizes + floor + how agent count is measured. |
| 🟡 **Agency owner mode — personal/agency view toggle + per-agent drill-down** *(Jun 1)* | 2–3 days | On Activity (and dashboards), an agency owner sees their OWN numbers plus a "personal / agency" toggle. "Agency" drops into a bird's-eye rollup of the whole team (dials, lead spend, profitability, wins, coaching priorities); tap an agent to drill into that agent's same view. Fed by the per-agent Activity metrics + lead-spend capture (Pro features). Closer-style bird's-eye + coaching priorities. **Also surfaces each agent's goals vs. progress, and lets the owner set agency-level goals** (see Goal setting, Pro features). |
| 🟡 **Agency culture flywheel — auto-congrats prompts + one-click shareables** *(Jun 1)* | 1–2 days | When an agent hits a milestone (e.g. first 5K app), surface a prompt to the owner: *"Congratulate Agent X"* — and auto-generate a ready-to-post social/achievement asset (copy + image) the agency can drop on its Instagram/team channels or tag the agent. Keeps team culture alive; reuses the gamified milestone art (Pro features). |
| 🟡 **Recruiting + onboarding workflows** *(Jun 1)* | 3–5 days | Recruit pipeline with buckets/stages (unlicensed → bought course → licensing in progress → licensed → producing). Drip + mass-text campaigns ("come to the meeting"), and licensing/course-completion progress tracking — manual entry to start, possible Just Insurance integration later (see Backlog). Position the whole thing as a recruiting differentiator for agency owners. Solves the owner's real pain: keeping new hires organized without hand-holding each one. |
| 🟡 **Europe real-time call-coaching overlay (agency add-on)** *(Jun 1)* | Eval + integration; partner-led | Evaluate integrating "Europe" — an always-listening overlay that actively coaches the agent on what to say next based on the live call + tonality. Partner is already talking to a Europe co-founder (they have an affiliate program; idea floated to their devs). Package as a higher-priced **agency-tier add-on**: e.g. owner pays to run it across agents (~$200/yr range) and can resell to his agents cheaper than standalone (e.g. $79 vs $99). Expensive to run always-on → test traction first via the affiliate angle. The lighter, cheaper alternative is the deterministic adaptive dial-script (Pro features). |
| 🟡 Team Performance dashboard (leaderboards + coaching priorities widget) | 2–3 days | Sits on top of individual Performance. Rob's call action item. |
| 🟡 Team admin tools + per-agent dashboards | 3–5 days | |
| 🟡 Pooled conversation budget across all seats | 1–2 days | Depends on conversation counter (infrastructure below) |
| 🟡 Mentor calendar | 2–3 days | CONTEXT backlog. |
| 🟡 Chargeback comparison vs Symmetry average | 1–2 days | Single manual number until a Symmetry data feed exists. Rob's call action item #10. |
| 🟡 ROI calculator for agency dashboard | 1–2 days | Real-time ROI across team production. Rob's call action item #9. Fed by the per-agent lead-spend capture (Pro features). |
| 🟡 **White-label "Enterprise" tier for agencies/IMOs** *(Jun 1)* | Sales-led; scoping TBD | Capstone above the $349+ Agency band. Onboarding call → agency uploads its master commission schedule → tailor to how they run (comp grid, advance rules, lead program, downline splits) under their own branding. Built on the **Commission engine** (Pro features) — that's the prerequisite. Web white-label is tractable; **mobile white-label is the hard part** (a separate App Store / Play presence per agency is slow + costly → likely a shared app with in-app agency branding first). Pricing custom/sales-led. |

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
| 🟡 Ken Fearer integration: link + possibly his animated video in the AFL app | Non-engineering decision + small ship. Daniel Jun 1 captured this as a future to-do. Add a link to `https://ken-fearer.debtactionplan.com/` somewhere in the AFL app, possibly embed the animated video. Decide placement (client app? agent dashboard? marketing site?) before scoping. Pairs with the client financial-scoring tool (Pro features). |
| 🟡 Just Insurance pre-licensing partnership (Justin) *(Jun 1)* | Partnership/integration for pre-licensing courses: Justin keeps $49, AFL keeps the difference on a $99–149 course price. Feeds the recruiting + onboarding workflows (Agency tier) — sell the course inside the recruit pipeline. Non-engineering first (terms), then a light integration. |
| 🟡 Lead-vendor partnership → in-house lead-gen *(Jun 1)* | Two-step distribution play: (1) partner with a strong lead vendor to supply AFL agents and take a % of lead sales, then (2) have that vendor **teach AFL to generate leads in-house** so AFL stands up its own marketing engine ("eventually that lead vendor is going to teach us how to create it so we have our own in-house marketing… so we don't need you anymore — hire + scale that part of the business"). End state: AFL-generated leads as an in-house product agents can buy. Partner flagged **Razor Rage** as currently performing well (vs. Level Up). Business-model / distribution item, not near-term product. |
| 🟡 Two-tier affiliate revenue share (connector + agency "door") *(Jun 1)* | When a connector (e.g. Pio) brings in an agency owner who brings 40–50+ seats, BOTH share the upside: a **small** recurring cut for the connector, a **bigger** cut for the agency owner who drives + retains the seats. Extends the shipped FirstPromoter plumbing — but a multi-party split on one signup likely exceeds FirstPromoter's native model → **assume manual payouts first**, automate later. Hard part is the rules, not the math: how long the connector keeps earning, what happens if the door churns, or if a downline agent later starts their own shop (attribution + clawback windows). Money-model item, not near-term product. |
| 🟡 $75K St. Louis equity-free grant (awaiting decision) *(Jun 1)* | Daniel applied for a $75K equity-free grant in St. Louis; waiting to hear back. Earmarked primarily for marketing, social-media content, and getting the word out. Non-engineering, Daniel-led. |
| 🟡 agentforlife.com domain acquisition *(Jun 1)* | The bare `agentforlife.com` is owned (broker quoted ~$80K). Backorder set for $10 in case the current owner lapses. Nice-to-have, not urgent — `agentforlife.app` is the live production domain. |
| 🟡 Acquisition.com (Hormozi) advisory application *(Jun 1)* | Speculative — consider applying for help scaling toward $100M. Long-term, exploratory. |
| 🟡 Prospective partner — define role/comp *(Jun 1)* | Daniel-led business conversation. The agency-owner partner is leaning in (spearheading marketing/sales/product ideas; floated a CSO-type title + small equity, mission-driven). Could also help onboard early agents while Daniel builds. Revisit terms "this week." |
| 🟡 Email infrastructure cleanup (Resend centralization, bounce/complaint webhook, suppression list) | Phase 2 backlog. Overlaps with compliance Part 1/2 suppression — design once, ship in two PRs (SMS first, email second). |
| 🟡 Auto-throttle at KPI Tier 1 / Tier 2 | Phase 2 backlog. Deferred until 1–2 weeks of real reply-rate data. |
| 🟡 Phase 2 success metrics dashboard | Phase 2 backlog. Welcome-send compliance, activation rate, thumbs-up rate, retention reply rate. |
| 🟡 Reach out to Jeff (Intelra) | Rob's call action item #11 — non-engineering |
| 🟡 Configurable production-month boundary for Activity APV lifecycle | Pro-tier follow-on. Symmetry runs 28th → 28th, not calendar month. Agent-level `productionMonthStartDay` setting + IMO presets. Triggered when an agent complains their numbers don't match their commission statement. |
| 🟡 Mobile client onboarding redesign: split Activate screen + add notification pre-prompt | JS/OTA (no native deps added). Branded pulsating-ring "Allow" pre-prompt (`/notify`) → separate Activate screen carrying the verbatim consent copy lifted as-is from Compliance Part 1 (PR #70, already shipped). Push-tap deep-link is the separate native follow-up — see the "Deep-link in activation reply" row. |

---

## ✅ Recently shipped

When a backlog item ships, move it here with its PR # and date. Older items get pruned monthly into CONTEXT.md's timeline.

| Item | PR | Shipped |
|---|---|---|
| CSV / Excel bulk lead import (+ drop-zone copy spelling out supported columns) | #86 | Jun 1 |
| MIA (Mail-In Application) handwritten lead extraction — escalate to Opus on shaky first pass | #82 | Jun 1 |
| Mobile v1.6.6 release (iOS build 44, Android versionCode 32) — includes Bunny.net Stream + Activate verbatim consent copy + Activate-reply fix | #81 | Jun 1 |
| Bunny.net Stream + native HLS for lead-home videos (+ 1 GB upload cap) | #79, #80 | May 31 – Jun 1 |
| Refer & Earn polish: gold nav accent + enrolled-state success card | #77 | Jun 1 |
| CONTEXT: flag affiliate program live end-to-end | #78 | Jun 1 |
| Favicon: replace default Next favicon with AFL brand icon | #83 | Jun 1 |
| Agent send flow: phone pairing + one-tap iMessage booking confirmation | #66 | May 31 |
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
