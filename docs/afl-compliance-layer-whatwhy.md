# AFL Compliance Layer — Opt-Out Suppression + Consent Logging

**Scope of this doc:** the *what* and the *why* — the decisions, the reasons behind them, the behaviors the system must end up with, and the consent copy to ship. It deliberately does **not** prescribe file locations, data schemas, or implementation mechanics. Decide those against the live codebase and its existing conventions.

**Constant constraint:** additive application-layer work, no architecture change. Don't redesign the approach below — these are settled decisions from a strategy review, several of which you would not arrive at independently.

---

## Why this exists

AFL sends all outbound on a single shared messaging line across every agent. That's a locked, deliberate decision (dedicated per-agent lines are cost-prohibitive). Everything below works *with* that constraint, not against it.

The shared line is legally fine on one condition: when a recipient says stop, AFL stops — everywhere, for every agent, on every lane, permanently. Today it can't guarantee that. There's no deterministic opt-out detection, no suppression record, and no audit trail; the only "stop" handling is an AI prompt being asked to disengage, which doesn't carry across lanes or agents and disappears the moment a conversation hands off.

What the carrier does and doesn't cover: on SMS, carriers auto-enforce standard STOP keywords at the gateway, and because every agent shares one number, that block covers all agents for that handset automatically. But the carrier does not catch natural-language opt-outs ("please stop texting me"), gives you no record you can produce later, and intercepts the keyword upstream so AFL never logs it. Over richer channels there's no carrier keyword enforcement at all.

So this layer's durable purpose: catch the opt-outs the carrier misses, keep AFL's own provable consent/opt-out record, and guarantee that once anyone opts out the automation stops queuing them — regardless of channel, agent, or lane.

Why it's urgent rather than nice-to-have: ignoring an opt-out is the single most expensive and most obvious violation in messaging law, assessed per message. On a shared line the failure compounds — the same number that told one agent to stop gets hit days later by another agent from the identical number, which is the textbook willful version of the violation and the fastest way to get the one shared line throttled for everyone at once.

---

## Guardrails (and why)

- **Don't change the single shared line.** It's a cost decision, already made.
- **Don't add an opt-in gate to the retention/conservation lane.** Reaching a lapsing client who never activated the app is intentional — those messages must land. Their legal basis is the existing agent–client business relationship, not app-captured consent. This layer adds opt-out suppression *on top of* that lane; it doesn't change who the lane contacts.
- **Don't change lane routing, cadences, the welcome flow, or the referral flow.** This work is suppression + logging only.
- **Push is out of scope.** Push is a separately granted, separately revocable OS permission. A STOP governs the messaging line, not push. (See open decisions if you want to revisit.)
- **Preserve existing behavior while adding to it.** Don't remove or repurpose existing fields/states as a side effect; add alongside.

---

## Feature 1 — Opt-out suppression

**The core behavior:** no outbound message reaches a number that has opted out. This must hold for *every* path that can send — automated lanes and manual agent sends alike. A suppression check that even one send path can bypass provides no protection; the practical prerequisite is that all outbound converge on a single enforcement point before the check is added. If outbound is currently scattered across independent send paths, consolidating them is part of this work.

