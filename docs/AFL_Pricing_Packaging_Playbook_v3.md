# AFL Pricing & Packaging Playbook v3

**AgentForLife**

**Pricing** **& Packaging Playbook**

*Tier Structure, Founding Member Treatment, Overage Mechanics, Behavioral Design*

**Prepared for:** Daniel Roberts, Brainstorm Labs LLC

**Companion to:** AFL Messaging Operating Model v3.1 (capacity, deliverability, lane rules, activation flow, beneficiary invite mechanic, bulk import paths)

**Scope:** AFL standalone pricing only. Closr AI integration pricing deferred. Annual prepay deferred. Pricing for the four-tier structure (Starter, Growth, Pro, Agency), the founding member program, and the Concierge add-on service.

**Version:** v3 — adds Concierge add-on service ($1,500 email-only / $2,500 email + SMS), adds three bulk-import path framework, updates companion reference to messaging v3.1

**Status:** Recommended pricing locked for Phase 3 launch. Behavioral and competitive assumptions documented for revisitation at 6-month and 12-month review points.

# Plain English Summary
This playbook is the operating manual for AFL's pricing. It exists to give clear answers when questions come up — what tier should this agent be on, what happens when someone hits their cap, how does the founding member program work, when do we raise prices, and so on. Read it once. Refer to it when decisions need to happen quickly.

## The Core Pricing Decisions
| **Tier** | **Price** | **Conversations** | **Daily cap** | **Who it's for** |
| --- | --- | --- | --- | --- |
| Starter | $29/mo | 30 | 3/day | Year-1 agents, small books |
| Growth | $59/mo | 75 | 8/day | Established producers |
| Pro | $119/mo | 200 | 20/day | Top producers, large books |
| Agency | $199/mo + $39/seat | Pooled across team | Pooled | Agency owners with downline |

Overage on all individual tiers: $0.50 per conversation. No annual prepay. Founding members (the original 34) get Growth-equivalent for free, permanently, with overage at full price.

## Why These Numbers
Two willingness-to-pay populations. New agents anchor at $49–59 because their cash flow is unstable and they compare against the FMO bundle. Top producers anchor at $99–149 because they compare against real CRM tools (Better Agency, AgencyZoom) and care more about reliability than dollars saved. Trying to bridge them with a single tier wastes pricing power on the top end and prices out the bottom end. Two anchor prices, four tiers, clean ladder.

## The One Decision That Drives Everything Else
| **Conversations are the unit of sale.**  Not messages. Not seats. Not features. Conversations. This decision aligns the billing model to Linq's reputation system, makes capacity explainable to agents, and creates a natural upgrade path as agents grow their book. Every other pricing decision in this playbook flows from this one. |
| --- |

## Five Things to Remember
- Two anchor prices, not one. $59 for established agents, $119 for top producers. The gap is intentional and signals different value.

- Founding seats are free for life — but overage is at full price. They can never be forced off, and they never use AFL as unlimited free messaging.

- Overage exists to protect tier integrity, not as a profit center. Priced at $0.50/conv to nudge upgrades without punishing occasional spikes.

- Pricing page leads with buyer description, not feature lists. Agents should self-identify in 5 seconds.

- First price review at 6 months. First price increase consideration at 12 months. Founding tier explicitly exempt from base-tier increases.

# Table of Contents
# 1. Pricing Strategy Overview
## 1.1 What This Pricing Is Designed To Do
AFL's pricing has three jobs, in priority order:

- **Get producing agents into the platform at a price they will not hesitate at.** Conversion velocity matters more than per-agent revenue in the first 12 months. AFL's value compounds with engagement; agents who don't sign up don't generate value at any price.

- **Capture meaningful revenue from established and top producers.** These agents have real budget for tools and judge price by perceived sophistication. Underpricing the top end is a structural mistake that's hard to reverse.

- **Protect line health and platform unit economics.** Pricing is a behavioral lever. Tiers shape conversation volume, daily caps shape send patterns, overage shapes upgrade behavior. Get this right and the operations side of the business runs more smoothly.

The pricing model in this document is designed against the operating constraints in the Messaging Operating Model v3.1 — specifically the 70-agents-per-line operating target, the $250/line/month Linq cost, and the conversation-as-billing-unit decision.

## 1.2 What This Pricing Is NOT Designed To Do
Worth being explicit about what's not in scope, because pricing models drift toward feature creep:

- Not designed to be a profit center on overage. Overage exists to absorb spikes and signal upgrades, not to be a revenue stream of its own.

- Not designed for annual prepay or multi-year contracts. AFL ships month-to-month across all tiers.

- Not designed to address Closr AI integration pricing. That's a separate decision deferred until Closr AI is post-MVP.

- Not designed for enterprise-grade procurement. AFL is a product-led-growth model, not a high-touch sales motion. Pricing is published; signup is self-serve.

## 1.3 Anchor Decisions
Three structural decisions that everything else hangs from:

- Conversations are the unit of sale. Not messages, not seats, not features.

- Two anchor prices. $59 for established producers (Segment B). $119 for top producers (Segment C). Tiers ladder around these two anchors.

- Multi-line is operational, not a SKU. AFL provisions lines behind the scenes as platform demand grows. Customers buy conversation capacity; AFL handles the line-provisioning.

## 1.4 Pricing Stability Commitment
AFL's pricing is locked from Phase 3 launch through Phase 3 + 90 days. No ad-hoc adjustments during this window, regardless of internal pressure or single-customer feedback. Pricing changes — even small ones — erode trust and create operational chaos when made reactively. The first adjustment window is Phase 3 + 90 days, not Phase 3 + 30 days, and not whenever someone has a strong feeling about it.

This stability commitment is internal-facing, but should be communicated to anyone (advisors, investors, support team) who might suggest pricing changes during the launch window. The answer is always: "We're collecting data through the first 90 days. We'll review at that point."

# 2. Buyer Segmentation
AFL has three primary buyer personas, each with a different willingness-to-pay anchor, different competitive comparisons, and different upgrade triggers. The tier structure maps each persona to a tier without forcing a buying conversation.

## 2.1 Segment A — The New Agent
| **Attribute** | **Description** |
| --- | --- |
| Profile | Year-1 agent, recently joined an FMO, 0–60 clients on the books, working to build initial production |
| Income posture | Modest, commission-based, unstable cash flow |
| Buying decision frame | "Will this $X pay for itself this month?" |
| Price sensitivity | Very high. Strong negative reaction to anything above ~$60 |
| Competitive comparison | FMO-bundled tools, generic CRMs (HubSpot Free, Pipedrive Essential), DIY spreadsheets |
| Volume profile | 5–14 outbound new conversations per month on Linq |
| Upgrade trigger | Hits daily cap consistently OR books grows past 50 active clients |
| Tier match | Starter ($29/mo) |

