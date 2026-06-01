# AFL Growth + Distribution Lock — 2026-05-30

> Locked decisions on entry mechanism, free tier, performance feature gating, affiliate structure, and distribution priority.
> **Supplements** (does not replace) the May 26 pricing relock — paid tier prices remain $49/$99/from $349.
> Read before any decision that touches signup flow, trial mechanics, free-tier limits, or affiliate program structure.

## Source

Strategy conversation on 2026-05-30, following the May 28 call with Eitan on AFL growth strategy. Reconciled with the May 26 pricing relock and the existing CONTEXT.md operating model.

## What This Document Locks

1. Entry mechanism for new agents
2. Permanent Free tier (limits + included features)
3. Performance feature gating across tiers
4. Migration treatment for grandfathered Starter $29 customers
5. Affiliate program structure (FirstPromoter, 20% year-1)
6. IMO leader free-seat benefit
7. Distribution priority

---

## 1. Pricing Tiers

| Tier | Price | Notes |
|---|---|---|
| Free | $0 | New — see §3 |
| Starter | $29/mo | Grandfathered only; new signups closed |
| Growth | $49/mo | Default paid tier; Performance feature restricted to 4 scores/month |
| Pro | $99/mo | Adds pre-sale features; Performance unrestricted |
| Agency | from $349/mo | Team aggregation, multi-agent management |

Tier prices are unchanged from the May 26 relock. What changes here is the **entry mechanism**, the **Free tier**, and how the **Performance feature** is gated.

---

## 2. Entry Mechanism — No Card, 14-Day Free Pro *(amended Jun 1, 2026)*

> **Jun 1, 2026 amendment:** trial duration shortened from 30 days to **14 days**, plan-choice moment moved to **day 12**, and a **strong full-screen forcing function** added on day 12 instead of a soft email. Rationale: 30 days dilutes urgency and lets agents drift into Free without seriously evaluating; 14 days is the SaaS sweet spot and is enough for the welcome-ritual aha to land (any working agent will close at least one sale in two weeks). 7 days was considered too short — risks missing the welcome-ritual moment for any agent who didn't close that week. No-card-at-signup decision unchanged.

**No card required at signup.** Agents enter email + name + phone. No payment information collected at the front door.

**14 days of full Pro access on entry.** Every new agent gets the complete Pro experience for their first 14 days — unlimited contacts, full automated cadences, Activity Policy Ledger, bulk import, pre-sale features, Performance scoring unrestricted, branded client app, close-of-sale ritual.

**Day 12: strong in-dashboard "pick your plan" forcing function.** A full-screen, non-dismissable surface on the dashboard that anchors the agent to a real decision. Personalized with their actual trial usage: *"In your trial you added N clients, tracked $X APV, watched Y clients activate the app. On Free you'll keep 25 of those clients and lose the Activity dashboard. Pick Growth ($49) to keep your whole book + automated retention. Pick Pro ($99) to add the Leads pipeline + AI call coaching. Or stay Free with limits."* Three buttons: **Growth $49**, **Pro $99**, **Stay Free**. Cannot dismiss without picking one. Same UX continues to render every login through day 14.

**Day 14 default: Free tier.** If the agent has not selected a paid plan by day 14, they are **automatically moved to the Free tier**. No charge. No surprise. No interruption — they keep using the product, just constrained by the Free tier limits in §3.

**No auto-charge, ever, without an explicit paid-plan selection.** This is a hard product rule. The trial does not convert to billing on its own.

**No money-back guarantee on paid tiers.** The 14-day free Pro window is the trial. Layering a second refund window adds operational cost without trust gain.

---

## 3. Free Tier — Permanent, Capped

The Free tier exists to keep agents on the platform after their 14-day Pro trial if they don't select a paid plan, and to lower the entry friction for IMO-led distribution.

**Included on Free:**
- Up to **25 contacts** (hard cap)
- **Automated cadences enabled** on those 25 contacts — birthday touches, anniversary nudges, retention pings all run
- **5 PDF uploads per month** (caps LLM cost; creates a second upgrade pressure)
- Branded client mobile app — fully on
- Close-of-sale activation ritual — fully on
- Self-serve only (documentation, no human support)

**Excluded from Free (paid tiers only):**
- Unlimited contacts beyond 25
- Activity Policy Ledger / Issue Paid Tracker
- Bulk import drip (Mode 2)
- Conversation counter
- AI-driven cadence intelligence and book analysis
- Performance scoring (see §4)
- Pre-sale features (Pro and above)
- Compliance layer (Pro and above)
- Agency team aggregation (Agency tier)
- Email / chat support (paid only); dedicated customer success (Agency only)

**Upgrade triggers** are by design: the 25-contact cap, the 5-PDF/month cap, and any feature in the "Excluded" list. When an agent hits one, the upgrade prompt explains which tier resolves it.

---

## 4. Performance Feature Gating

Performance is a feature, not its own tier.

- **Free**: not included
- **Growth ($49/mo)**: **restricted to 4 scores per month**
- **Pro ($99/mo)**: unrestricted
- **Agency**: unrestricted

4 scores per month is roughly weekly — enough cadence to build habit and value, capped tightly enough to drive Pro upgrades for power users. If Performance computation turns out to be inexpensive and the Pro differentiation argument weakens, revisit; default remains 4/month restricted on Growth.

---