**Detection scope — SMS/MMS.** The formal opt-out keyword convention (and its expected confirmation reply) lives on SMS/MMS; that's where opt-out keywords arrive, so that's where deterministic detection runs. (Over richer channels, opt-out intent currently falls to the AI lane's own disengagement — a known limitation noted under open decisions.)

**Suppression scope — the whole number, every channel, every agent, every lane.** Once a number opts out, it's suppressed globally:

- *All channels, not just the one the stop arrived on.* AFL does not choose the channel at send time — the platform does, and it falls back between channels based on the recipient's device. A number kept "blocked here but open there" would still get reached the instant the platform falls back. You can't reliably hold a number half-open, so suppression covers the number outright.
- *All agents and all lanes.* A stop to one agent suppresses the number for every agent. This intentionally over-suppresses, and over-suppression is the safe direction — it matches how the carrier already treats the shared number, and under-suppression is the actual violation. This is the correct cost of the shared-line model.

**Identity consistency.** Opt-out and outbound must be matched on the same normalized phone identity. If a stop from a number and a later send to the same number don't resolve to the same key, the gate silently fails — so phone normalization has to be consistent everywhere suppression is checked or written.

**Manual sends.** An agent manually messaging a suppressed number should not sail through silently. Surface a blocking warning that the number opted out, and require a deliberate, recorded override to proceed. Don't hard-block it outright — but make it a conscious, logged act, not an accident.

---

## Feature 2 — Inbound opt-out / resubscribe handling

Deterministic handling of inbound SMS/MMS, evaluated before anything routes to an AI lane, and authoritative over the AI's own prompt-level handling.

- **Standard opt-out keywords** (STOP, CANCEL, UNSUBSCRIBE, QUIT, END, and the usual set), matched as the whole message — so "stop by Tuesday" doesn't trigger.
- **Natural-language opt-outs** ("leave me alone," "stop texting me," "take me off this," "remove me"). These are the ones the carrier never catches, and they're the real reason this layer earns its keep. Loose matching is acceptable here because erring toward suppression is safe.
- **Resubscribe** (START, UNSTOP, RESUME) reactivates the number and is recorded as a fresh opt-in. **"Yes" is not a resubscribe** — in a conversational thread "yes" answers the AI's question, not a request to be re-added.
- **Help** requests get one identity/help reply.
- **One confirmation, then silence.** When this layer (not the carrier) catches the opt-out, send a single gracious "you're unsubscribed, reply START to resume" — never a loop.
- **Detection overrides the AI.** On any clear keyword or phrase match: suppress, log, confirm, halt — do not pass the message to the AI lane. The AI's existing soft disengagement stays only as a backstop for genuinely ambiguous wording.
- **An already-opted-out number that messages back** (in anything other than a resubscribe keyword) should not be auto-re-enrolled into automation. Route it to the owning agent as a human task to decide whether to re-engage. Someone changing their mind in natural language is a human judgment call, not an automated one.

---

## Feature 3 — Consent + contact-basis record

AFL needs its own record of consent and opt-out events — the artifact you produce if anyone ever claims you contacted them without basis or didn't stop. Today the only "proof" lives in the messaging platform's chat history, which is a third party's data.

**It must be append-only.** This is evidence; evidence you can quietly edit or delete is worth nothing. Write events, never mutate them.

**Capture an opt-in at each genuine raise-the-hand moment:**
- Welcome activation (client taps Activate and messages the line first), recording the exact consent wording they were shown.
- A referred prospect's first reply.
- A beneficiary's first reply.

**Capture a contact-basis event on the conservation lane.** That lane has no opt-in — its basis is the existing business relationship. On the first cold touch to a never-activated client, record *why* the contact was lawful (the relationship, the underlying policy, the agent). This is your most-scrutinized lane, so it's the one that most needs a "here's the basis" trail even though there's no opt-in.

**Record every opt-out, resubscribe, manual override, and suppressed-send-skip** as its own event.

---

## Activate consent copy (ship verbatim)

**Screen microcopy** — shown with the Activate button; this exact wording is what gets recorded as the consent the client agreed to:

> By tapping **Activate**, you agree to receive account, policy, and service text messages — including automated messages — from **{Agent Name}** at this number. Msg & data rates may apply. Message frequency varies. Reply **STOP** to opt out, **HELP** for help. See [Terms]({terms_url}) & [Privacy]({privacy_url}).

**Pre-filled activation message** — the text the client sends to the line on tap. Keep whatever code/token format the activation step already expects; wrap this around it. Do **not** put the words STOP or HELP in here (it would false-trigger opt-out detection):

> Activate my account — code {CODE}. Yes, I'd like to receive policy updates, reminders, and service texts from {Agent First Name}.

Why this wording: "including automated messages" discloses automation without naming AI and without denying it — neutral and forward-compatible with the later AI-disclosure work. The pre-filled message is the strongest opt-in artifact you can have (it's the client's own outbound, in their words); the screen carries the full disclosure (rates, frequency, opt-out, help, terms).

---

## Done looks like

- No automated send reaches an opted-out number on any channel, from any agent, on any lane.
- A standard keyword or a natural-language opt-out on SMS/MMS suppresses the number and is recorded.
- An opt-out to one agent blocks every other agent's later outreach to that number.
- A manual send to a suppressed number warns the agent and requires a logged override.
- Every opt-out, opt-in, resubscribe, override, and business-relationship contact-basis is provable from AFL's own data — no subpoena of the messaging platform required.
- START resubscribes; "yes" does not.
- A duplicate stop doesn't error or create conflicting state.
- Nothing about lane routing, cadences, the welcome/referral flows, or the single shared line has changed.

---

## Decisions locked

- Detection on SMS/MMS; suppression all-channel, global per number across agents and lanes.
- Push is not governed by a STOP.
- The Activate consent copy above ships as written.
- The consent record is append-only.

## Open / your call

- **Channel control:** if the messaging platform turns out to allow forcing a single channel per send with no fallback, all-channel suppression could in theory be revisited — but it's still the recommended default regardless, so this doesn't block anything.
- **Detection on richer channels:** today a literal opt-out typed over a non-SMS channel falls to the AI's disengagement rather than deterministic detection. Closing that seam (detect intent on every channel, while keeping the formal keyword/confirmation protocol SMS-only) is a reasonable later refinement.
- **Strict states:** a few states (Florida especially) don't honor the existing-relationship basis the way the federal rule does. Worth a specialist's review of the conservation lane — out of scope here.

## Out of scope (later)

- AI-disclosure handling / revisiting the "don't reveal you're AI" instruction.
- Deterministic agent-signature + license/credential info on outbound.
- Any messaging-provider abstraction.
- Volume-tier throttling.