Segment A is the volume play. Acquisition cost matters; per-agent revenue matters less in the first 6 months. The path to revenue is conversion to Growth tier as their book matures, not extracting maximum dollar from each Starter agent.

## 2.2 Segment B — The Established Agent
| **Attribute** | **Description** |
| --- | --- |
| Profile | Year 2+, producing consistently, 100–200 clients on the books, has tried multiple FMO and third-party tools |
| Income posture | Lumpy but trending up; can absorb $50–80/mo tool costs without thinking |
| Buying decision frame | "Does this make me more efficient and protect my book?" |
| Price sensitivity | Moderate. Will pay $59–79 for a tool that works. Will not pay $99 unless it's part of how they run their business |
| Competitive comparison | Symmetry tool ($60), AgencyZoom ($79–99 entry), Better Agency entry tier |
| Volume profile | 10–25 outbound new conversations per month on Linq |
| Upgrade trigger | Books grow past 200 clients OR consistently using overage |
| Tier match | Growth ($59/mo) |

Segment B is the workhorse. The Growth tier is designed to be where most paying agents live for years. Pricing pressure on Growth has the largest impact on revenue but also the largest impact on conversion velocity, so this tier is the one to be most disciplined about not over-pricing.

## 2.3 Segment C — The Top Producer / Agency Owner
| **Attribute** | **Description** |
| --- | --- |
| Profile | 175+ new clients/year, established book of 250–500 active clients, possibly recruiting downline agents |
| Income posture | High, predictable. Tool budget is a small fraction of monthly revenue |
| Buying decision frame | "Is this part of how I run my business?" "What does it do for my team?" |
| Price sensitivity | Low. Cares more about reliability, capacity, and sophistication than dollars |
| Competitive comparison | Better Agency mid/top tier ($99–199), Follow Up Boss ($69–149), HubSpot Sales Pro ($90) |
| Volume profile | 30–55 outbound new conversations per month on Linq, plus heavy follow-up volume |
| Upgrade trigger | Recruits team, needs admin tools or pooled capacity |
| Tier match | Pro ($119/mo) for individual top producers; Agency ($199/mo + $39/seat) for those with downline |

Segment C is the margin play. The pricing power is real, but the value story has to support it. Underpricing Segment C is a structural mistake — it's easier to lower a high price than to raise a low one, and Segment C buyers respond to pricing as a signal of seriousness.

# 3. Competitive Positioning
## 3.1 The Bracket
AFL is not a CRM. It's the client lifecycle automation layer that sits on top of whatever CRM the agent uses (often nothing, often the FMO's tool, occasionally a real CRM like HubSpot or AgencyZoom). The closest competitive comparisons are the marketing automation and retention features of insurance-specific CRMs — except AFL ships those features as a focused product instead of as a sub-feature of a bloated platform.

| **Tool** | **Price/agent/mo** | **Position relative to AFL** |
| --- | --- | --- |
| Symmetry FMO bundle | $60 | Below AFL on quality. Floor reference, not target. |
| HubSpot Starter | $20–50 | Generic; not insurance-specific. Adjacent for early-stage agents. |
| AgencyZoom | $79–149 | Closest functional analog. AFL Pro should sit at the bottom of this band. |
| Better Agency | $99–199 | Marketing automation focus. AFL Pro/Agency competes here. |
| Radius | $79–149 | Insurance CRM. Similar bracket to AgencyZoom. |
| Follow Up Boss (real estate) | $69–149 | Adjacent vertical. Useful pricing reference for agency owners. |

## 3.2 Strategic Position
AFL's strategic price position is:

- **Below AgencyZoom and Better Agency at every comparable tier.** AFL is more focused (lifecycle automation only, not full CRM), so the price should reflect that. Cheaper than the bloated alternative is the right framing.

- **Above the FMO bundles.** Quality and reliability differentiate; price reinforces that differentiation.

- **On par with focused tools in adjacent verticals.** Follow Up Boss is the model — focused product, real value, priced for daily-driver use.

## 3.3 What AFL Is NOT Competing On
Worth being explicit about what AFL is not racing to the bottom on:

- Not competing on price with FMO-bundled tools. The Symmetry $60 floor is irrelevant — AFL is a different product.

- Not competing on feature breadth with full CRMs. AFL does lifecycle automation; CRMs do everything. Different scope, different price.

- Not competing on brand recognition with HubSpot. AFL competes on insurance-specificity and execution.

# 4. Tier Structure
## 4.1 Master Reference
| **Tier** | **Price/mo** | **Conversations** | **Daily cap** | **Multi-agent** | **Target buyer** |
| --- | --- | --- | --- | --- | --- |
| Starter | $29 | 30 | 3 | No | Year-1 agent, small book |
| Growth | $59 | 75 | 8 | No | Established producer |
| Pro | $119 | 200 | 20 | No | Top producer |
| Agency | $199 + $39/seat | Pooled across team | Pooled | Yes | Agency owner w/ downline |

All individual tiers (Starter, Growth, Pro) include access to push notifications, agent-phone one-tap, and email channels at no additional cost. The conversation count is a budget for pooled-line SMS only via the Linq line. Client-initiated inbound activation messages do not count toward agent allowances (zero platform send cost).

## 4.2 Starter — $29/month
Designed for: Year-1 agents, small books (under 50 active clients), agents in the first 6–12 months of producing. Loss-leader pricing intended to drive volume acquisition and convert to Growth as books mature.

What's included:

- 30 conversations/month via Linq line

- 3 conversations/day hard cap (line-health protection and upgrade pressure)

- Unlimited push notifications, agent-phone one-tap sends, and email

- PDF auto-extract for client onboarding (the existing flow)

- Client mobile app (iOS + Android) for the agent's clients

- Standard support (in-app help, email response within 1 business day)

What's not included:

- Bulk import — Starter agents typically don't have an existing book to import. If they do, they can upgrade to Growth or pay a one-time onboarding fee (TBD in Phase 3 if demand emerges)

- Priority support, advanced analytics, or any team features

Strategic notes: Starter's strategic value is conversion, not revenue. The 3/day cap is the upgrade trigger. As Year-1 agents grow into Year-2 producers, they hit the cap consistently and naturally move to Growth. If Starter agents stay on Starter forever, this tier needs review.

## 4.3 Growth — $59/month
Designed for: established producers, 100–200 active clients, agents writing 10–15 new policies/month. The workhorse tier. Most paying agents should be here.

What's included:

- 75 conversations/month via Linq line

- 8 conversations/day hard cap

- Unlimited push notifications, agent-phone one-tap sends, and email

- Onboarding bulk-import ceremony (one-time, drip-released ~14 days)

- Standard analytics dashboard (lane performance, reply rates, retention indicators)

- Standard support

