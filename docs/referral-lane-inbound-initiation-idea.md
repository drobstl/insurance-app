# Referral Lane Inbound-Initiation — Candidate Idea

**Status:** Candidate idea. Not committed. Not part of any active phase. File preserved so the idea isn't lost as Phase 1–2 ships.

**Source:** May 4, 2026 strategy session conversation (Daniel + Cursor). Captured here because it surfaced organically while reviewing line-health pressure points and shouldn't be re-derived later.

**Decision posture:** Revisit candidate during Phase 2 referral-lane review, particularly once the KPI tier dashboard is operational and per-lane reply-rate data is visible. If referral-lane outbounds emerge as a meaningful contributor to line-health pressure, this idea becomes load-bearing. If they don't, the current pattern is fine.

---

## The problem this addresses

The current referral lane is the only product flow where AFL's Linq line initiates an outbound new conversation cold — that is, without the recipient having texted us first. Per `docs/AFL_Messaging_Operating_Model_v3.1.md` §4.4:

1. Existing client taps Refer in their app → 3-way SMS group thread opens, sent from the referrer's personal phone, with the referrer + the prospect + the agent's Linq line.
2. The Linq line drops into the group thread to thank the referrer.
3. **The Linq line then initiates a separate 1:1 outbound to the prospect** to start the qualifying conversation.

Step 3 is the line-health concern. From the carrier's perspective it's a new outbound conversation from the Linq line to a number that hasn't texted us first. If the prospect doesn't reply, it counts as an unanswered outbound and contributes to the reply:send ratio decay that downgrades line reputation. At scale, this is the single largest non-bulk-import contributor to line-health pressure in the post-Phase-0 product.

Every other lane in AFL avoids this:

- Welcome — client-initiated via the in-app Activate button (`sms:` URL scheme to Linq line).
- Anniversary — push only, no fallback.
- Holiday cards / birthday cards — push only, no fallback.
- Lapse / retention — push first, SMS only as escalation after engagement signal.
- Beneficiary — invite-only, identical client-initiated activation pattern as welcome.

Only referral has AFL initiating an outbound on the Linq line cold, and only referral has an unbounded reply-rate risk because the prospect has no relationship with AFL when the AI's first message arrives.

## The proposed alternative — mirror the welcome flow's mechanism

Instead of the AI initiating the 1:1 with the prospect, restructure the flow so the prospect initiates the Linq-line conversation themselves. The mechanism is structurally identical to the welcome flow's Activate button — a pre-filled `sms:` link that opens the prospect's messages app with the Linq line as recipient.

### Possible flow shapes

**Shape A — Replace the 3-way group entirely with a 1:1 pre-filled tap-to-text intro.**

1. Existing client taps Refer in their app → 1:1 SMS opens from the client's personal phone to the prospect (no Linq line in the thread).
2. The prefilled body includes a warm intro AND a tappable `sms:` link to the Linq line:
   > *"Hey Maria, [Client] here — you should talk to my agent [Agent]. He's the real deal, helps people figure out the life insurance side without the BS. Just text him here: \[tappable sms: link to Linq line, prefilled with 'Hi [Agent], [Client] sent me'\] — takes ten seconds."*
3. Maria reads it, taps the link, her messages app opens with the Linq line as recipient and the body already typed. She sends.
4. Linq line receives an inbound — same pattern as the welcome Activate button.
5. AI on the Linq line responds with the qualifying opener. Single outbound, in response to her inbound.

Result: zero outbound new conversations from the Linq line for this referral. The AI only ever responds, never initiates.

**Shape B — Hybrid: keep the 3-way group, but add the tappable Linq-line link to the AI's first reply in the group thread.**

1. Steps 1–2 unchanged from current flow (3-way group includes Linq line, AI thanks the referrer).
2. Instead of the AI proactively spinning up a 1:1 with the prospect, the AI's group-thread message includes a `sms:` link the prospect can tap to continue privately with the agent's office.
3. Prospect chooses whether to opt into the deeper conversation by tapping the link.
4. If they tap → inbound to Linq line → AI responds 1:1. If they don't tap → no further outbound from AFL.

