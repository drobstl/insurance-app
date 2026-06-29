# Messaging Provider Architecture — Decision Record (June 2026)

> **Status: PARKED (Jun 29 2026).** Daniel parked the custom/virtual-numbers
> build — status quo stays "agents dial/text from their own phone," revisit
> at scale. This record is **not** being implemented now; it stands as the
> contract for whenever the work picks back up. The shipped Close Sale
> welcome path (device `sms:` + Copy/QR, PR #239) is unaffected and remains
> the welcome mechanism.

## Purpose

Multiple parallel sessions are converging on the same surface — sending
SMS/iMessage on behalf of an agent from a number that isn't the agent's
own phone:

- **"Custom phone numbers for leads"** + **"Funnel texting number
  flexibility"** — let an agent bring their own Twilio number (or rent an
  area-code-matched virtual number) for **lead outreach**, and send from it.
- **Close Sale "step 2" follow-up (#3)** — an eventual *server-side* send
  of the welcome text / booking confirmation as a backstop when the
  agent's device `sms:` handoff can't deliver.

Nothing in this space has shipped code yet (no Twilio/messaging branch
exists). This record sets the **contract all of these build against** so
we don't end up with two incompatible senders that collide at merge.

This is a coordination doc, not a spec to implement wholesale today.
Build the pieces each session needs **behind this interface**, not around
it.

## Scope

Applies to every code path that originates an outbound message on an
agent's behalf — current and planned:

- Lead outreach / intro texts (per-agent Twilio or rented number)
- Welcome text (Close Sale Card 2 + the queued welcome action item)
- Booking / business-card confirmations
- Referral, conservation, beneficiary, and policy-review lanes (today via
  Linq)

## Background — what already exists

- **`web/lib/linq.ts`** is the only server-side sender today. Its
  `sendOrCreateChat()` / `createChat()` / `sendMessage()` talk to the Linq
  partner API and send from one **shared pooled line**
  (`LINQ_PHONE_NUMBER`). It is iMessage-capable (blue bubble).
- The **compliance gates live *inside* that module**: per-recipient
  suppression (`suppression.ts`), the reactivation fence
  (`reactivation-fence.ts`), and the `LINQ_OUTBOUND_DISABLED` kill switch.
  See `docs/afl-compliance-layer-whatwhy.md` and
  `docs/linq-messaging-safety-policy.md`.
- The **welcome text and booking confirmation are deliberately NOT in
  that path** — they fire from the **agent's own device** via an `sms:`
  URL (plus Copy/QR fallbacks). That preserves the agent's own number and,
  on iPhone, the iMessage blue bubble.
- A prior decision (May 30, "Appointment confirmation" session) **rejected
  moving welcome/confirmation to server-side Twilio** specifically because
  Twilio is SMS-only and **kills the iMessage blue-bubble render**.

## Decisions

### 1) One provider-agnostic interface; Linq and Twilio are implementations

There is exactly **one** outbound-send abstraction. New providers
(Twilio, Telnyx, Bandwidth) implement it; callers never import a
provider module directly.

Model the interface on the **existing `sendOrCreateChat` surface** so the
Linq path is a near-drop-in adapter and nothing has to be rewritten:

```ts
// shape, not final code — mirror lib/linq.ts's option bag
interface OutboundMessage {
  to: string | string[];
  text: string;
  mediaUrls?: string[];
  attachmentIds?: string[];
  idempotencyKey?: string;
  suppressionLane: ConsentLane;
  suppressionAgentId?: string | null;
}

interface MessagingProvider {
  sendOrCreate(msg: OutboundMessage, from: SenderIdentity): Promise<SendResult>;
}
```

Owner: the **"Funnel texting number flexibility"** session (the one
actually building Twilio sending) owns this abstraction. Everyone else
**consumes** it.

### 2) Compliance gates move UP to the abstraction — not per provider

Suppression, the reactivation fence, and the kill switch are
**provider-agnostic** and currently baked into `linq.ts`. They must be
enforced at the abstraction boundary so **every** provider — including an
agent's own Twilio number — is gated.

This is the single easiest thing to get wrong. An agent's Twilio number
texting someone who replied STOP is a TCPA problem regardless of who owns
the number. Lift the gates to the interface; have each adapter assume the
caller already gated (same `skipSuppression` contract Linq uses
internally).

### 3) Routing policy — message type chooses the path, not the other way around

These are **different problems** and must not be collapsed into "send
everything through Twilio":

| Message type | Primary path | Why |
| --- | --- | --- |
| **Lead outreach / intro** | Agent's Twilio (or rented area-code-matched number) | Cold first contact; local presence lifts pickup; agent owns the number's reputation. |
| **Welcome / confirmation** | Agent device `sms:` → Linq (blue-bubble) → agent Twilio (green-bubble) **last** | Client is live on the phone; blue bubble + the agent's own identity carry the moment. Twilio is a downgrade here, acceptable only as a last-resort fallback. |
| **Referral / conservation / beneficiary** | Linq (unchanged) | Already live and gated; no reason to move. |

**Blue-bubble rule:** never silently replace an iMessage-capable path
(device iMessage, or Linq) with Twilio SMS for welcome/confirmation. If an
agent has no blue-bubble path, their Twilio number is the explicit,
labeled fallback — not a transparent swap.

### 4) Per-agent sender identity + credential storage

"Bring your own Twilio" needs somewhere to hold each agent's
credentials/number and a resolver that answers "what does THIS agent send
from?":

- Per-agent: connected Twilio (SID / token / from-number), or a
  platform-rented number, or none.
- A `resolveSenderIdentity(agentId, messageType)` that returns the chosen
  provider + from-identity per the routing table above, falling back
  cleanly (Linq pool → device path) when the agent has nothing connected.
- Store secrets server-side only; never ship Twilio tokens to the client.

### 5) The Close Sale #3 follow-up does NOT build its own sender

When server-side welcome send is wanted, it **consumes** this abstraction
(`messageType: 'welcome'`, which the routing table already steers to the
blue-bubble-preferring path). It must not add a parallel Twilio/Linq call.
Until the abstraction lands, the shipped device `sms:` + Copy + QR
fallback (PR for `fix/close-sale-welcome-fallback`) is the welcome path.

## Open questions (owners to resolve, not blocking this contract)

- A2P 10DLC / carrier registration posture for agent-owned Twilio numbers
  (who registers, who's liable).
- Whether platform-rented area-code-matched numbers are a paid add-on or
  bundled by tier.
- Inbound handling for Twilio numbers (replies, STOP) — must feed the same
  suppression ledger Linq inbound does.

## TL;DR for the other sessions

1. Build Twilio **behind one interface** modeled on `sendOrCreateChat` —
   not a standalone `twilio.ts` the welcome path calls directly.
2. **Lift the compliance gates** out of `linq.ts` to that interface so
   they wrap Twilio too.
3. **Route by message type:** Twilio for lead outreach; keep
   welcome/confirmation on the blue-bubble path with Twilio only as a
   labeled last-resort fallback.
4. The Close Sale welcome **consumes** this later — it won't build a
   competing sender.