Strategic notes: Growth is the price-sensitive tier with the largest volume impact on revenue. Gut check on $59 vs. $49: ship at $59, monitor conversion in the first 60 days. If conversion underperforms expectations relative to Starter→Growth upgrade rate, drop to $49. The $10 difference is invisible to most Segment B buyers but the framing difference (anchored above the FMO bundle) matters strategically.

## 4.4 Pro — $119/month
Designed for: top producers (175+ new clients/year), large established books (250–500+ active clients), agents who experience cap-anxiety on Growth.

What's included:

- 200 conversations/month via Linq line (effectively no cap for any individual agent)

- 20 conversations/day cap

- Unlimited push notifications, agent-phone one-tap sends, and email

- Onboarding bulk-import ceremony

- Advanced analytics (book health, retention forecasting, anniversary outcome tracking)

- Priority support (4-hour response target during business hours)

Strategic notes: Pro is the margin play. The 200-conversation budget is intentionally generous — top producers should never think about caps. Cap-anxiety at the top tier is a churn driver. The price is signaling sophistication to a buyer who responds to sophistication.

If Pro at $119 underconverts vs expectations relative to Growth, the answer is to improve the value framing on the pricing page — not to lower the price. Segment C does not respond to lower prices; they respond to clearer value.

## 4.5 Agency — $199/month + $39/seat
Designed for: agency owners running 2+ downline agents who need pooled capacity, admin tools, and team performance visibility. Ships in Phase 3 alongside individual tiers because founding cohort includes agency owners.

What's included in the $199 base:

- Agency owner's personal seat with full Pro-tier features

- Admin dashboard for managing team (onboard new agents, view team activity, manage seat allocation)

- Team performance analytics (per-agent reply rates, lane breakdowns, retention outcomes)

- Pooled conversation capacity (see below)

- Priority support

What's included per $39/seat:

- Each downline agent gets full AFL functionality (push, agent-phone, email, Linq line access)

- Their conversations contribute to and draw from the agency pool

- Seat-level dashboard so individual agents see their own activity

Pooled conversation capacity (the differentiator):

- Per-seat conversation budget: 100 conversations/seat, pooled across the team

- Example: 5-seat agency = 500 conversations/month pooled. One agent might use 200, another 50; the pool absorbs variance

- Daily cap: 10 conversations per individual seat (line-health protection still applies at the agent level)

- Overage at $0.50/conv, billed against the pool, not individual seats

Strategic notes: $199 + $39/seat at a 5-seat agency is $394/mo, vs. 5 individual Pro seats at $595/mo. That's a 34% discount for choosing the team plan, which is generous but defensible at small team sizes where the team plan needs to be attractive. Per-seat pricing test at 6 months: revisit whether $39 should rise to $49 once the value of admin tools is proven.

## 4.6 What Tier Names Communicate
Tier names are part of the pricing communication. The chosen names work because:

- **Starter** = explicitly entry-level. No implied judgment about the agent. Frames the tier as the right place to begin.

- **Growth** = aspirational. The agent buying this tier is growing their book. Frames the tier as a step on a journey, not a final destination.

- **Pro** = status. The agent buying this tier identifies as a professional, not a beginner. Frames the tier as recognition of their position.

- **Agency** = role-specific. The buyer is an agency owner, not just an agent. Frames the tier as built for a different job.

Worth keeping these names rather than getting clever (e.g., "Producer," "Practitioner," "Mastermind"). Clear self-identification beats clever branding on a pricing page every time.

# 5. Founding Member Treatment
## 5.1 The Promise and Its Limits
The 34 founding-tier agents were promised free seats for life. This playbook codifies what that means in practice — and what it does not mean.

What "free seat for life" means:

- Permanent free access to AFL at Growth-equivalent feature level (75 conversations/month, 8/day cap)

- Cannot be forced off the free seat for any reason short of TOS violation

- Exempt from base-tier price increases. If Growth rises from $59 to $69, founding agents still pay $0 for their grandfathered seat

- Eligible for the onboarding bulk-import ceremony if they haven't used it yet

- Subject to the same KPI throttling rules as paid tiers — there is no reputation immunity

What "free seat for life" does NOT mean:

- Does NOT include free overage. Conversations beyond the 75/month allowance are billed at $0.50/conv at the prevailing overage rate

- Does NOT include access to Pro or Agency tier features. Upgrading requires moving to a paid tier

- Does NOT include exemption from overage rate increases (overage is usage-based and tied to cost)

- Does NOT extend to spouses, partners, downline agents, or transferred ownership. The free seat is tied to the founding member as an individual

## 5.2 Why Free Seat + Full-Price Overage Works
This structure solves a real problem with naive grandfathering. Three reasons it's the right design:

- **It honors the original promise.** Founding members keep what they were promised — free access, permanently. Nothing is taken away.

- **It prevents the founding tier from becoming a permanent revenue ceiling.** A high-volume founding agent who would otherwise need Pro tier still pays for their volume — just with overage instead of tier price. AFL doesn't lose revenue from successful founding members.

- **It creates a natural upgrade path.** A founding member consistently paying $30+/mo in overage might prefer to upgrade to Pro for a flat $119 with the bigger budget. That's their choice — but they can do the math themselves.

## 5.3 Founding Members Who Are Agency Owners
The founding cohort includes agency owners. Special handling for this case:

- Founding agency owner's personal seat remains free, regardless of which tier they're on

- If they need Agency tier features for their downline, they can upgrade to Agency. The $199 base platform fee is waived for founding members. They pay $39/seat for each downline agent

- The pooled conversation capacity for the Agency tier in this case is calculated as: founding member's grandfathered 75/month + 100/seat × number of downline agents

- Example: founding agency owner with 5 downline seats pays $0 + $195 = $195/mo, gets 75 + 500 = 575 conversations pooled

This maintains the spirit of "free seat for life" — the founding member's personal seat truly is free — while letting them pay for capacity above their personal use without forcing them off the founding tier to access team features.

## 5.4 Documenting This With Founding Members
Communicate this structure to the founding cohort proactively, in writing, before Phase 3 launches. Recommended approach:

- Draft email at least 60 days before paid-tier launch. The draft window leaves 30 days for review and revision before the 30-day send window.

- Have the draft reviewed by someone outside the immediate team — ideally a founding member you trust, an advisor, or a peer who can read the email from the recipient's perspective and flag tone or framing issues.

- Send single email to all 34 founding members 30 days before paid-tier launch.

- Subject: "Your Founding Member benefits — what's changing and what's not"

- Open with the reaffirmation: free seat for life, no exceptions, no expiration.

- Explain what's launching: paid tiers for new signups, with specific pricing.

- Explain how it affects them: nothing changes about their existing access. New options become available (overage, Agency upgrade) for those who want them.

- Close with the offer to answer questions and a clear contact path.

