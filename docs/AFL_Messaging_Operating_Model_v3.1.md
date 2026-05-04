# AFL Messaging Operating Model v3.1

**AgentForLife**

**Messaging Operating Model**

*A 6–12 Month Plan for Line Health, Growth, and Margin*

**Prepared for:** Daniel Roberts, Brainstorm Labs LLC

**Subject:** AFL pooled-line strategy, lane discipline, capacity model, pricing & packaging, agent tooling, phased rollout

**Version:** v3.1 — incorporates Linq operator confirmations on capacity/ramp/AMB, adds beneficiary invite mechanic with three prompts, formalizes the three bulk import paths (Onboarding Ceremony, Hybrid, Concierge), and integrates the Concierge add-on offering

**Status:** Strategic operating recommendation. Linq confirmation pending on a small set of questions documented in §13. Recommended path forward does not depend on those answers but the model is robust under either resolution.

# Plain English Summary
This section is a no-jargon walkthrough of the operating model. Read this first; the formal sections (§1–§14) are the implementation detail behind these decisions and exist for engineering, advisors, and re-reference.

## The Core Problem
We're trying to do too much from one phone number. The phone companies (T-Mobile especially) noticed and slapped us with Limited status. We need to spread the work across the right channels so each channel only does what it's good at.

## The Big Idea
Stop using the Linq number for things that don't need to be on the Linq number. Save the Linq number for what genuinely benefits from a real text message from the platform — which is a smaller set of jobs than we were giving it.

## Four Channels, Four Jobs
**1. Push notifications.** The first move whenever the client has the app installed and notifications turned on. Free. Fast. No carrier risk. Used for anniversary check-ins, retention attempts, holiday cards, birthday cards, and beneficiary outreach.

**2. The agent's personal phone.** Used to send the very first welcome message to a brand-new client. The client gets a text from their actual agent at a saved number. Personal. Real. Costs us nothing, no carrier risk.

**3. The Linq number.** Used for retention escalations when push wasn't enough, referral outreach, and ongoing two-way conversations once they've been established. The pro tool — used only when it's the right tool for the job.

**4. Email.** The safety net. Always works. Used as a third-touch for retention and as a fallback for anniversaries when push isn't available.

## The Clever Bit: How Clients Connect to the Linq Line
Here is the move that solves the deliverability problem without giving up the Linq line as a tool. Instead of US starting cold conversations with new clients on the Linq line (which is what got us in trouble), the CLIENT starts the conversation.

How it works:

- Agent finishes the application. Auto-extract creates the client profile. (Unchanged from today.)

- Welcome message pops up. Agent taps "Send from my phone" instead of the old Linq button.

- The agent's iMessage opens, pre-filled with a personal greeting, the app download link, the login code, and a one-line instruction: "Open it up and tap Activate so we're all connected — and turn on notifications so I can reach you when it matters."

- Agent reviews, sends. Client gets a text from their actual agent's number — saved contact, real human, zero carrier risk.

- Client downloads the app, enters the code, opens it. The first screen has copy explaining that the app keeps their policy info in one place and the Activate button connects them with the agent's office line.

- Client taps Activate. Their phone composes a text TO our Linq line that says "Hi [Agent], it's [Client] — I'm set up on the app!" They hit send.

- Done. The Linq line has an inbound message from the client. The conversation is established, started by THEM, with their explicit opt-in to be reached on this number. The Linq line's first response includes the agent's vCard (so the client can save the contact properly) and asks for a thumbs-up reply (which both confirms delivery and gives the line a high-quality inbound reciprocity event).

| **Why this is the breakthrough** From the carrier's standpoint, this is an existing two-way conversation, not a cold outbound. From a legal standpoint, the client just opted in. From our standpoint, we just got a reply with no send to count against — which is the strongest possible boost to our line's reputation. And the thumbs-up mechanic builds delivery confirmation into the relationship from message one. We solved four problems with one mechanism. |
| --- |

## The Rule That Ties It All Together
If a client trusts us enough to install the app and turn on notifications, we earn the right to push them. If they didn't, we don't push our way back in through SMS — we use email instead. This is both polite and good for our deliverability score. It applies to every lane (anniversary, retention, holiday cards, beneficiary, everything).

Important nuance: this rule is about whether they ALLOWED notifications, not whether they're actively using the app. The AFL app is intentionally low-engagement — most clients won't open it for months at a time, and that's correct product behavior. App dormancy is not a disqualifier. Permission is.

## On Identity: Why the Agent's Name Stays
There's an architectural question that came up during this work: should the Linq line's automated messages go out signed as the agent (current setup), or should they go out as a named EA persona on behalf of the agent? After substantial deliberation, the answer is: keep agent identity for now, defer EA framing as a future consideration.

The deciding logic: AFL's AI uses a single NEPQ-tuned voice across all agents (it doesn't change per agent), the agent sees every thread in real time and can intervene, and the AI does coordination work only — never product recommendations. Under those conditions, the agent identity is honest enough, well-framed ("my office line"), and avoids the migration cost of switching personas. EA framing has real long-term advantages but they're mostly latent at AFL's current scale. The decision is documented as deferred, not abandoned.

## What Changes for Your Existing Setup
Your PDF auto-extract flow stays exactly the same. Agent finishes a call, uploads PDF, auto-extract creates the client profile, welcome message pops up. The only thing that changes is the agent taps "Send from my phone" instead of "Send from Linq." iMessage opens with the pre-filled message. Agent reviews, sends. The client gets a text from a real saved contact (their agent), not a mystery number.

That single change — sending the welcome from the agent's phone instead of through Linq — solves the original problem. Everything else in this document is supporting infrastructure around that decision.

## Pricing in One Paragraph
We sell "conversations" — not individual texts. Four tiers: $29, $59, $119, and $199+$39/seat for agency owners. Most agents fit comfortably in the $59 tier. Overage is 50 cents per extra conversation. The 34 founding agents get the $59 tier features for free, forever, but they can't go over their bucket without paying overage. Gross margin lands around 90% across the tier range.

## The Rollout in Six Bullets
- Months 1–2: Stop the bleeding. Get our line healthy and stay there. Set up the dashboards that tell us when something's going wrong.