Result: zero AI-initiated 1:1 outbounds. The 3-way group thread itself still exists (so AFL is technically participating in a group thread on the Linq line, which Linq may or may not count as an outbound new conversation depending on how Linq scores group-thread participation — confirm with operator before betting on Shape B's economics).

## Trade-off, honestly

### What you gain (both shapes)

- The single largest line-health-damaging outbound pattern in the post-Phase-0 product is removed. Reply ratio for the referral lane jumps to ~100% on inbound (every conversation is initiated by an inbound).
- The lane stops contributing to the 50-per-day outbound new-conversation cap, freeing capacity for retention escalations and conversation continuation.
- Stronger consent provenance — same gold-standard "client-initiated inbound" pattern that anchors the welcome flow.

### What you lose

- **Social proof of the 3-way thread (Shape A only).** In the current pattern, the prospect sees their friend visibly introducing them to the agent in a real-time thread — a warmth signal that the agent is real, the friend really endorses them, and the conversation is happening in front of the friend. Shape A drops this to "your friend told you about this person, here's a number." Some prospects won't tap.
- **Top-of-funnel volume.** The current model is "AI texts every prospect, some convert." The proposed model is "only motivated prospects opt in, but conversion rate among those who do is high." Net referral conversions could go up or down depending on the ratio of cold prospects who would have replied to AI outbound vs motivated prospects who would tap a link. Empirical question, not predictable from the spec.
- **AI's ability to qualify the cold prospects who never would have tapped on their own.** Some of those convert in the current model and would not in either proposed shape.

### Whether the trade is worth it depends on data we don't have today

- Current referral-lane reply rate. If it's already strong (say, 40%+ per v3.1 §4.4 cadence target), the line-health pressure from this lane is small and the trade probably isn't worth it.
- Current referral-lane outbound volume per active agent. If it's a large fraction of an agent's monthly Linq outbound, the trade is more valuable.
- Whether a high-quality-low-volume referral pipeline is acceptable to agents. Some top producers may prefer fewer better-qualified leads; others may prefer maximum reach and accept the line-health drag.

The KPI tier dashboard built in Phase 2 should give visibility into the first two questions. The third is a product call that would need agent feedback (especially from the founding cohort).

## Why this is filed as a Phase 2 candidate, not Phase 1 work

- Track B (welcome flow) is already large. Adding a referral-lane redesign would compound discovery and engineering risk.
- The line-health pressure from the referral lane is *theoretical until measured*. Phase 1 doesn't have the visibility to know if it's a top-three problem or a top-twenty problem.
- The current referral lane was deliberately designed in v3.1 §4.4 with the social-opt-in pattern; replacing it requires conscious revisitation, not drive-by inclusion in another track.

## When to revisit

- Phase 2 KPI tier dashboard ships and surfaces per-lane reply rate. If referral-lane reply rate sits below the 25–40% reciprocity target consistently, this idea moves from candidate to active design.
- A line-health incident traces back to referral-lane outbound volume (Tier 1+ event with referral-lane outbound as a primary contributor).
- An agent in the founding cohort raises the friction of cold-prospect AI outreach and asks for a more passive-warm pattern.
- AFL grows past ~70 agents per line and per-agent referral outbound starts to push against the 50/day ceiling on shared lines.

## Cross-references

- `docs/AFL_Messaging_Operating_Model_v3.1.md` §4.4 — current referral lane behavior.
- `docs/AFL_Messaging_Operating_Model_v3.1.md` §3.3 — welcome flow's client-initiated Activate button (the architectural pattern this idea generalizes).
- `docs/AFL_Strategy_Decisions_2026-05-04.md` §1 — push-only-no-fallback rule for anniversary/holiday/birthday lanes (line-health discipline that this idea would extend to referral).
- `CONTEXT.md > Channel Rules > per-lane channel matrix` — current per-lane channel allocation.
- `CONTEXT.md > KPI Tier System` — line-health metrics that would gate the revisit decision.

*End of document.*