Get this communication right and the founding members become advocates. Get it wrong (or do it after launch when they hear about pricing through the marketing site) and they feel like an afterthought. The 60-day-draft, 30-day-review, 30-day-send-before-launch sequence exists specifically to prevent the rushed, last-minute version.

# 6. Overage Mechanics
## 6.1 The Rate
Overage on all individual tiers (Starter, Growth, Pro): $0.50 per conversation. Overage on Agency tier: $0.50 per conversation, billed against the pool.

## 6.2 Why $0.50
Overage rate is set by three competing pressures:

- **Cost-plus floor.** Fully-loaded conversation cost is approximately $0.17 (Linq's $250/line/month at 70 agents/line and 1,500 conversations/line/month). Overage at $0.50 yields ~66% gross margin — defensible as overflow protection.

- **Tier-protection ceiling.** Overage must be expensive enough that consistent overage signals a tier upgrade is the better option. A Growth agent using 100 conversations/month pays $59 + (25 × $0.50) = $71.50, vs. Pro at $119. The $47.50 gap discourages chronic overage from being a workaround.

- **Customer-perception comfort.** $0.50 per conversation feels reasonable to an agent. $1.00 would feel punitive. $0.25 would feel forgettable, which is the wrong incentive.

## 6.3 Behavioral Design
Overage is not just a billing line item — it's a behavioral mechanism. Designed correctly, it serves the agent and the platform simultaneously.

How agents experience overage:

- Dashboard shows current month usage and remaining budget at a glance, with a clear visual at 80% utilization.

- At 100% utilization, sends are paused with a clear in-app dialog: "You've used your 75 conversations this month. Three options:"

- Option 1: Enable overage for this month. Each additional conversation will be billed at $0.50.

- Option 2: Upgrade to Pro now. $60 prorated for the rest of this month, then $119/month going forward. (Math shown: "You'd save approximately $X this month and have headroom for next.")

- Option 3: Wait until next month. No additional cost; sends resume automatically on the 1st.

Critical UX rules:

- Never let an agent hit a wall mid-month with no recovery path. The dialog above is the recovery path.

- Never auto-enable overage. The agent must explicitly opt in, per month. This protects against bill shock and is good faith.

- Never auto-upgrade to Pro because they hit their cap. Upgrading is a real decision; presenting it as the obvious answer is salesy and erodes trust.

## 6.4 Watching for Tier-Upgrade Signals
AFL should monitor overage patterns as a leading indicator of tier-upgrade opportunity. Specifically:

- **An agent paying 30%+ of their bill in overage for 2 consecutive months** is effectively a Pro-tier agent paying Growth-tier-plus-overage. Surface this in the dashboard with a soft prompt: "You'd save $X by upgrading to Pro." Don't push, but make the math visible.

- **An agent on Pro who never approaches their cap** is potentially on the wrong tier. No action recommended — Pro buyers value the headroom and the framing. Don't suggest downgrades; let them self-select.

- **Aggregate overage as a percentage of platform revenue** should sit between 5% and 15%. Below 5% means tiers are over-provisioned (lost revenue). Above 15% means tiers are under-provisioned (frustrated agents who feel nickel-and-dimed).

## 6.5 Overage Adjustments Over Time
Overage rates are usage-based pricing and can be adjusted independently of base tier prices. Annual review:

- First review: Phase 3 + 6 months. Look at overage utilization across the customer base. Adjust if patterns indicate a different rate would better serve tier integrity.

- Annual review thereafter: tied to Linq cost changes (if Linq raises line costs by X%, overage may need to follow proportionally).

- Founding members are not exempt from overage rate changes. The grandfathering protects the free seat, not the usage-based pricing.

# 7. Margin Model
## 7.1 Cost Basis
The dominant variable cost in AFL's unit economics is Linq messaging. Other costs (compute, storage, customer-success time) are roughly fixed at AFL's current scale and don't materially affect per-agent margin until volume grows substantially.

Linq cost: $250/line/month. At the 70-agents-per-line operating target, per-agent line cost is $250 ÷ 70 = $3.57/month. This is the cost basis used in the margin tables below.

Sensitivity:

- At 50 agents/line (early deployment density): per-agent cost is $5.00, ~40% higher

- At 100 agents/line (optimization ceiling): per-agent cost is $2.50, ~30% lower

- If Linq raises line cost or carrier pass-through fees surface (see §13): cost basis adjusts proportionally

## 7.2 Per-Tier Gross Margin
At the 70-agents-per-line target:

| **Tier** | **Price** | **Cost basis** | **Gross margin** | **Notes** |
| --- | --- | --- | --- | --- |
| Starter | $29 | $3.57 | 87.7% | Loss-leader margin floor; healthy even at entry price |
| Growth | $59 | $3.57 | 93.9% | Workhorse tier; comfortably above 90% target |
| Pro | $119 | $3.57 | 97.0% | Near-pure margin; cost basis is invisible at this price |
| Agency (5 seats) | $394 | $17.85 | 95.5% | Pooled cost across seats; admin tools have ~$3 incremental cost |
| Agency (10 seats) | $589 | $35.70 | 93.9% | Same per-seat economics scale linearly |

Overage gross margin: $0.50 revenue ÷ $0.17 cost = 66%. Lower than base-tier margins, but acceptable as overflow protection. Overage should not be a meaningful contributor to platform gross margin — if it is, tiers are under-provisioned.

## 7.3 Blended Gross Margin Scenarios
Three customer mix scenarios at 70 agents/line:

| **Scenario** | **Starter %** | **Growth %** | **Pro %** | **Agency %** | **Blended GM** |
| --- | --- | --- | --- | --- | --- |
| Conservative (early) | 50% | 35% | 10% | 5% | 91.2% |
| Target mix | 40% | 40% | 15% | 5% | 92.3% |
| Optimistic (mature) | 30% | 40% | 20% | 10% | 93.8% |

All three scenarios exceed the 90% gross margin target. The model is robust to mix variation because every individual tier exceeds 87% margin. The decision risk is volume, not margin.

## 7.4 Sensitivity to Linq Cost Changes
If Linq raises line cost from $250 to $300/month (+20%):

| **Tier** | **Price** | **New cost basis (70 agents/line)** | **New gross margin** | **Action** |
| --- | --- | --- | --- | --- |
| Starter | $29 | $4.29 | 85.2% | Still above target; no action |
| Growth | $59 | $4.29 | 92.7% | Still well above target; no action |
| Pro | $119 | $4.29 | 96.4% | No action |
| Agency (5 seats) | $394 | $21.45 | 94.6% | No action |

AFL has substantial pricing power before margin compression becomes a strategic concern. Linq cost increases up to ~$400/line (60% increase) can be absorbed without raising customer prices. Above that, base tier prices need review — but that's a high bar.

## 7.5 Path to Higher Margin
Three operational levers for improving margin over time:

- Increase agents-per-line from 70 toward 100. Each step up reduces per-agent cost basis. At 100 agents/line, blended GM moves to ~94–95% across all scenarios.

- Add Twilio as a secondary provider in Phase 4. Twilio's per-segment cost is $0.008–$0.015 vs. Linq's bundled equivalent. At scale, dual-provider with lane routing can reduce blended messaging cost by 15–25%.

- Mix shift toward higher tiers as the customer base matures. Year-2 and Year-3 cohorts naturally graduate from Starter to Growth to Pro, lifting blended ARPU and margin together.

# 8. Pricing Page Design
## 8.1 The Job of the Pricing Page
The pricing page does three things, in this priority order:

- Helps the buyer self-identify the right tier in under 30 seconds.

- Communicates value proportional to price — each tier earns its number.

- Removes friction to signup once self-identification has happened.

Pages that do these three things convert. Pages that lead with feature lists, drown buyers in technical detail, or hide pricing behind "Contact Sales" buttons do not.

## 8.2 Design Time Is Not Engineering Time
The pricing page is where pricing models go to die. Tier structure can be perfect on paper and convert poorly if the page treats it as an engineering deliverable instead of a design one. Concretely: do not have the same person who builds the pricing page also write the copy, decide the visual hierarchy, and make the tier-card UX decisions. Those are different skills.

Recommended workflow:

- Copy and information architecture decided first, separate from any visual or implementation work. Tier descriptions, value clues, FAQ language. This is writing, not engineering.

- Visual design and layout decided second. Card hierarchy, color, typography, mobile vs desktop treatment. This is design, not engineering.

- Implementation third, against approved copy and design. This is engineering.

Skipping the first two steps and going straight to implementation produces pricing pages that work technically but don't convert. Allocate real time to copy and design — multiple drafts of each, ideally reviewed by someone outside the immediate build team.

## 8.3 Tier Card Structure
Each tier on the pricing page is a card with this structure, in order:

- Tier name (Starter, Growth, Pro, Agency) — large, prominent.

- Price — large, clear. "$X/month" with the period explicit.

- Buyer description — a single sentence. "For new agents getting started." "For established producers." "For top producers." "For agency owners."

- Key value clue — one sentence describing the headline reason this tier exists. "Up to 30 client conversations per month — everything you need for your first 50 clients."

- Capability list — 4–6 short bullet points covering what's included. Not a full feature list — the highlights.

- CTA — "Start [Tier name]" or "Get Started" button. Self-serve signup, no sales conversation.

## 8.4 What to Lead With (and What Not To)
Lead with buyer self-identification, not feature counting. The buyer is asking "which tier is for me?" before they ask "what does each tier do?"

Compare two openers for the Growth tier card:

| **Wrong: feature-led** Growth — $59/month. 75 conversations/month. 8 conversations per day. Bulk import. Standard analytics. Email support. |
| --- |

| **Right: buyer-led** Growth — $59/month. For established producers writing 10–15 new policies a month. Up to 75 client conversations per month — comfortable headroom for a growing book without paying for capacity you won't use. |
| --- |

The right version answers the buyer's actual question ("is this for me?") in the first sentence. The wrong version answers questions the buyer doesn't have yet.

## 8.5 Visual Treatment
- Four cards side-by-side on desktop. Stack vertically on mobile.

- Growth card visually highlighted as "Most Popular" or "Recommended" — focuses attention on the workhorse tier and helps Segment B buyers commit.

- Pro card visually distinguished but not over-emphasized. The buyer who needs Pro will recognize themselves; over-promoting it pushes Growth-tier buyers to feel under-served.

- Agency card visually anchored at the right end. Not the default focus. Serves the buyers who need it without crowding the individual tiers.

## 8.6 Comparison Table (Below the Cards)
Below the four-card layout, a feature-comparison table for buyers who want to compare in detail. Structure:

| **Feature** | **Starter** | **Growth** | **Pro** | **Agency** |
| --- | --- | --- | --- | --- |
| Monthly conversations | 30 | 75 | 200 | 100/seat pooled |
| Daily cap | 3 | 8 | 20 | 10/seat |
| Push notifications | ✓ | ✓ | ✓ | ✓ |
| Agent-phone one-tap | ✓ | ✓ | ✓ | ✓ |
| Email outreach | ✓ | ✓ | ✓ | ✓ |
| PDF auto-extract | ✓ | ✓ | ✓ | ✓ |
| Bulk import | — | ✓ | ✓ | ✓ |
| Advanced analytics | — | — | ✓ | ✓ |
| Team admin tools | — | — | — | ✓ |
| Priority support | — | — | ✓ | ✓ |

The comparison table is reference material, not the primary conversion mechanism. Most buyers don't read it; the tier cards do the conversion work.

## 8.7 FAQ Section
Below the comparison table, a short FAQ addressing the questions buyers actually have:

- "What counts as a conversation?" — clear answer with examples.

- "What happens if I exceed my monthly conversations?" — overage explanation.

- "Can I switch tiers?" — yes, anytime, prorated.

- "Do you offer annual billing?" — no, month-to-month across all tiers.

- "Is there a free trial?" — see §9.

- "What's the founding member program?" — closed; see About page.

# 9. Behavioral Mechanics and Edge Cases
Pricing models look clean in tables and break down in practice. This section documents the edge cases, with concrete handling rules for each.

## 9.1 Trial Period
Recommended: 14-day free trial on Starter or Growth (buyer's choice). No credit card required to start trial; CC required on day 7 to continue. No trial on Pro or Agency — those buyers know what they want and trial-gates create friction for the wrong reasons.

Why 14 days: long enough for an agent to actually use AFL with a few real client interactions; short enough to maintain urgency. Insurance agents have a longer sales cycle than typical SaaS users — 7 days is too short for them to see real value, 30 days lets them drift away.

Why no Pro trial: Segment C buyers comparing AFL to Better Agency or AgencyZoom expect to make a buying decision based on conversations with sales or peer recommendations, not a trial. Trials at the top tier signal "we need to convince you," which is the wrong frame for the buyer.

## 9.2 Mid-Month Tier Changes
Upgrades: take effect immediately, with the price difference prorated for the remainder of the month. Example: Growth agent upgrades to Pro on the 15th of a 30-day month; charged ($119 - $59) ÷ 2 = $30 today, billed $119 on next billing date.

Downgrades: take effect at the end of the current billing period. The agent keeps their current tier benefits until the period ends, then switches. This is standard SaaS practice and protects against abuse (downgrading mid-month after consuming most of the cap, then upgrading again next month).

Allow downgrades up to once per quarter without friction. More frequent downgrade attempts trigger a confirmation dialog explaining the pattern and asking if the agent wants to discuss usage with support — not to block, but to surface a likely customer-success conversation.

## 9.3 Hitting the Daily Cap
When an agent hits their daily conversation cap mid-day, sends pause until the next day at midnight local time. The agent sees a clear in-app banner: "You've used your 8 conversations today. Sends will resume tomorrow."

If the cap is hit because of legitimate burst usage (e.g., a productive day with several new policies), the agent has options:

- Wait until tomorrow (no cost, sends resume automatically)

- Use agent-phone one-tap for additional sends (doesn't count against Linq cap; uses the agent's personal phone path)

- Upgrade tier (immediate, prorated)

Important: hitting the cap is not an error condition or a punishment. The UX should treat it as expected behavior with clear next steps. Agents who feel punished for being productive churn.

## 9.4 Hitting the Monthly Cap
Distinct from daily cap. Monthly cap is the conversation budget for the tier (30 / 75 / 200 / pooled). When approached:

- At 80% utilization: dashboard surfaces a non-blocking banner with current usage and projected month-end.

- At 100% utilization: sends pause. Three-option dialog (overage / upgrade / wait, see §6.3).

- After agent's choice: usage continues with the chosen path. No further interruption until next month or next cap.

## 9.5 Cancellations and Refunds
Cancellation: self-serve, takes effect at the end of the current billing period. No refund for unused portion of current month — but agent retains full access until the period ends.

Refund policy:

- Within 14 days of initial signup (excluding trial): full refund on request, no questions asked

- After 14 days: no refunds on monthly billing. The agent owns the month they paid for

- Exception: technical failures attributable to AFL (extended outage, billing errors, line going to Limited and disrupting agent's ability to use the platform). Handle case-by-case via support

## 9.6 Resubscriptions
Account data preserved for 90 days post-cancellation. Resubscription within 90 days restores full account access (clients, conversations, history). After 90 days, account archived but can be recovered manually via support request.

Resubscribers are billed at the prevailing public price, not their previous price. (Exception: founding members, who retain free seat status indefinitely regardless of cancellation/resubscribe.)

## 9.7 The Pause Option
Worth offering, particularly for seasonal agents (e.g., agents who run heavy in Q1/Q4 but light in summer). Pause structure:

- Paid agents can pause for 30, 60, or 90 days, max twice per year

- Paused account: no billing, no message sending, conversations and contacts retained, push and email continue (so clients aren't stranded)

- Resume: self-serve, billing restarts on resume date with prorated charge for remainder of month

Pause exists to reduce churn from temporary low-usage periods. Agents who would otherwise cancel-and-resubscribe instead pause-and-resume, retaining account history and reducing friction. Implement in Phase 4 if churn data shows seasonal patterns.

# 10. Annual Price Increase Mechanism
## 10.1 The Right to Adjust
AFL's pricing terms include the right to change prices with 60 days notice for new billing periods. Boilerplate language for terms of service:

| **Pricing terms language** AgentForLife reserves the right to adjust pricing for any tier with 60 days advance notice to existing customers via email and in-app notification. Founding members are exempt from base-tier price increases for the lifetime of their grandfathered seat. Usage-based pricing (overage rates) may be adjusted with 30 days notice and applies to all customers including founding members. |
| --- |

## 10.2 Annual Review Cadence
Pricing review happens once per year, in Q4, with adjustments effective February 1st of the following year. This cadence:

- Avoids January launch (high-change month for tax/business reasons; bad UX timing)

- Provides 60+ days notice if the November announcement leads to February effective

- Aligns annual planning across product, marketing, and customer success

## 10.3 Triggers for Price Changes
Three primary triggers that should prompt an actual price increase (vs. annual review for housekeeping):

- **Linq cost increases beyond 20% over baseline.** AFL absorbs the first 20% as a margin compression; beyond that, prices need adjustment.

- **Material feature additions to a tier.** If Pro tier gains advanced features (e.g., AMB integration, voice cloning, deep automation), the price can be re-evaluated to reflect new value.

- **Mismatch between price and perceived value at a tier.** If conversion data, customer interviews, and competitive benchmarks all indicate Pro should be $149 instead of $119, that's a defensible adjustment with proper communication.

Triggers that should NOT drive price increases:

- "We need more revenue this quarter." Pricing is a long-term lever, not a short-term fix.

- "Competitors raised theirs." Match competitor pricing only if it aligns with internal value/cost analysis, not as a reflex.

- "It's been a year." Time elapsed is not a reason to raise prices. Cost or value changes are.

## 10.4 Loyalty Grandfathering
When prices are raised on a tier, existing customers at the old price get a 12-month grace period at their current rate before transitioning to the new price. This:

- Reduces churn during price changes (customers don't feel ambushed)

- Creates positive optics with early adopters ("we honor what you signed up for")

- Limits revenue lift from price increases in year one (as new revenue grows, existing book transitions gradually)

Document this loyalty policy publicly. It becomes part of the AFL trust narrative and a reason customers stick around through changes.

## 10.5 Communication Pattern
Standard sequence for any pricing change:

- 60 days before effective: email to all affected customers explaining what's changing, why, and when. In-app notification with the same content.

- 30 days before: reminder email. Surfaces the upcoming change in the dashboard.

- 7 days before: final notice. Offers a discounted annual plan (if available) as a last opportunity to lock in the old price (this becomes a meaningful lever in year 2+ if annual plans launch).

- Effective date: change takes effect for next billing period. No retroactive billing.

- After effective date: support team has prepared talking points for customer questions.

# 11. Phased Pricing Rollout
## 11.1 Phase 3 (Months 5–6) — Launch
Pricing tiers launch in Phase 3 of the operating model, after the channel architecture and lane discipline are validated in Phase 2.

Launch scope:

- Starter ($29), Growth ($59), and Pro ($119) tiers live for new signups.

- Agency tier ($199 + $39/seat) live for new signups, with priority outreach to founding members who run agencies.

- Overage at $0.50/conv across all individual tiers.

- Founding members notified of launch and reaffirmed in their grandfathered status (see §5.4).

- 14-day free trial on Starter and Growth, no trial on Pro or Agency.

What does NOT launch in Phase 3:

- Annual prepay options (deferred per current direction).

- Pause functionality (Phase 4).

- Closr AI integration pricing (deferred until Closr AI is post-MVP).

### Engineering Dependency: Phase 2 Build Scope
Agency tier launching in Phase 3 has implications for Phase 2 engineering scope. Three pieces of infrastructure must ship in Phase 2 to enable a clean Phase 3 launch:

- **Pooled-capacity logic.** Conversation budgets must be tracked and enforced at the agency level (across all seats), not just the individual-seat level. This is a non-trivial change to the conversation accounting system.

- **Team admin dashboard.** Onboarding new downline agents, viewing per-seat activity, managing seat allocation. Distinct UI surface from the individual-agent dashboard.

- **Per-seat dashboard for agency members.** Downline agents need their own view of personal activity that respects the agency-level pool while showing seat-level metrics.

If Phase 2 doesn't include this scope, Agency tier slips to Phase 4. That's an acceptable outcome but it should be a deliberate decision, not a discovery in Month 5. Confirm Phase 2 build plan includes this work as soon as the operating model is committed.

## 11.2 Phase 3 + 30 Days — First Validation
Critical metrics to watch in the first 30 days:

- Trial-to-paid conversion rate (target: 40%+ on Starter, 50%+ on Growth)

- Tier distribution across new signups (target: 40% Starter, 40% Growth, 15% Pro, 5% Agency)

- Founding member sentiment (qualitative, via outreach to a sample of the 34)

- Overage utilization (target: 5–15% of paying agents using overage in any given month)

- Tier-change events (upgrades and downgrades — target: 5–10% of paying agents changing tiers in the first month, mostly upgrades)

## 11.3 Phase 3 + 90 Days — First Adjustment Window
First opportunity to adjust pricing based on real data. Likely adjustments:

- Growth tier price (test $49 vs $59 if Starter→Growth conversion lags)

- Pro tier value framing (improve pricing-page copy if Pro converts below 10% of mix)

- Agency tier per-seat (consider $49/seat if early agencies are price-insensitive)

- Daily caps (tighten Starter to 2/day if cannibalization observed; loosen Growth to 10/day if compliance is an issue)

## 11.4 Phase 3 + 6 Months — First Annual Cycle Begins
By 6 months in, AFL has enough data to plan its first annual pricing review (Q4 review, February 1st effective). Likely topics:

- Whether Pro should move to $129 or $149 based on Segment C willingness-to-pay data

- Whether Agency seat pricing should move from $39 to $49

- Whether to introduce annual prepay at this point (with appropriate discount, perhaps 15%)

- Whether overage rate should adjust

## 11.5 Phase 4 (Months 7–12) — Maturity
Pricing-related Phase 4 work:

- Pause functionality ships if seasonal patterns warrant

- Annual prepay ships if customer demand emerges (track via support inquiries)

- Native iOS/Android agent app may unlock Pro+ feature pricing or premium tier

- Closr AI integration pricing decided as Closr AI exits MVP

# 12. Decision Triggers — When to Revisit
Pricing decisions are not permanent. This section documents the conditions that should prompt re-examination, so the team has clear signals rather than vague unease.

## 12.1 Tier Pricing Triggers
| **Signal** | **Action to consider** |
| --- | --- |
| Starter→Growth conversion below 30% at 90 days | Test Growth at $49 (lower price). May indicate Growth feels too expensive relative to Starter. |
| Pro adoption below 10% of mix at 90 days | Improve Pro pricing-page framing. Don't lower price first — that signals weakness to Segment C. |
| Pro adoption above 25% of mix at 90 days | Consider raising Pro to $149 — signal that this is for serious producers. |
| Agency adoption below 5% of mix at 90 days | Investigate friction (signup flow, admin tools), not price. |
| Founding members consistently using overage at $30+/mo | Soft-prompt upgrade to Pro in dashboard. Do not retract grandfathered access. |
| Average overage as % of revenue above 15% | Tiers under-provisioned. Consider raising included conversation counts (revenue-positive for AFL despite seeming counterintuitive — keeps customers happy and reduces churn). |
| Average overage as % of revenue below 5% | Tiers over-provisioned. May indicate room to lower included counts and capture more upgrade revenue. Lower priority than the above. |

## 12.2 Cost Basis Triggers
| **Signal** | **Action to consider** |
| --- | --- |
| Linq raises line cost by 10–20% | Absorb. Margin compresses 1–2 percentage points. No customer-facing action. |
| Linq raises line cost by 20–40% | Raise overage rate first ($0.50 → $0.60). Flag for annual review whether base prices need adjustment. |
| Linq raises line cost above 40% | Annual pricing review triggered. Likely raise base tiers $5–10 each. Communicate clearly. |
| Carrier pass-through fees surface | Re-cost the model. Likely doesn't change tier prices but may shift overage rate. |
| Twilio added as secondary provider | Blended cost basis drops. Don't lower prices in response — capture the margin to fund growth investment. |

## 12.3 Competitive Triggers
| **Signal** | **Action to consider** |
| --- | --- |
| AgencyZoom or Better Agency raises prices | Note for context. Don't follow reflexively — match only if internal data supports. |
| A new insurance-focused tool launches at $19/mo with similar feature scope | Investigate quality. If real, evaluate Starter at $19 to defend Year-1 acquisition. |
| Symmetry FMO bundles a competitive tool for free | Strategic threat to Year-1 segment. May need Starter at $0 or freemium model. Major decision, not a tier adjustment. |

## 12.4 What Should NOT Trigger Pricing Changes
- Internal revenue pressure ("we need to hit a number"). Pricing is long-term.

- Single loud customer feedback ("this is too expensive"). Statistical patterns matter; individual complaints don't.

- Founder anxiety ("are we charging enough?"). Investor or peer questioning is not data.

- Round-number aesthetics ("$59 should be $60"). Pricing precision is intentional.

# 13. Add-On Services: Concierge Onboarding
Beyond subscription tiers, AFL offers a one-time concierge service for agents who want their existing book onboarded without committing to the daily Onboarding Ceremony. The concierge offering is structurally an add-on, not a tier — it is sold as a one-time service fee and runs independently of the agent's monthly subscription.

## 13.1 Service Description
An AFL operator imports the agent's client list into the dashboard and runs the welcome touches as the agent. The agent's commitment is approving the message templates and being available for any escalations. The operator works through the book at appropriate cadence, typically completing a 200-client book in 2–4 weeks.

Operator scope: import clients to the dashboard; send welcome messages from the agent's account in the agent's voice. Sends are signed in the agent's name. Identity framing is the same as all other agent-account messaging — "my office" framing extends naturally to operator-run sends.

## 13.2 Pricing
| **Service variant** | **Price** | **Includes** |
| --- | --- | --- |
| Email-only | $1,500 | Operator runs email-based welcome touches to the agent's existing book. Engaged respondents pulled into the agent's standard activation flow for personal-phone follow-up. |
| Email + SMS | $2,500 | Operator runs both email and SMS welcome touches. SMS sends are routed through agent's account on the platform's send infrastructure (not the agent's personal phone). Higher response capture, higher engagement rate. |

Both variants are one-time fees, billed at the start of the engagement. Concierge is offered to any agent regardless of subscription tier — gating is by book size and willingness to pay, not subscription level.

## 13.3 Margin
Operator labor is the dominant cost. Typical engagement runs 80–120 hours of operator time depending on book size and variant chosen. At an operator rate of $7/hour, fully-loaded operator cost lands at $560–$840 per engagement.

| **Variant** | **Price** | **Operator cost** | **Gross margin** |
| --- | --- | --- | --- |
| Email-only | $1,500 | ~$560–$700 | $800–$940 (53–63%) |
| Email + SMS | $2,500 | ~$700–$840 | $1,660–$1,800 (66–72%) |

Margin on concierge is structurally lower than subscription tier margin (which runs 88–97%). The strategic value of concierge is not the per-engagement margin — it's the conversion of top-producer agents from forward-only adoption to full-book adoption, which dramatically increases lifetime subscription revenue from those agents.

## 13.4 Recommendation by Book Size
| **Book size** | **Recommended onboarding path** | **Rationale** |
| --- | --- | --- |
| Under 100 clients | Onboarding Ceremony (self-serve) | Manageable in under 7 days of light daily commitment. Concierge is overkill. |
| 100–300 clients | Hybrid (email blast → engaged subset to drip) | Email blast filters efficiently. Agent sends to engaged respondents only. |
| 300+ clients | Concierge | Self-serve options become impractical. Operator-run engagement is the rational path. |

These are recommendations, not enforcement rules. Any agent on a paid tier may choose any path.

## 13.5 When Concierge Doesn't Fit
- Year-1 agents with small books shouldn't buy concierge — the math doesn't work for them and the Onboarding Ceremony covers their needs.

- Agents who prefer doing the work themselves shouldn't be pushed toward concierge. Some top producers want personal touch with every welcome message and that's a legitimate preference.

- Agents whose existing book has weak email contact data may not benefit from concierge email-only — the email send doesn't reach the recipient. Email + SMS variant is the safer choice in those cases.

# 14. Open Questions and Sensitivities
Pricing is set against assumptions. If assumptions change, the model needs revisiting. These are the assumptions worth tracking explicitly.

## 14.1 Assumed but Unconfirmed
- **Segment B agents will pay $59 at the conversion rate predicted.** Untested. The competitive frame supports it, but real signup data is the only proof. First adjustment window is 90 days post-launch.

- **Pro tier at $119 will reach 15% of mix.** Untested. Depends heavily on positioning of Pro vs. Growth on the pricing page. May need Pro-specific marketing investment to pull buyers there.

- **Agency tier finds adoption among the founding cohort agency owners.** Untested. Some agency owners may prefer the simplicity of buying individual seats for their team. Worth direct outreach during Phase 3 launch to validate.

- **Overage at $0.50 nudges upgrades without punishing occasional spikes.** Untested. May need to adjust based on real overage utilization patterns.

## 14.2 Linq-Dependent Sensitivities
- **If Linq cost rises significantly:** Margin compresses across all tiers. Action depends on magnitude (see §12.2).

- **If carrier pass-through fees surface:** Same as above. Currently assumed $250/line is fully loaded; if not, re-cost the model immediately.

- **If Linq announces an enterprise plan or volume discount:** Renegotiate. Cost basis improvements should be captured by AFL, not passed to customers, until competitive pressure warrants.

## 14.3 Strategic Sensitivities
- **If Closr AI launches publicly:** AFL standalone pricing may need to coordinate with Closr+AFL bundle pricing. Separate decision deferred until Closr AI is post-MVP.

- **If a major FMO partners with a competitor:** Competitive threat to Year-1 acquisition. Reassess Starter tier strategy.

- **If AFL adds a meaningfully differentiated capability (e.g., AMB, voice automation, AI coaching):** Prices can rise — but only with proper communication and framing. New capabilities are the cleanest justification for price increases.

# 15. Decisions to Document in CONTEXT.md
The following decisions made during this pricing review should be reflected in the AFL CONTEXT.md before any of the pricing model is implemented.

## 15.1 Tier Structure
- Four tiers: Starter ($29), Growth ($59), Pro ($119), Agency ($199 + $39/seat).

- Conversation budgets: 30 / 75 / 200 / 100-per-seat-pooled.

- Daily caps: 3 / 8 / 20 / 10-per-seat.

- Overage: $0.50/conversation across all individual tiers and the Agency pool.

- All tiers include push, agent-phone one-tap, email, PDF auto-extract.

- Bulk import included on Growth, Pro, and Agency. Not on Starter.

- Advanced analytics on Pro and Agency. Priority support on Pro and Agency. Team admin tools only on Agency.

## 15.2 Founding Member Treatment
- Free seat for life at Growth-equivalent (75 conversations/month, 8/day cap).

- Overage at full rate ($0.50/conv) — no discount, no exemption.

- Exempt from base-tier price increases. Overage rate increases apply normally.

- Founding agency owners: $199 platform fee waived; pay $39/seat for downline; pooled capacity = 75 + (100 × downline seats).

## 15.3 Trial and Refund Policy
- 14-day free trial on Starter and Growth. No trial on Pro or Agency.

- No credit card required to start trial; CC required on day 7 to continue.

- 14-day money-back guarantee on initial signup post-trial. No refunds after 14 days except for AFL technical failures.

- Cancellations effective at end of current billing period. No prorated refunds.

## 15.4 Tier Change Mechanics
- Upgrades effective immediately, prorated for current period.

- Downgrades effective at end of current period.

- Maximum 1 downgrade per quarter without friction; additional downgrades trigger support conversation.

## 15.5 Pricing Adjustment Mechanism
- Pricing locked from Phase 3 launch through Phase 3 + 90 days. No ad-hoc changes during this window.

- 60 days notice for base-tier price changes. 30 days notice for overage rate changes.

- Annual review in Q4 with adjustments effective February 1st.

- Loyalty grandfathering: existing customers retain old price for 12 months after a tier price increase.

- Founding members exempt from base-tier increases.

## 15.6 Phased Launch
- All four tiers launch together in Phase 3 (Months 5–6 of the operating model).

- Founding cohort communication 30 days before launch.

- First adjustment window: Phase 3 + 90 days.

- First annual review: Phase 3 + 6 months.

- Annual prepay deferred to Phase 4+ pending demand signal.

- Pause functionality deferred to Phase 4 pending churn pattern data.

## 15.7 Concierge Add-On Service
- One-time add-on service: $1,500 email-only / $2,500 email + SMS.

- Operator imports clients to dashboard and runs welcome touches as the agent. Sends signed in agent's name from agent's account.

- Operator scope: mechanical send work only (import + welcome). No qualifying, no quoting, no advice.

- Available to any agent on any paid tier. Gated by book size and willingness to pay, not subscription level.

- Recommended by book size: under 100 clients → Onboarding Ceremony; 100–300 → Hybrid path; 300+ → Concierge.

- Operator role with scoped data access in the dashboard: client list (names, phone numbers, basic context). Not policy details, financial info, or beneficiary data.

- Available now (Phase 2-aligned launch); does not depend on Phase 3 tier rollout.

*End of pricing playbook.*