- Months 3–4: Ship the new welcome flow (one-tap from agent's phone + Activate button in the app + vCard from Linq line). Move anniversary off SMS entirely. Make push the default for retention. Watch reply rates climb.

- Months 5–6: Roll out the new pricing tiers to new signups. Grandfather the founding 34.

- Months 7–12: Add a second Linq line. Make sure that if one line ever goes down again, it doesn't take the whole platform with it.

- Throughout: Track how many clients turn on push notifications. That number drives a lot of decisions later.

- Throughout: Build the code so that swapping Linq for Twilio later is a config change, not a rewrite. Insurance against future surprises.

## The Five Decisions That Matter Most
If you forget everything else, remember these:

- Anniversary reviews never go through Linq SMS. Push or email only.

- Welcome intros come from the agent's personal phone via one-tap, including the app download link and login code.

- The client establishes the Linq conversation themselves by tapping Activate inside the app. The Linq line's first response includes the agent's vCard for the client to save.

- Bulk import is a slow-drip onboarding ritual, not a feature button. Fifteen a day, two weeks, done.

- 70 agents per Linq line is the goal. Not 200, not 30. Seventy.

Everything in the formal sections that follow is implementation detail behind those five decisions.

# Table of Contents
# 1. Executive Summary
AgentForLife (AFL) operates client-lifecycle outreach for independent life insurance agents through a Linq-provided messaging line that combines iMessage and SMS. The line was recently downgraded to Limited status, most likely due to poor reciprocity (reply-to-send ratio) caused by treating multiple lanes as a single undifferentiated traffic bucket. Recovery and durable scaling require lane-aware operating discipline, channel diversification away from pooled-line SMS for the lanes that don't need it, and a pricing model that flows from physical capacity rather than from desired ARPU.

Three insights from the strategic review do most of the work:

- **Push is the universal first-choice channel for any lane where the client has installed the app and allowed notifications.** This applies to anniversary, retention, holiday/birthday cards, and beneficiary outreach. App dormancy is not a disqualifier — permission is. The Linq line is reserved for clients who don't have push available, and for escalations when push fails to resolve a retention attempt.

- **Welcome introductions are split into two steps.** Step 1: agent sends the first message from their personal phone via one-tap, including the app download link and login code. Step 2: when the client opens the app for the first time and taps Activate, an in-app trigger uses the sms: URL scheme to compose a pre-filled message FROM the client TO the Linq line. The client initiates the Linq-side conversation themselves. The Linq line's first response back includes the agent's vCard (for proper contact-card saving) and asks for a thumbs-up reply (delivery confirmation plus a high-quality inbound reciprocity event for line reputation).

- **Bulk import is a once-per-agent-lifecycle onboarding ceremony, not an ongoing feature.** Drip-released through the agent's phone over 14 days, it eliminates most snowshoe risk and removes the largest variable load on the pooled line.

Together, these decisions reduce per-agent steady-state outbound new conversations on the Linq line to roughly 6–13 per agent per month, which makes 70 agents per line a comfortable operating target with substantial headroom under Linq's recommended 50 new conversations/day ceiling. Client-initiated inbound activation messages (assumed not to count against the new-conversation cap, pending Linq confirmation in §13) provide a steady stream of high-quality inbound traffic that reinforces the line's reply:send ratio. At Linq's $250/line/month cost, this enables ~90% gross margin on messaging across the standard tier structure proposed in §8.

The recommended phased rollout (§11) prioritizes Limited recovery and instrumentation in Months 1–2, lane discipline and the new welcome flow in Months 3–4, pricing tier rollout in Months 5–6, and multi-line plus channel diversification in Months 7–12. The plan stays on Linq through at least Phase 2; provider abstraction is built into code immediately so that switching to or adding Twilio in Phase 4 is a configuration change rather than a refactor. Number replacement is treated as a Phase 4 contingency triggered by a second Limited episode under the new operating model — not a Phase 1 action.

## Top Decisions Captured
- Push is the first-choice channel for every lane where the client has installed the app and allowed notifications. Universal rule, not lane-specific.

- App dormancy is not a disqualifier for push. Installed + notifications on is sufficient.

- Anniversary lane: push or email only, never pooled-line SMS. Architectural, not tunable.

- Welcome step 1: agent-phone one-tap is the default mechanism. Includes app download link AND login code.

- Welcome step 2: client taps Activate in the app, which triggers a sms: URL scheme outbound to the Linq line. The Linq line's first response includes the agent's vCard and asks for a thumbs-up reply.

- vCard generation: server-side, per-agent, with embedded compressed agent photo (under 60KB JPEG, ~400x400). Sent as MMS attachment with the Linq line's first response.

- Thumbs-up mechanic: deliberate reciprocity tool used on activation, anniversary check-ins, and time-sensitive sends. Not on every message — only where confirmation matters.

- Identity on Linq line: agent identity preserved (NEPQ voice signed in agent's name). EA framing (e.g., named assistant persona) considered and deferred as a future architectural consideration.

- Bulk import: once-per-agent onboarding ceremony, drip-released ≤15 conversations/day for ~14 days, agent-phone delivery.

- Beneficiary lane: maintain current posture (push-only, automation off, auto-reply default off) for the next 12 months.

- Lapse/retention cadence: push first if available; if push fails or unavailable, max 2 SMS touches per non-responder per 30 days; third touch must be email; hard quiet period of at least 60 days after the third touch.

- Capacity target: 70 agents/line (operating), 100 agents/line (optimization ceiling).

- Unit of sale: conversations, not messages.

- Tier structure: Starter 30 / Growth 75 / Pro 200 / Agency $199 + $39/seat conversations per month, with $0.50/conv overage.

- Founding tier (the 34): grandfathered at Growth-equivalent (75 convs/mo), no overage available, free seat permanent.

- Provider strategy: stay on Linq through Phase 1–2, build provider abstraction now, add Twilio as redundancy at 5+ lines.

- Agent tooling: PWA-first (mobile web with sms: URL scheme), native app deferred to Phase 4 if usage warrants.

- Mobile-first one-tap design — desktop dashboard surfaces queues but actual sends route through the agent's phone.

- AMB (Apple Messages for Business): confirmed unavailable through Linq — their lines are standard P2P iMessage on dedicated hardware, not AMB-registered accounts. Direct registration with Apple is the only path if branded sender becomes strategically important; deferred to Phase 4 contingency.

- No SendBlue or other iMessage-relay services — terms-of-service and continuity risk.

- Number replacement: Phase 4 contingency only, triggered by a second Limited episode under the new operating model. Not a Phase 1 action.

# 2. Business Context and Volume Reality
## 2.1 Product Overview
AgentForLife is a white-label client lifecycle platform for independent life insurance agents operating remotely (no in-person field work). The platform automates outreach across five primary lanes: new client activation, lapse/retention saves, policy reviews (anniversary), referrals, and beneficiary communication. Agents operate within Symmetry Financial Group / Crosswinds Financial Group's distribution model, with a typical book of 175–225 new clients per year for top performers and a 15–20% annual lapse/cancel rate at industry baseline.

Messaging is delivered through Linq (partner API V3), which manages a combined iMessage/SMS line at a known cost of $250/month per line. Reciprocity guidance from Linq governs operating practice: a 1:2 reply-to-send ratio target, 30–40% ideal first-message reply rate, 15% minimum, and a recommended ceiling of 50 unique new conversations per line per day.

## 2.2 Agent Tiers and Volume Profile
Agent volumes vary materially by performance tier. Per-agent steady-state outreach (lane-aggregated, monthly):

| **Agent tier** | **New clients/yr** | **New intros/mo** | **Retention/mo** | **Referral/mo** | **Anniversary/mo** |
| --- | --- | --- | --- | --- | --- |
| Lesser (Year 1) | 60–120 | 5–10 | 1 | 2–3 | 0–5 |
| Typical | 100–150 | 10–13 | 2–3 | 4–6 | 8–13 |
| Top (steady state) | 175–225 | 15–20 | 3–4 | 5–10 | 15–19 |
| Outstanding (rare) | 300–360 | 25–30 | 4–5 | 7–10 | 25–30 |

Anniversary is the largest single lane by volume at steady state. Removing it from pooled-line SMS (§3.3 and §4.2) is the single largest unlock for capacity and margin.

## 2.3 Lane Volume After Channel Reallocation
After applying the channel architecture in §3 (push-first universal, two-step welcome, anniversary off SMS), per-agent monthly load on the Linq line as outbound new conversations drops materially. Inbound client-initiated activation messages provide a steady stream of high-quality reply-ratio-positive traffic with no outbound counterpart.

| **Agent tier** | **Welcome (off Linq)** | **Activation inbound on Linq** | **Retention outbound on Linq** | **Referral outbound on Linq** | **Outbound new convs on Linq** |
| --- | --- | --- | --- | --- | --- |
| Lesser | 5–10 | 5–10 | 0–1 | 2–3 | 2–4 |
| Typical | 10–13 | 10–13 | 0–1 | 4–6 | 4–7 |
| Top | 15–20 | 15–20 | 1–2 | 5–10 | 6–12 |
| Outstanding | 25–30 | 25–30 | 1–2 | 7–10 | 8–12 |

Two structural assumptions in this table:

- Welcome opt-in compliance from agents above 80%. The Connect-button completion rate by clients above 70%. These ratios are tracked as top-three operational metrics from Phase 2 onward.

- Push opt-in rate among clients in the base case (35%) — most retention efforts route through push first, materially reducing Linq retention outbound. At the pessimistic case (15% push opt-in), retention outbound on Linq roughly doubles, which is still well within capacity at 70 agents/line.

# 3. Channel Architecture
## 3.1 The Four Channels
| **Channel** | **Per-msg cost** | **Carrier risk** | **Reply rate (est.)** | **Best fit** |
| --- | --- | --- | --- | --- |
| Push notification | ≈ $0 | None | Variable; depends on app engagement | First choice for all eligible lanes (anniversary, retention, holiday/birthday, beneficiary) |
| Agent-phone SMS (one-tap) | ≈ $0 to platform | None (personal traffic) | High (saved sender, prior context) | Welcome step 1, ad-hoc personal touches |
| Pooled-line SMS (Linq) | ~$0.17 fully loaded | Significant; reciprocity-gated | 15–40% target (lane-dependent) | Client-initiated activation inbound, retention escalations after push fails, referral outreach, conversation continuation |
| Email | Negligible | Low | Variable; lane-dependent | Anniversary fallback, retention third-touch, re-consent flows |

## 3.2 Channel Selection Hierarchy
Channel selection is governed by a deterministic precedence rule applied at send time. The principle: use the lowest-friction channel the client has authorized through behavior. Never escalate to a higher-friction channel without behavioral signal.

- **Step 1 (universal):** If app installed AND notifications allowed, push. This applies to every lane that supports push delivery.

- **Step 2:** If lane is welcome (where push isn't available because the client doesn't have the app yet), agent-phone SMS via one-tap.

- **Step 3:** If push is unavailable (notifications off or app uninstalled), or if push was sent and didn't resolve a retention attempt within 5 days, send through Linq subject to all KPI thresholds in §6.

- **Step 4:** Email as fallback or third-touch step. Always available. Never gated by line health.

The rule is about behavioral consent, not behavioral activity. The AFL app is intentionally low-engagement — clients won't open it for months at a time, which is correct product behavior for a life-insurance utility. App dormancy does not disqualify a client from receiving push. The signals that disqualify push are: notifications turned off, app uninstalled, or — for retention only — push delivered and not engaged within 5 days.

## 3.3 The Two-Step Welcome Flow
The welcome flow is the most consequential single mechanism in the operating model. It does three things at once: gets the client's first message from a saved-number agent rather than a pooled commercial line; establishes the Linq-side relationship via client-initiated inbound (the cleanest possible opt-in pattern); and produces a high-reply-rate inbound event on the Linq line that reinforces line reputation without contributing to the outbound new-conversation budget.

### Step 1: Agent sends from personal phone
Mechanism (extension of existing PDF auto-extract flow):

- Agent finishes call. Uploads PDF application. Auto-extract creates client profile. (Unchanged from current implementation.)

- Welcome message draft pops up in agent dashboard.

- Agent taps "Send from my phone" button.

- Native iMessage opens with a pre-filled, personalized draft sent from the agent's personal cell number.

- The message contains a personal greeting, the AFL app download link, the client's login code, and a one-line instruction: "Open it up and tap Activate so we're all connected — and turn on notifications so I can reach you when it matters."

- Agent reviews, edits if desired, sends.

Recommended copy template:

| **Agent's personal-phone welcome message** Hey [Client], great talking with you today! Welcome to the family. Download the app here: [link]. Code: [code]. Open it up and tap Activate so we're all connected — and turn on notifications so I can reach you when it matters. |
| --- |

The client receives a text from their actual agent's saved number. There is no mystery commercial sender, no carrier-side bulk-traffic flag, and no Linq line involvement at this step. The login code ties to the client profile that was just created from the PDF auto-extract.

### Step 2: Client downloads, activates, and triggers the Linq conversation
Mechanism:

- Client receives the welcome SMS, taps the app download link, installs AFL.

- Client opens the app, enters the login code from the agent's text. App authenticates and surfaces the activation screen.

- Activation screen explains what's about to happen and asks for notification permission. Recommended copy below.

- Client taps the Activate button. The button uses the sms: URL scheme to compose a text FROM the client's phone TO the Linq line, with a pre-filled body: "Hi [Agent], it's [Client] — I'm set up on the app!"

- Client reviews, sends.

- The Linq line receives an inbound message from the client. The platform's first response back includes the agent's vCard (for proper contact-card saving) and asks for a thumbs-up reply (delivery confirmation plus reciprocity).

Recommended copy for the in-app activation screen:

| **Activation screen copy** One quick thing before we're set up.  Tap below to text my office line. This connects us so I can send you policy reminders, schedule your annual reviews, and keep your policy info up to date right here in the app. You'll always be able to reach me here.  Make sure notifications are on — that's how you'll see anything important from me.  [Activate button] |
| --- |

Recommended copy for the Linq line's first response:

| **Linq line first response (signed under agent's name, NEPQ voice)** Hey [Client]! You're all set. I'll reach out here when it's time for your annual review or if anything important comes up with your policy.  Save my contact so you'll always know it's me — and shoot back a thumbs up so I know we're connected. Carriers sometimes block messages and that's how I'll know you're getting them. Talk soon!  [vCard attached] |
| --- |

Why this works at four levels:

- **Carrier signaling:** Inbound-initiated conversations are the gold standard pattern in messaging deliverability. The 50/day new-conversation cap (assumed) applies to outbound cold sends — client-initiated conversations are essentially free from a carrier-risk standpoint.

- **Consent provenance:** The client texting us first is the strongest possible opt-in signal. Indisputable, in-channel, registered-sender, timestamped, and originated from the recipient. Stronger than any reply-yes to an outbound.

- **Reciprocity ratio:** Their inbound activation message is one inbound for zero outbound. The thumbs-up reply is another inbound for one outbound (our welcome response). Both improve our reply:send ratio with high-quality traffic.

- **Self-segmentation:** Clients who download the app, activate, and thumbs-up are demonstrably engaged. Clients who don't — we never started a Linq conversation with them, so there's no reciprocity drag from the disengaged cohort.

### Implementation note
The Activate button is a copy of the existing one-tap referral button pattern with two strings changed (recipient and message body). Engineering effort is minimal. Three implementation specifics worth flagging:

- **Login code in agent's personal-phone welcome.** The code ties to the client profile created by PDF auto-extract. Code stays valid for 30 days (or whatever onboarding window AFL settles on). Without the code in the personal-phone message, the client cannot complete activation.

- **vCard delivery from the Linq line, not the personal phone.** The sms: URL scheme cannot attach files; it only supports text. So the vCard rides along with the Linq line's first response back, sent as MMS attachment after the client taps Activate. This means the very first text from the Linq line arrives as a raw number, but the second arrives saved with the agent's name. See §9.7 for vCard generation specifics.

- **Notification permission ask is critical.** If push isn't enabled, the entire channel architecture collapses for that client and they fall back to SMS-only for everything. The activation screen must clearly request notification permission as part of the activation step. Consider gating one or two non-essential app features (e.g., scheduling annual reviews through the app) behind notification permission to nudge adoption.

## 3.4 The Thumbs-Up Reciprocity Mechanic
On selected high-importance messages, the Linq line explicitly asks the client to reply with a thumbs-up or quick acknowledgment. This is a deliberate operating mechanic, not a casual touch.

What it does:

- **Generates pure-numerator reply ratio.** Every thumbs-up is a one-character inbound message that costs the client almost nothing. From a carrier reciprocity standpoint, these are gold — they reinforce reply ratio with minimal effort.

- **Provides delivery confirmation.** SMS doesn't reliably tell the sender if a message was received. Client-side acknowledgment is the only way to know for sure. Asking for a thumbs-up bakes confirmation into the relationship without adding software complexity.

- **Surfaces engagement drift.** A client who consistently thumbs-up is engaged. A client who stops over time is either drifting away or having delivery problems. Either signal is operationally useful.

When to use it:

- First response from the Linq line after activation (establishes the pattern).

- Anniversary check-ins via SMS fallback (when push wasn't available).

- Time-sensitive messages (call confirmations, scheduling, anything that requires action).

When NOT to use it:

- Routine FYI messages (holiday cards, birthday cards). These are gifts, not requests — no acknowledgment ask.

- Conversation continuation in active threads. Agents and clients are already mid-conversation; the ask is redundant.

- Every single message reflexively. That trains clients to thumbs-up without thinking, and the signal degrades.

Framing matters. "Shoot back a thumbs up so I know we're connected — carriers sometimes block messages and that's how I'll know you're getting them" reads as collaborative. "Please acknowledge receipt" reads as performative. The goal is to give the client a reason to engage that isn't about the agent being needy.

## 3.5 Identity on the Linq Line: Why Agent Name Stays
Architectural question that surfaced during this work: should automated messages on the Linq line go out signed under the agent's name (current setup), or under a named EA persona (e.g., "Penny — Daniel's Assistant") that operates on the agent's behalf?

Decision: keep the agent's name on the Linq line. EA framing considered and deferred.

The deciding logic rests on four facts about AFL specifically:

- **AFL's AI uses a single NEPQ-tuned voice across all agents.** It doesn't change per agent — every agent's automated messages sound the same way (the standard of sales excellence the AI was trained to deliver). Voice maintenance does not multiply with agent count, which removes the strongest engineering argument for switching to an EA persona.

- **The agent sees every Linq-line thread in real time in their dashboard.** By the time the agent walks into a call with a referred prospect or a returning client, they've seen the full message history. The agent really did participate in the conversation, just passively rather than by typing. The deception concern that EA framing was meant to solve is materially smaller in this configuration.

- **The AI does coordination work only — never product recommendations.** Lapse recovery messages route to the agent for personal contact. Referral qualifying captures details for the agent to handle on the booked call. Scheduling is scheduling. None of this crosses any regulatory line under either identity model.

- **Migration cost is real and the EA's value is mostly latent at AFL's current scale.** Switching to a named EA requires brand decisions, voice work, vCard regeneration, copy revisions across every automated message. The benefits (small disclosure-honesty buffer, brand asset potential) are real but pay off at scale, not at 5 paying users.

The agent's office line is framed in client-facing copy as "my office line" — a true and unremarkable description of how a professional runs their business. No deception, no need to over-explain. The honesty test: if a client ever asks the agent "did you actually text me yourself?", the agent can say "my system handles a lot of the routine stuff — reminders, scheduling — and I see all of it and jump in when it matters." Defensible plain-English answer.

Documented as deferred, not abandoned. Triggers for revisiting:

- AFL grows past ~100 active agents and per-agent voice consistency becomes a maintenance burden in practice.

- A regulatory inquiry or compliance question surfaces where EA framing would have provided a cleaner posture.

- An agent specifically requests it (some agents may prefer their own voice; others may prefer an EA branding).

- Branded sender identity becomes operationally important and AFL pursues direct AMB registration with Apple. (Linq has confirmed they do not run AMB and there is no AMB path through them; their lines are standard P2P iMessage on dedicated hardware.)

# 4. Lane-by-Lane Operating Rules
Each lane has a distinct consent posture, channel mix, cadence rule, and escalation path. Lanes are not interchangeable; capacity is allocated per lane and enforced platform-side.

## 4.1 New Client Activation (Welcome)
- **Step 1 channel:** Agent-phone SMS via one-tap from the AFL dashboard. Includes app download link and login code.

- **Step 2 channel:** Client-initiated inbound to Linq line via in-app Activate button. Linq line's first response includes vCard and thumbs-up ask.

- **Pooled-line outbound use:** None for the welcome lane itself. Subsequent conversation continuation is permitted once the client has initiated and responded.

- **Cadence:** Step 1 within 24 hours of policy issuance. If no agent send within 7 days, platform sends an email introduction with app link as fallback. Step 2 happens whenever the client opens the app and activates.

- **Compliance signals:** Three metrics tracked separately — (a) agent welcome-send compliance (target >80%), (b) client app activation rate (target >70%, indicating successful download-and-activate funnel), (c) thumbs-up response rate to the Linq line's first response (target >60%, indicating delivery and engagement).

## 4.2 Anniversary Policy Review
- **Step 1 channel:** Push notification (if app installed and notifications allowed).

- **Step 2 channel:** Email (if push unavailable or after the push cycle expires).

- **Optional channel:** Agent-phone one-tap, agent discretion, for clients the agent wants to personally check in with.

- **Pooled-line use:** None. Hard architectural rule, not a tunable parameter.

- **Cadence ladder:** Days 1–7 of 30-day window: agent prompt for one-tap personal send. Days 8–14: platform push if no agent action. Days 15–21: email if no client engagement. Days 22–30: cycle ends, no further outreach.

## 4.3 Lapse / Retention
- **First channel:** Push notification, if app installed and notifications allowed.

- **Escalation channel:** Linq SMS, if push unavailable or push delivered and no engagement within 5 days.

- **Third-touch channel:** Email (mandatory at third touch regardless of prior channel mix).

- **Cadence:** Maximum 2 SMS touches per non-responder per rolling 30 days. Hard quiet period (60 days minimum) after third touch.

- **Capacity allocation:** First lane to be suspended at KPI Tier 2 (§6).

- **Content:** Account-servicing tone, never marketing or guilt/shame language. NEPQ-consistent consultative framing.

## 4.4 Referral
- **Initiation channel:** Existing client uses one-tap referral in their app, which opens a group SMS to the new prospect with a pre-loaded warm intro sent from the referrer's personal phone. The referrer is the inviter; the prospect's social opt-in happens the moment they're added to the thread.

- **Platform side of the conversation:** Once the referrer's intro lands in the group thread, the platform (signed in the agent's name on the Linq line) drops in to thank the referrer briefly, then continues the qualifying conversation with the prospect in a 1:1 thread off the group. Qualifying captures details for the agent to handle on the booked call (needs, dependents, timing, current coverage). Books the prospect on the agent's calendar.

- **Cadence:** Initial qualifying response within 30 minutes of the prospect's first reply. One follow-up bump after 24 hours if no response. No further outreach if no engagement.

- **Capacity allocation:** Protected during Tier 1–2 (strongest consent provenance among the lanes — referrer-initiated and socially endorsed).

- **Content:** Reference the introducing client by first name. NEPQ-tuned voice, short and conversational. No links in opener.

- **Agent visibility:** Agent sees the full thread in real time in the dashboard. Can intervene at any point. Walks into the booked call already prepared with context from the qualifying exchange.

## 4.5 Beneficiary
The beneficiary lane operates fundamentally differently from client lanes because beneficiaries did not directly opt in to anything — they are simply named on someone else's policy. Cold beneficiary outreach is structurally indefensible. Instead, AFL captures beneficiaries into the contact graph through a consent-driven invite mechanic initiated by the policyholder.

### Invite mechanic
Architecturally identical to the client activation flow, with the policyholder as the initiator instead of the agent:

- In the policyholder's app, each adult beneficiary listed on a policy has an Invite button next to their record.

- Policyholder taps Invite. iMessage opens with a pre-filled welcome message from the policyholder's phone, including the AFL app download link and a login code tied to the beneficiary profile.

- Beneficiary downloads, enters code, opens app. The app surfaces the beneficiary's role on the policy and the agent's contact info. An Activate button uses sms: URL scheme to compose a pre-filled outbound from the beneficiary to the Linq line.

- Linq line responds with the agent's vCard, a thumbs-up ask, and a brief plain-English note about reaching the agent if anything happens to the policyholder.

This produces the same consent provenance quality as client activation: beneficiary-initiated inbound, registered-sender, in-channel, timestamped opt-in. From a carrier standpoint, gold.

### Three invite prompts
To maximize coverage without nagging the policyholder, three invite prompts run in parallel:

- **During policyholder activation flow.** After the policyholder taps Activate and gets the welcome from the Linq line, a follow-up prompt appears: "Want to add [Beneficiary Name] so they're set up too?" Highest conversion because the policyholder is already in setup mindset.

- **Annual beneficiary verification.** Once a year, the platform prompts the policyholder via push to confirm beneficiary information is current. The verification flow includes the option to invite any not-yet-invited beneficiaries.

- **Always-on access.** The policyholder's app surfaces the Invite button on the beneficiary record at any time, regardless of prompts.

### Claim-time language placements
AFL is not building a claim workflow at this stage. However, the platform makes the agent the visible contact at claim time through three lightweight language placements:

- Beneficiary's first app screen after activation includes a calm "What to do if [Policyholder] passes away" card. Three steps: call the agent, gather the death certificate and policy info, the agent walks you through the claim. Agent's name and number front and center.

- The Linq line's first response to a newly-activated beneficiary includes the line: "I'm here if you ever need anything — especially if something happens to [Policyholder]."

- Annual beneficiary push reminder: "Quick note — you're still listed as a beneficiary on [Policyholder]'s policy with [Agent]. If you ever need to reach me, here's how."

### What stays unchanged
- **No cold beneficiary outreach.** If a beneficiary has not been invited and activated, the platform does not contact them. Period.

- **No SMS automation for cold beneficiary contact.** Push only post-activation, with email as a secondary channel for annual verification.

- **Auto-reply default off for the beneficiary lane.** Activated beneficiaries who reply to a Linq line message route to the agent for personal review rather than an automated thread.

## 4.6 Holiday and Birthday Cards
- **Channel:** Push notification only.

- **Cadence:** Holiday cards seasonal, birthday cards on the day. No escalation if the push goes unread — gifts are not requests.

- **Pooled-line use:** None. The friction-to-impact ratio of using SMS for greeting cards is wrong, and the volume would crowd out higher-value lanes.

## 4.7 Bulk Import — Three Paths
New AFL agents joining with an existing book of clients face a one-time onboarding decision: how to introduce that book to the platform. Sending bulk SMS through the Linq line is architecturally off-limits (these are contacts with no prior relationship to the number, and bulk-sending was the original cause of the Limited reputation incident). The three paths below all route through the agent's personal phone or email infrastructure, never through the Linq line.

### Path 1 — Onboarding Ceremony
- **Mechanism:** Agent self-serve drip. The dashboard surfaces ~15 clients per day from the agent's existing book. Agent taps each one to open iMessage with a pre-filled welcome (download link + login code), reviews, sends. Repeats for 14 days for a typical book.

- **Effort:** Roughly 5–8 minutes of agent phone time per day, 90–120 minutes total over the 14-day window for a 200-client book.

- **Suited for:** Agents with stale books they want to actively re-engage; agents who genuinely want every existing client onboarded; agents who prefer doing the work themselves.

- **Cost:** Included in all paid tiers.

### Path 3 — Hybrid (Email-Then-Invite)
- **Mechanism:** Platform sends a one-time email blast to the agent's existing book introducing AFL with a self-service signup link. Email is zero deliverability cost. Clients who engage (click through, sign up via the link) are pulled into the agent-phone drip queue, where the agent sends a personal welcome to the engaged subset only.

- **Effort:** Variable — depends on the engaged subset. Typically 30–40 personal sends over a few days for a 200-client book, instead of 200 sends over 14 days.

- **Suited for:** Most agents. The default recommendation. Captures engaged clients efficiently while filtering out the disengaged majority that wouldn't have responded anyway.

- **Cost:** Included in all paid tiers.

### Concierge — Operator-Run Onboarding
- **Mechanism:** AFL operator imports the agent's client list into the dashboard and sends welcome touches as the agent. Operator works through the book at appropriate cadence; agent commitment is approving the message templates and being available for any escalations.

- **Operator scope:** Mechanical send work only. Sends are signed in the agent's name from the agent's account. The operator imports clients to the dashboard and runs the welcome messages.

- **Pricing:** $1,500 for email-only delivery; $2,500 for email + SMS delivery. One-time fee, billed at the start of the engagement.

- **Suited for:** Agents with large books (typically 300+ clients) who don't have time for the daily ceremony, or agency owners with multiple downline books.

- **Availability:** Available now (Phase 2-aligned launch). Offered to any tier; the gating factor is book size and willingness to pay, not subscription level.

### Default recommendation by book size
| **Book size** | **Recommended path** | **Rationale** |
| --- | --- | --- |
| Under 100 clients | Path 1 (Ceremony) | Manageable in under 7 days of light daily commitment |
| 100–300 clients | Path 3 (Hybrid) | Email blast filters the engaged subset; agent sends to the responders only |
| 300+ clients | Concierge | Self-serve options become impractical; operator-run engagement is the rational path |

These are recommendations, not enforcement rules. Any agent on a paid tier may choose any path regardless of book size.

# 5. Capacity Model
## 5.1 Linq Line Economics (Known Inputs)
- Cost: $250 per line per month (flat).

- Recommended ceiling: 50 unique new conversations per line per day (~1,500/month).

- Steady-state operating target: 35 conversations per line per day (~1,050/month, 70% utilization). Reserved 30% serves as headroom for bursts, replies, and recovery from any KPI tier event.

- Reciprocity targets (Linq guidance): 1 reply per 2 sends; 30–40% ideal first-message reply rate; 15% minimum first-message reply rate.

## 5.2 Outbound New Conversation Budget
With welcome handled outside the Linq line and most retention routed through push first, the outbound new-conversation budget on the Linq line is dominated by referral outreach:

| **Configuration** | **Outbound new convs/agent/mo** | **Outbound/line/mo @ 70 agents** | **Outbound/line/mo @ 100 agents** | **Outbound/line/day @ 100** |
| --- | --- | --- | --- | --- |
| Pre-realloc (everything on Linq) | 30–40 | 2,100–2,800 | 3,000–4,000 | 100–133 (over ceiling) |
| Post-realloc, typical agents | 4–7 | 280–490 | 400–700 | 13–23 |
| Post-realloc, top agents | 6–12 | 420–840 | 600–1,200 | 20–40 |
| Mixed agent base @ 70/line | 5–9 (blended) | 350–630 | — | 12–21 outbound |

Operating outcome: 70 agents per line yields outbound new conversations well below the 50/day cap. 100 agents per line remains achievable as the optimization ceiling, particularly when blended across agent tiers.

## 5.3 Inbound Reply Ratio Reinforcement
Client-initiated activation inbound messages provide pure-numerator reply ratio reinforcement. At 70 agents per line, expect 700–1,050 inbound activation messages per line per month — every one of which is a reply event for the Linq line's reputation system, with no outbound counterpart.

Combined with the welcome opt-in flow's downstream effect (clients who activated have demonstrated engagement and are higher-probability replyers on subsequent outbound), the line's expected steady-state reply:send ratio sits well above Linq's 1:2 target.

Caveat: this analysis assumes Linq counts client-initiated inbound conversations favorably (or at least neutrally) in their reputation scoring. If Linq's response to the §13 questions reveals different treatment, the model's reliance on activation inbound for reputation reinforcement weakens. See §12.6.

## 5.4 Multi-Line Scaling
- **Lane specialization:** When two or more lines are provisioned, separate lanes by line (e.g., a dedicated activation/conversation-continuation line, a separate retention/referral line). A KPI tier event on retention then does not throttle activation, which is the more strategically protected lane.

- **Book-size gating:** Larger agent books unlock additional line slots (one line per ~10–15 active agents on the higher tiers), not larger per-agent allowances.

- **Provider redundancy:** At 5+ lines, evaluate Twilio as a warm spare. Single-provider failure is a real continuity risk for a messaging-dependent product.

# 6. KPI Thresholds and Slowdown Triggers
All KPI thresholds operate at the line level on trailing 7-day windows. Triggers are platform-enforced; agents do not opt out of throttling.

## 6.1 Five-Tier System
| **Tier** | **Trigger** | **Automated Action** | **Exit Criteria** |
| --- | --- | --- | --- |
| Tier 0 — Healthy | Reply rate ≥25%, reply:send ≥1:2, no Linq status warnings | Normal operation | — |
| Tier 1 — Watch | Reply rate <25% or reply:send <1:2.5 | Surface in dashboard. New bulk imports require manual approval. No automated throttle. | 3 consecutive days back above thresholds |
| Tier 2 — Throttle | Reply rate <20% or reply:send <1:3, OR 3 consecutive days at Tier 1 | Daily line capacity reduced 50%. Lapse/retention lane suspended. New bulk imports blocked. | 3 consecutive days back above Tier 1 thresholds |
| Tier 3 — Pause | Reply rate <15% or reply:send <1:4, OR Linq downgrade | All automated outreach halted. Agent-initiated single sends allowed. 7-day cooldown. | 7 consecutive days clean window |
| Tier 4 — Lockdown | Linq Limited or worse, OR repeat Tier 3 within 30 days | Full pause. Mandatory review. Number replacement playbook (§6.3) considered. | Linq confirmation + 7-day clean window + decision on number replacement |

## 6.2 Carrier-Level Metrics (When Available)
Once per-carrier deliverability metrics are obtained from Linq, layer them into the tier system as additional triggers:

- STOP/opt-out rate >1% over 7-day window: Tier 2 trigger.

- 30007 (carrier filtered) error rate >5%: Tier 3 trigger.

- 30008 (unknown error) rate >3%: Tier 1 trigger; investigate.

- T-Mobile delivery rate <80%: Tier 1 trigger; specific to T-Mobile's stricter filtering profile.

## 6.3 Number Replacement Playbook
Number replacement is a Phase 4 contingency, not a Phase 1 action. The first Limited episode happened under the old operating model; the new model is expected to recover and stay recovered. Replacement is on the table only when the new model fails.

Triggers for considering number replacement:

- A second Limited episode under the new operating model (i.e., after Phase 2 lane discipline is shipped and operating).

- Persistent T-Mobile delivery rate below 70% over 30 days, despite Tier 1–2 corrections.

- Linq confirms via carrier-side data that the number's reputation is irrecoverable.

Process when triggered:

- Provision a fresh Linq number with full TCR registration. Do not retire the existing number yet.

- Route the new number to lanes most sensitive to fresh reputation: client-initiated activation inbound (which gives the new number an immediate reply-ratio anchor), referral outreach.

- Existing number takes lower-reputation-priority lanes (retention to clients with prior conversation history, where the established number relationship matters more than the carrier reputation).

- Communicate the new number to active clients via in-app announcement. Avoid mass-SMS announcement that itself creates new-conversation load.

- Retire the old number after 30 days of clean operation on the new one, OR keep both as a multi-line setup if utilization warrants.

Two things to do regardless of any replacement decision:

- Ask Linq specifically about per-carrier reputation visibility — see §13 question 5.

- When Phase 4 multi-line expansion happens, the new lines are de facto fresh numbers. Use the lane-specialization pattern in §5.4 to dilute load on the historical line gracefully.

## 6.4 Lane-Level Reply Rate Tracking
Beyond line-level metrics, track per-lane reply rate as a leading indicator. Activation inbound 100% (definitionally, since each is itself a reply); retention outbound 15–25%; referral 25–40%; anniversary not applicable (off pooled line). A lane drifting below its expected band is an early signal even if the line aggregate remains healthy.

# 7. Onboarding Ceremony (Bulk Import)
Bulk import is reframed in this operating model from an ongoing operational risk into a once-per-agent-lifecycle ceremony. An agent imports their existing book once, when they first onboard. After this event, no further bulk imports occur.

The ceremony framing has two consequences. First, the import can be slow without losing strategic value — agents should expect it to take 7–14 days. Second, all the heavy carrier-risk controls collapse from recurring features into onboarding gates.

## 7.1 Pre-Import Validation
- Contact list cleaned and de-duplicated. International numbers and obvious junk filtered.

- Pre-send simulation visible to agent: estimated days to complete, projected reply rate based on import size.

- Contact count gate: imports >300 contacts trigger an additional review step before drip starts.

- Consent attestation: agent confirms each contact represents an existing client relationship with prior messaging consent in the original engagement.

## 7.2 Drip Release Rules
- Maximum 15 conversations per day from any single new-agent import, regardless of book size.

- Time-of-day banding: drip fires only between 9am and 6pm in the recipient's local time. No weekend sends. No Friday-after-4pm sends.

- Channel: agent-phone one-tap (the welcome flow described in §3.3). Pooled line is not used for the import drip.

- Subsequent activation inbound (clients tapping Connect in the app) flows naturally back to the Linq line at whatever pace clients install and open the app — no platform-side rate limiting needed for inbound.

- If agent does not act on the day's queued contacts, contacts roll to the next day. No backfill, no double-day to catch up.

## 7.3 Content Variation Requirement
All welcome openers within an import use one of at least three pre-approved content variants, randomly assigned. Even though the agent-phone path largely avoids carrier-side scrutiny, the platform should enforce variation as a hygiene practice in case the agent's number ever lands on commercial-flag heuristics.

# 8. Pricing and Packaging
## 8.1 Unit of Sale: Conversations, Not Messages
The right billing unit is conversations, not individual messages. Three reasons:

- **Linq's reputation system measures conversations.** Carriers care about reciprocity. Pricing in messages incentivizes one-shot blasts; pricing in conversations incentivizes the patterns that keep lines healthy.

- **It is defensible to agents.** "You purchased 75 conversations" is a real product decision, not a billing trick.

- **It aligns capacity to product.** Per-agent allowances directly map to per-line conversation budgets.

Counted toward an agent's monthly allowance: any conversation that involves outbound messaging from the platform via the Linq line on that agent's behalf — retention SMS, referral outreach, follow-up sends in active two-way conversations. Not counted: client-initiated inbound activation messages (zero platform send cost), agent-phone sends, push notifications, email.

## 8.2 Tier Structure
| **Tier** | **Price** | **Convs/month** | **Daily cap** | **Overage** | **Suitable agent profile** |
| --- | --- | --- | --- | --- | --- |
| Starter | $29/mo | 30 | 3 | $0.50/conv | Year-1 agent, small book, building production |
| Growth | $59/mo | 75 | 8 | $0.50/conv | Established producer; the anchor tier |
| Pro | $119/mo | 200 | 20 | $0.50/conv | Top producer, large book, high activity; multi-line eligible |
| Agency | $199 + $39/seat | 100/seat pooled | 10/seat | $0.50/conv | Agency owner managing a downline; pooled capacity across team |

All tiers include access to push, agent-phone one-tap, and email channels. The included conversation count is a budget for pooled-line SMS only. Agency tier pools its conversation budget across all seats — a 5-seat agency has 500 conversations/month shared across the team. This separation is critical for both pricing communication and capacity governance. Full pricing rationale, buyer segmentation, and pricing-page design live in the companion Pricing & Packaging Playbook.

## 8.3 Founding Member Treatment
The 34 founding-tier agents (free-for-life seats) are grandfathered at Growth-equivalent capacity (75 conversations per month) with the following constraints:

- Free seat is permanent. Not subject to base-tier price increases.

- Overage is available at full price ($0.50/conv). Founding members can exceed their bucket; they just pay for what they exceed it by, same rate as paid tiers.

- Hard daily cap enforced at 8 conversations/day (same as Growth).

- All channel features available (push, agent-phone, email) with no limit.

- Bulk-import onboarding ceremony available once per agent if not already used.

- Founding agency owners: $199 platform fee waived; they pay $39/seat for downline agents on their account.

Founding-tier agents are subject to the same KPI throttling rules as paid tiers — there is no reputation immunity for grandfathered seats.

## 8.4 Margin Model
Per-agent line cost at the operating target (70 agents/line, $250/line/month) is $3.57. Per-tier gross margin on platform-attributable revenue:

| **Tier** | **Price** | **Line cost/agent** | **Gross margin** | **Notes** |
| --- | --- | --- | --- | --- |
| Starter | $29/mo | $3.57 | 87.7% | Entry point; high margin even at modest price |
| Growth | $59/mo | $3.57 | 94.0% | Anchor tier; the bulk of paying agents |
| Pro | $119/mo | $3.57 | 97.0% | Top producers; multi-line gating applies above 250 active clients |
| Agency (per seat) | $39/seat | $3.57 | 90.8% | Plus $199 platform fee, which is structurally pure margin (admin overhead not directly attributable to messaging) |

At 70 agents per line, all four tiers comfortably exceed the 90% gross margin target on individual messaging revenue. At 50 agents per line (a more conservative early-deployment density), the line cost rises to $5.00/agent: Starter drops to ~82.8%, Growth to ~91.5%, Pro to ~95.8%, Agency per-seat to ~87.2%. The model is robust to early under-utilization.

Overage at $0.50/conv against $0.17 fully-loaded cost yields ~66% gross margin on overage messaging — below the base-tier margin, but acceptable as overflow protection rather than a profit center.

## 8.5 Book-Size Effects
Larger books do not unlock larger per-agent allowances by default. Larger books generate disproportionate retention pressure (the riskiest lane), so giving them more single-line capacity is operationally counterproductive. Instead, larger books unlock additional line slots at incremental cost. Agents at Pro tier with books over 250 active clients become eligible for a second-line allocation at +$50/mo per additional line slot. Agency tier already accommodates large-book scenarios through its multi-seat structure on shared pooled capacity.

# 9. Agent Tooling Strategy
## 9.1 The One-Tap Mechanic — Technical Detail
The mechanism is the sms: URL scheme, supported natively on iOS, Android, and most desktop browsers. A button in the agent dashboard renders an anchor tag of the form sms:+15555555555&body=Hi%20John... — when tapped on a mobile device, the OS opens the native messaging app with the recipient and pre-filled body. Per-tap latency is 3–5 seconds.

The same URL scheme pattern is used for the client-side Activate button described in §3.3. Both implementations share the same underlying mechanic; the difference is direction (agent→client vs. client→Linq line) and the message body.

## 9.2 Device Compatibility Matrix
The sms: URL scheme behaves differently across device combinations. The product implication is that one-tap mechanics should be primarily a mobile experience, with desktop dashboards surfacing queues but routing actual sends through the agent's phone.

| **Device combination** | **Works** | **Notes** |
| --- | --- | --- |
| iOS (iPhone/iPad) | Yes | Native iMessage. Best experience. Most likely device for both agents and clients in the AFL demographic. |
| Android phone | Yes | Native default messaging app. RCS support between Google Messages users provides parallel rich-message experience to iMessage. |
| macOS + iPhone signed into iMessage | Yes | Continuity routes through paired iPhone. Excellent desktop experience. |
| macOS + Android phone | No | No native bridge. Agent must use phone for sends. |
| Windows + Phone Link paired to Android | Yes | Phone Link relays through paired Android via Bluetooth/Wi-Fi. |
| Windows + Phone Link paired to iPhone | Partial | Microsoft added iPhone support in 2023 but iMessage features are limited; group messaging unreliable. |
| Windows with no Phone Link setup | No | sms: links typically fail silently or prompt for a default app association. |
| Chromebook / Linux | No | No native handler for sms: URLs. |

## 9.3 Mobile-First Implementation
The product implication of the device compatibility matrix is that the agent dashboard's one-tap experience should be primarily mobile. The agent is on their phone, in the AFL PWA, tapping through their welcome and anniversary queues between other tasks. Desktop should show the queue and let them review/edit drafts, but the actual send action routes through their phone.

This is a feature, not a limitation. The agent's phone is where the relationship lives — the saved-number, the iMessage seamless experience, the Wispr-style voice dictation for personalized edits. Forcing the send action onto the phone is correct design even setting aside the technical constraints.

For the small minority of agents on Windows + non-paired devices, the dashboard surfaces an explicit "open on your phone to send" prompt with a deep link or QR code. Acceptable for an edge case.

## 9.4 PWA-First, Native Deferred
The recommended initial implementation is a Progressive Web App — a mobile-optimized view of the existing AFL agent dashboard, installable to the home screen, with sms: URL scheme buttons for one-tap sends and Web Push for agent-side notifications (queue alerts, replies received, anniversary touches due).

Why PWA, not native, in Phase 1–2:

- Single codebase. No App Store / Play Store review cycles, no separate engineering for two platforms.

- Web Push works on iOS 16.4+ and on all current Android. Coverage is sufficient for agent-side notifications.

- All required mechanics (sms: links, deep links into dashboard views, push) are PWA-native.

- Faster iteration during the period when the operating model is still being validated.

Native is justified later when one or more of these conditions hold: Web Push reliability becomes a measurable drag on agent compliance with anniversary one-tap (APNs is more reliable on iOS than Web Push); background workflows become product priorities; or App Store presence becomes part of the AFL marketing surface. Plan for native as a Phase 4 investment. Don't pre-build it.

## 9.5 Device Mix Among the Founding 34
Recommended action: confirm device mix among the founding-cohort agents in Phase 1. If heavily iPhone-skewed (likely, given financial-services demographic), the standard PWA implementation serves the majority well and Android/Windows fallbacks are edge-case. If a meaningful Android contingent exists, write a one-page "how to set up your phone for AFL one-tap" onboarding doc, particularly covering Phone Link configuration for Windows + Android users.

## 9.6 What Is Not on the Table
SendBlue, Beeper-style relays, and similar iMessage-bridge services are explicitly out of scope. Three reasons:

- **Apple's terms of service.** These services run Mac-mini farms with real Apple IDs to relay iMessages. Apple has historically shut down such services (Sunbird/Nothing Chats, Beeper Mini); the precedent is clear.

- **Continuity risk.** An overnight shutdown of the relay provider is an existential risk to a messaging-dependent product.

- **Compliance posture.** Insurance is regulated. Building a core distribution channel on a TOS-violating service creates audit and reputational exposure that is not justified by the blue-bubble aesthetic alone.

The legitimate path to iMessage-native experiences is Apple Messages for Business (AMB), which Linq has confirmed they do not run. AMB would require direct registration with Apple, evaluated in Phase 4 only if branded sender identity becomes strategically important.

## 9.7 vCard Generation
Per-agent vCards are sent as MMS attachments from the Linq line as part of the first response after activation. The vCard lets the client save the Linq line as a properly-named contact (e.g., "Daniel Roberts — Office") with the agent's photo, so subsequent messages from the line arrive labeled correctly on the client's phone.

### Generation pipeline
vCards are generated server-side, one per agent, regenerated when the agent's name or photo changes. Suggested fields:

- FN (full name): Agent's full name as entered in their profile.

- ORG: Agent's agency or business name. Optional, used when the agent has set one.

- TEL: The Linq line phone number, labeled WORK.

- EMAIL: An agent-specific email if available (e.g., daniel-team@agentforlife.app).

- PHOTO: Compressed JPEG, base64-embedded, ~400x400 pixels, 75–80% quality, kept under 60KB.

- NOTE: Brief one-line explanation of what the office line is used for.

### Photo handling
Agents already upload a profile photo during dashboard onboarding. The vCard generation pipeline needs a vCard-specific derivative — a separate compressed version, not the raw upload. Recommended:

- On agent photo upload, generate two derivatives: a profile-display version (used in the dashboard and the in-app agent profile, can be larger and higher quality) and a vCard version (400x400, JPEG at 75–80% quality, under 60KB).

- Store both. Regenerate the vCard whenever the photo changes so existing vCard files stay current for new sends. (Existing clients who already saved an old vCard retain the old contact card; that's acceptable since most agents won't change photos frequently.)

### Carrier MMS size constraints
Total MMS payload should stay safely under 100KB to avoid carrier-side rejection or downgrade. With a 60KB compressed photo, the resulting vCard plus a brief text body fits comfortably. Without compression, agent profile photos can easily exceed 600KB and break delivery.

### Linq line first response with vCard
The first response from the Linq line after a client activates includes both the welcome text and the vCard attachment in the same MMS. The thumbs-up ask is part of the same message body. One outbound, three jobs (welcome, contact-save prompt, reciprocity ask).

# 10. Provider Strategy
## 10.1 Stay on Linq Through Phase 1–2
Two reasons not to switch providers near-term, despite Linq's $250/line/month being above wholesale 10DLC economics:

- **Recovery continuity.** AFL is recovering from Limited status. Switching providers means starting fresh on the new provider — new TCR registration, new brand vetting, new carrier reputation building. Trading a known recovery path for an unknown one during the most fragile phase is a bad trade.

- **Managed compliance.** Linq is doing real reputation work — they downgraded the line to Limited rather than letting AFL spam itself off the carrier networks. A more permissive provider would not have caught this. The $250 includes that managed protection.

## 10.2 Build Provider Abstraction Now
Anywhere AFL code calls Linq's API, route the call through an internal MessagingProvider interface. Small investment now, zero cost later if never exercised. The cost of not having it during a Linq outage or pricing dispute is large.

Suggested interface surface: sendMessage(recipient, body, lane), getLineHealth(), subscribeReplies(callback), registerNumber(brand, campaign).

## 10.3 When to Add Twilio
Add Twilio (or equivalent — Telnyx, Plivo) as a secondary provider when one or more conditions hold:

- AFL operates 5 or more lines.

- Linq confirms reputation pooling across customers (per-platform), making Linq a single point of failure beyond AFL's control.

- Per-line absolute dollar cost becomes material to gross margin at scale.

Twilio's tradeoff: lower per-segment cost ($0.008–$0.015), but AFL becomes the entity registered with The Campaign Registry. AFL manages 10DLC brand vetting, campaign approvals, complaint handling, and carrier relationships. The compliance overhead is significant for a solo founder; weigh the time cost against the dollar savings.

## 10.4 Redundancy Model
Once Twilio is added, run a hot-standby pattern: Linq carries primary traffic, Twilio carries overflow (e.g., when a Linq line is in Tier 2 throttle) and serves as failover during Linq incidents. Specific lanes can be permanently routed to either provider based on suitability.

# 11. Phased Rollout Plan
## 11.1 Phase 1 — Recover and Instrument (Months 1–2)
Goal: exit Limited status, build the instrumentation needed to operate the model. Linq has already moved the line back to standard; Phase 1 confirms this is durable.

Actions:

- Confirm number architecture and reputation scope with Linq in writing. Document the answer in CONTEXT.md.

- Pull 10DLC brand vetting score and TCR campaign mappings.

- Submit the questions in §13 to Linq, including the new client-initiated conversation questions.

- Implement per-line daily budget enforcement at 35 conversations/day.

- Build the five-tier KPI dashboard (line and lane level).

- Build provider abstraction layer in code.

- Confirm device mix among founding 34 agents.

- Prepare email-based re-consent flow for lapse/retention (build, do not deploy).

Success criteria:

- 30 consecutive days at Tier 0.

- Line status stable at standard, no Tier 1+ events traceable to old patterns.

- Linq has confirmed reputation scope, TCR posture, and client-initiated conversation treatment in writing.

## 11.2 Phase 2 — Lane Discipline and New Welcome Flow (Months 3–4)
Goal: ship the channel architecture, the new welcome flow, and lane rules.

Actions:

- Ship one-tap agent-phone welcome flow in agent dashboard (PWA implementation, mobile-first). Personal-phone message includes app download link and login code.

- Ship in-app Activate button (sms: URL scheme to Linq line, pre-filled body). Activation screen prompts notification permission with clear copy.

- Build vCard generation pipeline (server-side per-agent, compressed photo, MMS attachment from Linq line).

- Ship Linq line first-response copy with vCard attached and thumbs-up reciprocity ask.

- Make agent-phone welcome the default for all new client introductions; pooled-line welcome path deprecated.

- Ship anniversary push-or-email-only flow. No pooled-line SMS path implemented for anniversary.

- Ship push-first routing for retention, holiday/birthday cards, and beneficiary outreach.

- Ship lane-level reply rate dashboard for agents.

- Ship auto-throttling at Tiers 1 and 2.

- Per-lane cadence rules enforced in code (lapse/retention 2-touch rule, etc.).

- Onboarding ceremony (bulk-import drip) live for new agent signups.

- Track agent welcome-send compliance, app activation rate, and thumbs-up response rate as top-three operational metrics.

Success criteria:

- Agent welcome-send compliance above 80%.

- Client app activation rate (download + Activate tap) above 70%.

- Thumbs-up response rate to first Linq line response above 60%.

- Lapse/retention reply rate stable above 18% on whatever escalates to Linq SMS.

- Zero pooled-line anniversary outbound sends in trailing 30 days.

- Bulk-import onboarding completes for at least 5 new agents without triggering Tier 1+ events.

## 11.3 Phase 3 — Pricing Rollout (Months 5–6)
Goal: introduce conversation-based tiers; validate margin model with real billing data.

Actions:

- Conversation allowances live for new signups in Starter/Growth/Pro/Agency tiers.

- Founding cohort grandfathered at Growth-equivalent.

- Overage billing tested with a small cohort (5–10 agents) before general release.

- Book-size-aware multi-line eligibility unlocked for Pro tier.

- Pricing-page copy and onboarding flow updated to reflect conversation-as-unit.

Success criteria:

- Blended messaging gross margin above 80% in trailing 30 days of billing.

- No Tier 3 events traceable to paid-tier overage behavior.

- Less than 10% of paid agents hitting hard daily caps in any given week.

- New-signup tier distribution roughly matches the agent-tier profile in §2.2.

## 11.4 Phase 4 — Multi-Line, Diversification, and Contingencies (Months 7–12)
Goal: scale beyond a single line; reduce single-provider risk; evaluate AMB; activate number-replacement playbook if needed.

Actions:

- Provision second and third Linq lines with lane specialization.

- Email fallback fully integrated for lapse/retention third-touch and anniversary days 15–21.

- Twilio provisioned as warm-standby provider once line count reaches 5.

- Apple Messages for Business evaluated as a direct Apple registration effort if branded sender identity becomes strategically important. (Not available through Linq.)

- Consent provenance audit completed for all lanes; re-consent flow deployed for lapse/retention if audit findings warrant.

- Native agent app evaluated against PWA usage data and retention metrics.

- If a second Limited episode occurs under the new operating model, activate number replacement playbook (§6.3).

Success criteria:

- Any single line going Limited cannot pause more than 50% of platform messaging.

- Linq + secondary provider failover tested and documented.

- Push opt-in rate among AFL clients tracked and stable in the 30–60% range (or higher).

- 100 agents per line achieved on at least one line without sustained tier events.

# 12. Architectural Sensitivities
Several inputs to the operating model remain unconfirmed. The model is robust to most variations, but the following sensitivities should be tracked and the model adjusted as facts arrive.

## 12.1 If Reputation Is Per-Tenant (Pooled Across AFL Agents)
If Linq confirms reputation pools across all AFL agents within the AFL tenant:

- Per-agent governance must be substantially tighter; bad-actor agents drag the whole tenant.

- Daily caps drop ~30% to provide more headroom against single-agent spikes.

- KPI tier triggers move earlier (e.g., Tier 1 at <30% reply rate instead of <25%).

- Build an agent-level kill switch enabling AFL to suspend individual agents whose patterns drag the tenant.

## 12.2 If Reputation Is Per-Platform (Pooled Across Linq's Customers)
This is the worst case. AFL has less control than the model assumes, and a noisy neighbor on Linq can degrade AFL deliverability.

- Lobby Linq for tenant isolation. Document the response.

- Accelerate Twilio evaluation. Provider redundancy moves from Phase 4 to Phase 3.

- Treat Linq as a single point of failure in continuity planning.

## 12.3 If Consent Provenance for Lapse/Retention Is Weaker Than Assumed
- Lapse/retention requires an explicit re-consent flow before any automated SMS touch.

- Re-consent flow is email-first and requests confirmed SMS opt-in before any platform-initiated send.

- Build the re-consent flow in Phase 2 even if not deployed; deploy it in Phase 3 if findings warrant.

## 12.4 AMB Is Not a Linq Capability
Linq has confirmed (operator email, May 2026) that they do not run Apple Messages for Business. Their lines are standard P2P iMessage on dedicated hardware, not AMB-registered accounts. The experience on the recipient end reads as personal P2P, not a branded business sender. There is no path to AMB through Linq.

Implications for the operating model:

- Pricing tiers stay anchored to the current channel mix (P2P iMessage when both endpoints are iPhones, green-bubble SMS otherwise). No tier-up justified by AMB capabilities.

- Anniversary lane stays on push and email only. AMB-routed anniversary outreach is not a near-term option.

- Branded sender identity, if it becomes strategically important, would require direct AMB registration with Apple as a Phase 4 contingency. This is a meaningful project (Apple AMB approval, MSP partner selection, sender registration, conversation infrastructure) that should not be undertaken without a clear strategic driver.

## 12.5 If Line Cost Is Materially Higher Than $250
- 90% gross margin on Starter tier is at risk first; reprice or compress allowance.

- Reframe gross margin commitments before discovering the gap in a quarterly review.

- Twilio evaluation accelerates; the dollar gap between Linq and Twilio at scale becomes a real lever.

## 12.6 Client-Initiated Inbound Is Not Counted
Linq has confirmed (operator email, May 2026) that client-initiated inbound conversations do not count against the 50/day outbound new-conversation budget. Activations and inbound-initiated threads are essentially free from a new-conversation cap standpoint — the cap applies only to outbound new conversations from the Linq line.

This validates the welcome flow architecture as designed and produces meaningful headroom on the lanes that do consume the cap (referral follow-up, retention escalations, conversation continuation). At 70 agents per line, the model has substantial slack.

If client-initiated inbound were ever reclassified to count against the cap (which would require a Linq policy change), the contingencies would be:

- Activate-button rate limiting (e.g., maximum 25 inbound activations per line per day, with overflow queued for the next day).

- Multi-line expansion from Phase 4 to late Phase 3 to absorb activation inbound from a growing agent base.

- Welcome flow alternative (Option A from prior analysis — agent-phone welcome with platform-inclusive opt-in language, no Activate button) becomes the fallback.

## 12.7 If Agent Compliance with One-Tap Welcomes Is Below 60%
- Welcome volume falls back onto the platform's email channel as fallback, which has lower reply and activation rates.

- Investigate whether the friction is UX (button placement, copy) or workflow (notification timing, queue surfacing).

- Worst case, partial reversion to platform-sent welcome via Linq — but with the opt-in-asking format that produces high reply rates and protects the line.

# 13. Linq Confirmations and Remaining Open Questions
## 13.1 Confirmed by Linq (May 2026)
The following items have been confirmed in writing by the Linq operator and are now operating assumptions, not open questions:

- **Client-initiated inbound is not counted against the 50/day cap.** The 50/day ceiling applies only to outbound new conversations from the Linq line. Activations and inbound-initiated threads are essentially free from a new-conversation cap standpoint. Validates the welcome flow architecture as designed.

- **Capacity definition and ramp.** The previously-cited 500 figure was modeled against total daily message throughput, not new outbound conversation initiations. The 50/day new outbound conversation cap is a real ceiling. Ramp guidance: start at 70 agents/line, watch reply rate and opt-out rate for 60–90 days, push toward 100 if both stay clean. No formal milestone checklist — it's behavior-based.

- **AMB is not available through Linq.** Linq lines are standard P2P iMessage on dedicated hardware, not AMB-registered accounts. The recipient experience reads as personal P2P, not a branded business sender. There is no AMB path through Linq. Direct registration with Apple is the only route if branded sender becomes important — Phase 4 contingency only.

- **Bulk import lane.** Bulk import cannot run through the Linq line under any circumstances. Confirmed as agent-personal-phone only.

## 13.2 Remaining Open Questions
The following items still require Linq confirmation. The recommended path forward in §11 does not depend on these answers — Phase 1 actions are valid under any answer — but the model's specific parameters tighten as the answers arrive. Listed in priority order:

- **1. Reputation scope.** Per-number, per-tenant (across AFL agents), or per-platform (across Linq customers)? Determines §12.1–12.2 sensitivities.

- **2. 10DLC brand vetting score.** Current score determines per-carrier throughput tier and risk tolerance for new campaigns.

- **3. Per-carrier reputation visibility post-recovery.** We were in Limited and are now back to standard. Can Linq share per-carrier delivery rates we're currently seeing, especially T-Mobile? Are there any indicators that the carriers themselves are treating this number differently than they would a fresh-registered one? Determines whether §6.3 number replacement should activate sooner or later.

- **4. TCR campaign use-case classifications.** How is each lane currently registered? Lapse/retention specifically — Account Notification, Customer Care, or Marketing? Different filtering profiles.

- **5. Per-carrier delivery rates (ongoing).** Especially T-Mobile, which has the strictest filtering. Establishes the baseline for §6.2 thresholds.

- **6. STOP rate, 30007 rate, 30008 rate.** Required to layer carrier-level KPI triggers into the tier system.

- **7. Carrier pass-through fees.** Whether $250/line/month is fully loaded or whether CCMI/AT&T/T-Mobile fees apply on top. Determines §12.5 sensitivity.

- **8. Account isolation guarantees.** Specifically, is AFL's account architecturally isolated from other Linq tenants? Required to validate the per-number/dedicated assumption.

# 14. Decisions to Document in CONTEXT.md
The following decisions made during this strategic review should be reflected in the AFL CONTEXT.md before any of the operating model is built. CONTEXT.md is the single source of truth and should be updated immediately.

## 14.1 Architectural Decisions
- Push is the universal first-choice channel for all eligible lanes (anniversary, retention, holiday/birthday cards, beneficiary outreach). App dormancy is not a disqualifier for push; permission is.

- Anniversary lane is push or email only. Never pooled-line SMS. Architectural, not tunable.

- Welcome flow is two-step: (1) agent sends from personal phone via one-tap, including app download link AND login code, with instruction to tap Activate after install; (2) client downloads, logs in with code, and taps Activate, which uses sms: URL scheme to compose a pre-filled outbound to the Linq line.

- Linq line's first response after activation includes (a) the agent's vCard for proper contact-card saving and (b) an explicit thumbs-up ask for delivery confirmation and reciprocity.

- Thumbs-up reciprocity mechanic used on activation, anniversary check-ins, and time-sensitive sends — not on every message.

- Identity on Linq line: agent identity preserved (NEPQ-tuned voice signed under agent's name). EA framing considered and deferred as a future architectural option; revisit if scale or regulatory triggers warrant.

- vCard generation: server-side, per-agent, with embedded compressed photo (under 60KB JPEG, ~400x400). Two photo derivatives stored — display and vCard — generated on agent profile photo upload.

- Beneficiary invite mechanic: parallel architecture to client activation, initiated by the policyholder. Invite button in the policyholder's app composes pre-filled iMessage to beneficiary with download link + login code. Beneficiary activates same as client; Linq line's first response includes vCard, thumbs-up ask, and brief claim-time language.

- Three beneficiary invite prompts: during policyholder activation flow, during annual beneficiary verification, always-on access from the policyholder's app.

- No cold beneficiary outreach. Beneficiaries enter the AFL contact graph only via policyholder invite + activation.

- Claim-time language placements (no claim workflow built): beneficiary's first app screen after activation; Linq line first-response copy to newly-activated beneficiaries; annual push reminder. Not on policyholder's beneficiary-info page (intentionally low-touch).

- No minor beneficiary handling at this stage.

- Bulk import is a once-per-agent-lifecycle decision. Three paths: Path 1 Onboarding Ceremony (agent self-serve drip), Path 3 Hybrid (email blast → engaged subset to drip), Concierge (operator-run). All three available; recommendation by book size.

- Beneficiary lane: maintain push-only for cold contact (no SMS automation). Linq line involvement is post-activation only and constrained by the same rules as client communications.

- Lapse/retention cadence: push first if available; if push fails or unavailable, max 2 SMS touches per non-responder per 30 days; third touch must be email; hard quiet period of at least 60 days after the third touch.

- Number replacement is a Phase 4 contingency, not a Phase 1 action. Trigger is a second Limited episode under the new operating model.

## 14.2 Capacity and Pricing Decisions
- Per-line operating target: 70 agents per line (steady state). Ramp toward 100 after 60–90 days at 70 if reply rate and opt-out rate stay clean. Ramp is feel-it-out, no formal milestones.

- Linq has confirmed: 50/day applies to outbound new conversations only; client-initiated inbound does not count against the cap.

- Unit of sale: conversations, not messages. Client-initiated inbound activation messages are not counted against agent allowances (zero platform send cost).

- Tier structure: Starter (30 convs/$29), Growth (75 convs/$59), Pro (200 convs/$119), Agency ($199 + $39/seat). Conversation budgets pool at the agency level for Agency tier.

- Overage: $0.50 per conversation across all individual tiers and the Agency pool.

- Founding tier (the 34): grandfathered at Growth-equivalent (75 convs/mo), free seat permanent, overage at full price ($0.50/conv). Founding agency owners: $199 platform fee waived, pay $39/seat for downline.

- Book-size-aware multi-line eligibility unlocks at Pro tier for agents with 250+ active clients (+$50/mo per additional line slot).

- Concierge add-on: $1,500 email-only / $2,500 email + SMS. One-time fee. Operator-run book onboarding. Available to any tier; gated by book size and willingness to pay, not subscription level.

## 14.3 Technology Decisions
- Provider strategy: stay on Linq through Phase 1–2; build provider abstraction in code immediately; add Twilio as warm-standby at 5+ lines.

- Agent tooling: PWA-first (mobile-optimized agent dashboard with sms: URL scheme one-tap and Web Push); native app deferred to Phase 4 pending usage data.

- One-tap mechanic is mobile-primary. Desktop dashboard surfaces queues but actual sends route through agent's phone.

- Confirm device mix among founding 34 in Phase 1; produce Phone Link onboarding doc if Android contingent is meaningful.

- vCard delivered as MMS attachment from the Linq line (not from the agent's personal phone) on the first response after client activation. The sms: URL scheme cannot attach files; MMS from Linq can.

- AMB (Apple Messages for Business): confirmed unavailable through Linq. Direct registration with Apple is the only path; Phase 4 contingency only if branded sender becomes strategically important.

- No SendBlue, Beeper-style relays, or other iMessage-bridge services.

- Provider abstraction layer interface: sendMessage, getLineHealth, subscribeReplies, registerNumber. Implemented in code before any Phase 2 work begins.

- Concierge operator dashboard role with scoped data access: client list (names, phone numbers, basic context). Operator sends originate from agent's account.

## 14.4 Operational Decisions
- KPI tier system: five tiers (Tier 0 Healthy through Tier 4 Lockdown) operating on trailing 7-day windows at the line level.

- Steady-state per-line operating target: 35 outbound new conversations per day (70% of Linq's 50/day recommended ceiling).

- Re-consent flow for lapse/retention: built in Phase 2, deployed in Phase 3 if consent audit findings warrant.

- Push opt-in rate is a top-three operational metric; tracked from Phase 1; influences Phase 4 capacity planning.

- Three Phase 2 success metrics: (a) agent welcome-send compliance >80%, (b) client app activation rate >70%, (c) thumbs-up response rate to first Linq line response >60%.

*End of document.*