## 5. Grandfathered Starter Migration

The Starter $29/mo tier was killed for new signups on May 26. The existing Starter customers are **migrated to the Growth feature set at their existing $29/mo price, permanently grandfathered**.

- Existing Starter customers retain $29/mo for the lifetime of their subscription
- They gain Growth-tier features (full cadences, unlimited contacts, Activity Policy Ledger, bulk import, conversation counter, restricted Performance at 4/month)
- They are exempt from base-tier increases
- No action required from them

---

## 6. Affiliate Program

**Provider: FirstPromoter** (already integrated with Stripe — shipped in PR #58, merged 2026-05-30).

**Commission: 20% of year-1 subscription revenue.**

- Growth ($49/mo): **$117.60 per agent per year** (20% of $588)
- Pro ($99/mo): **$237.60 per agent per year** (20% of $1,188)

**Year 1 only.** No perpetual residual. Payouts handled monthly by FirstPromoter as the agent pays.

**Tracking mechanism (live in production):**
- FirstPromoter script (`cid: dnd9y4t9`) loaded on every public page via root layout
- Affiliate link format: `agentforlife.com/?fpr=<affiliate_username>`
- Visitor lands on a page with the `?fpr=` query string → FirstPromoter sets a cookie
- On signup, `window.FPROM.data.tid` is forwarded to `/api/signup/start-checkout`
- That API attaches `fp_tid` to the Stripe Checkout Session + subscription metadata
- FirstPromoter's Stripe webhook reads the metadata on `checkout.session.completed` and credits the right affiliate automatically

**To onboard a new affiliate partner:**
1. Create their account in the FirstPromoter dashboard
2. Confirm commission rate is set to 20% of first-year subscription revenue
3. Send them their tracking link
4. FirstPromoter handles all payouts

**For Rob/FFL-scale partners:** pay 20% of the standard $588 (Growth) or $1,188 (Pro) regardless of any future entry promos. Cleaner headline number in the pitch. Cost to AFL is bounded.

**Free-tier signups do not pay affiliate commission** (no revenue to share). Affiliates earn when the agent picks a paid plan during or after their 14-day free Pro window.

---

## 7. IMO Leader Free Seat

Any IMO leader (or comparable distribution partner) who brings **10 or more agents** into AFL gets their own seat **free forever** at the equivalent of Growth-tier features.

- Threshold: 10 agents
- Their seat is free for the life of the relationship
- This is in addition to the standard 20% affiliate commission on those agents

The intent is to make AFL a tool the IMO leader uses themselves (managing their own book), which gives them an additional reason to push it to their downline beyond the commission.

---

## 8. Distribution Priority

**The FFL/Rob channel is the highest-leverage distribution lever currently on the board.** ~50,000 agents in the network; Rob is the former IMO leader actively driving signups.

**Deliverables required to lock the FFL relationship (not yet complete as of 2026-05-30):**
1. Commission schedule in writing (20% of year-1, per §6)
2. FirstPromoter tracking link issued to Rob
3. One-page pitch script for the next national call
4. 30/60/90-day signup targets to review jointly

**Secondary distribution work** (after the FFL deliverables ship):
- Identify and onboard 5-10 additional high-reach agent/influencer affiliates
- Provide each with their FirstPromoter link + a simple promo kit (copy, screenshots, calculator angle)
- Lean into the "you just found hidden revenue" framing per the marketing narrative

---

## What This Does Not Cover

- **Closr AI bundle pricing.** Still deferred until Closr AI exits MVP.
- **Annual prepay.** Still deferred. Worth revisiting once Free tier conversion data is available.
- **Outcome-based pricing (% of incremental commission).** Filed as future consideration, not committed.
- **Lifetime deals.** Filed as future consideration, not committed.
- **Charging the IMO/agency instead of the agent.** Considered, not committed; team aggregation already exists at Agency tier.

---

## Relationship to Prior Documents

This document **supplements**:
- The May 26 pricing relock (tier prices $49/$99/from $349) — unchanged here
- `docs/AFL_Pricing_Packaging_Playbook_v3.md` — pre-relock pricing playbook, conversation-as-unit billing model still valid; tier prices in v3 superseded by the May 26 relock
- `docs/AFL_Strategy_Decisions_2026-05-04.md` — channel rules, lane architecture, KPI tier system still valid

This document **does not modify**:
- Welcome flow architecture (see `AFL_Welcome_Flow_Amendment_2026-05-07.md`)
- Channel rules, lane matrix, push-only architecture (see `AFL_Strategy_Decisions_2026-05-04.md`)
- Closr AI integration architecture (see CONTEXT.md "Closr AI Integration")

---

## Open Questions (Not Blocking)

1. **Free-tier conversion rate.** Unknown until 60-90 days of Free-tier data is collected. Will inform whether the 25-contact cap and 5-PDF/month limits are tuned correctly.
2. **Spam / fake signup volume.** No-card entry creates exposure. Mitigation if it becomes a problem: light verification (phone, IMO affiliation) before unlocking the 14-day Pro window.
3. **Day-30 plan-choice conversion rate.** Will reveal whether the explicit choice email design is working or whether the default-to-Free is too easy a soft landing.
4. **Performance feature compute cost.** If it is materially cheaper than expected, reconsider whether 4/month on Growth is the right cap or whether full-blown on Growth is fine and Pro needs a different differentiator.
