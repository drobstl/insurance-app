# AFL Welcome Flow Amendment — 2026-05-07

**Prepared for:** Daniel Roberts, Brainstorm Labs LLC
**Companion to:** `docs/AFL_Strategy_Decisions_2026-05-04.md`, `docs/AFL_Phase_1_Planning_Notes_2026-05-04.md`, `docs/AFL_Messaging_Operating_Model_v3.1.md`, `CONTEXT.md`
**Purpose:** Correct a fundamental misunderstanding in the May 4 locked decisions about WHEN and HOW the welcome flow runs. The May 4 framing — "Welcome Step 1 is mobile-only on the agent side," "PWA install + Web Push as HARD onboarding gates," "no desktop send fallback" — was derived from a mental model that treated the welcome flow as ASYNCHRONOUS. The actual primary workflow is REAL-TIME and synchronous: the agent creates the client profile, sends the welcome, and walks the client through activation in one continuous session while the client is on a live phone call. This amendment revises the locked decisions accordingly.
**Status:** Locked. Reflects the May 7, 2026 mid-day clarification conversation. When this document conflicts with the May 4 locked decisions or v3.1 §3.3 / §9.3, this document wins.

---

## 1. The clarified primary use case (Mode 1: real-time, synchronous)

The new-client onboarding flow runs in real time during a single live phone call between the agent and the new client. Specifically:

1. Agent closes the sale on a phone call with the new client.
2. **While the client is still on the phone**, the agent (at their workstation):
   - Uploads the PDF application
   - Extraction runs, profile is created
   - Sends the welcome text from their personal phone number using the `sms:` URL scheme on whichever device they have iMessage / SMS access on
   - Walks the client through downloading AFL, entering their code, and tapping Activate — verbalizing each step on the live call
3. Total elapsed time: approximately 60–120 seconds, all during the same call.

The agent's "primary working device" varies:

- **Mac with iPhone (iMessage Continuity):** the dominant configuration in the insurance/professional services demographic. `sms:` URL on macOS Safari/Chrome opens iMessage on Mac with the pre-filled body, sent via Continuity through the iPhone. Works perfectly.
- **Windows with Phone Link to Android:** `sms:` URL opens Phone Link, relays to the paired Android.
- **Mobile (any browser, PWA optional):** `sms:` URL opens native Messages with pre-filled body.
- **Other (Mac+Android, Linux, Chromebook, Windows without Phone Link):** `sms:` URL fails or prompts for default-app association. These agents use a copy-paste fallback (copy welcome text → manually paste into Messages on phone).

The architecture must accommodate all of these without forcing any particular setup.

**Implication:** the primary welcome flow is not async, not multi-step, not cross-device-orchestrated. It is one inline action on the agent's primary device, executed in the moment.

## 2. The asynchronous use case (Mode 2: bulk import, once per agent lifetime)

The other temporal pattern for the welcome flow is the **Onboarding Ceremony bulk import** (v3.1 §4.7 Path 1, §7). When a new agent joins AFL with an existing book of clients, they drip-release welcomes over ~14 days at ≤15 sends/day. These sends are NOT real-time — the agent is not on a live call with each client. They work through the daily batch when convenient.

Properties of Mode 2:
- High-volume during the 14-day window (15/day × 14 days = ~210 welcomes for a 200-client book)
- Async — agent works through batch between calls, at lunch, in the evening
- Done ONCE per agent lifetime (never recurring after the initial book is onboarded)
- Currently disabled in the UI per the May 3, 2026 update (the Bulk Import CTA in `web/app/dashboard/clients/page.tsx` is struck through with "Currently under construction")

**Mode 2 IS where the action items queue, push notifications, and PWA install pay off.** Agent gets a notification when their daily batch is ready, taps over to AFL on whatever device they have handy, works through 5–15 items, done.

## 3. What was wrong with the May 4 locked decisions

The May 4 strategy decisions and Phase 1 implementation constraints assumed all welcome flow was async. Specifically:

- **"Welcome Step 1 is mobile-only on the agent side"** assumed the agent might not be at their workstation when the welcome needed to go out, so we forced the send through the phone. In reality, in Mode 1 the agent IS at their workstation — they're closing the sale from their workstation, on a call.
- **"PWA install + Web Push are Phase 1 hard onboarding gates"** assumed the agent needed to be NOTIFIED that a welcome was queued, so they needed an installed app and push permission. In reality, in Mode 1 the agent doesn't need to be notified — they just queued the welcome themselves 30 seconds ago and are about to send it.
- **"No desktop send fallback is built"** ruled out desktop send because some desktop+phone combos fail (Mac+Android, Linux, Chromebook, Windows without Phone Link). This optimized for the worst case at the cost of the best case (Mac+iPhone with iMessage Continuity, which is a large percentage of the agent demographic and works perfectly).
- **The 7-step onboarding overlay** that gates the dashboard until PWA + Push are completed assumed agents needed a tutorial about a new asynchronous workflow. In reality, Mode 1 agents need a 90-second inline send button at the right moment.

The May 4 architecture is not WRONG — it correctly handles Mode 2 (bulk import) and the rare exception-recovery agent action items in Phase 2 lanes. But it was applied as the PRIMARY surface for ALL welcome flow when it should have been the SECONDARY surface, used only for Mode 2 (and Phase 2 exception paths).

## 4. Architectural revisions (override the May 4 locked decisions)

### 4.1 Primary welcome surface: inline at client-creation time
**Revises:** "Welcome Step 1 is mobile-only on the agent side" (Phase 1 Planning Notes §1)

The welcome compose UI surfaces inline immediately after client profile creation in the dashboard add-client flow. Single screen with:
- Pre-filled welcome message (locked v3.1 §3.3 copy with personalized name, login code, app download link)
- A primary "Send via iMessage" button that fires the `sms:` URL scheme on whatever device the agent is on
- A "Copy welcome text" fallback for unsupported device combinations
- An optional "Skip — send later" that defers to the action items queue (Mode 2 surface)

The Send button's behavior depends on the agent's primary device:
- **Mac with iPhone Continuity:** iMessage opens with pre-filled body. Agent sends. Routes through their iPhone via Continuity.
- **Windows with Phone Link to Android:** Messages relays via the paired phone.
- **Mobile (any browser, PWA optional):** native Messages opens with pre-filled body.
- **Mac with Android, Linux, Chromebook, Windows without Phone Link:** the Send button is replaced with the "Copy welcome text" fallback. Agent copies, opens Messages on their phone manually, pastes, sends.

### 4.2 PWA install + Web Push: deferred to Mode 2 (bulk import)
**Revises:** "Agent PWA install + Web Push are Phase 1 onboarding requirements" / "These are HARD onboarding gates" (Phase 1 Planning Notes §2)

PWA install and Web Push permission are NOT required for the Mode 1 daily real-time welcome flow. They become required at the moment an agent initiates Mode 2 (bulk import), at which point the bulk import setup wizard requires both before drip release begins.

Justification: the Mode 1 flow doesn't need notifications (agent already knows; they just queued the welcome) and doesn't need a phone install (Mac+iPhone Continuity works for the desktop send path; mobile native Messages works for phone agents). Mode 2 genuinely needs both because the agent is working through a multi-day backlog from wherever they are throughout the day.

Bulk import is currently disabled in the UI (May 3, 2026 update); PWA + Push will become required at the moment the bulk import surface is re-enabled in Phase 2.

The dashboard surfaces an opt-in upsell at any time: "Install AFL to your home screen and enable notifications for faster phone access." Not blocking. Not gating onboarding.

### 4.3 Onboarding overlay: drop the install + push hard gates
**Revises:** the 7-step OnboardingOverlay added in Phase 1 Track B; Daniel's locked May 6 decision to enforce existing-agent re-onboarding for the new milestones

The OnboardingOverlay returns to its pre-Track-B shape: profile completion, first client created, first welcome sent, first Patch prompt. The `pwaInstalled` and `webPushGranted` milestones move from REQUIRED to OPTIONAL — they remain in the Firestore schema and are tracked when the agent completes them, but they no longer block `onboardingComplete`.

For the cohort relaunch and any existing agents with `onboardingComplete = true` from before Track B: NOT force-prompted to redo onboarding. They land back on a familiar dashboard with the new inline welcome compose UI in the create-client flow. The May 6 layout.tsx gating logic that forced the overlay re-show for missing-new-gates is reverted.

### 4.4 Action items collection: audit + edge-case recovery, NOT the primary welcome surface
**Revises:** the Track B "agent action item surface" implementation framing

The `actionItems` Firestore collection and the `/dashboard/welcomes` queue surface remain in place but are demoted from "primary agent surface" to "audit trail + edge-case recovery + Mode 2 working surface." Specifically:
- Every welcome (sent inline OR sent via queue OR expired) writes a record to `actionItems` for audit
- The `/dashboard/welcomes` page becomes the "did I send all my welcomes today?" review surface, the recovery path for interrupted Mode 1 flows, AND the working surface for Mode 2 bulk import (when re-enabled in Phase 2)
- An action item that's already been completed via the inline send surface shows as `completed` in the queue with the correct `completionAction` and `completedAt` — same data path, different UX entry point

### 4.5 Notification path: not required for Mode 1
**New decision (no prior locked decision to revise)**

Mode 1 (real-time welcome) requires NO notification path. Agent already knows there's a welcome to send because they just created the client.

Mode 2 (bulk import, when re-enabled) requires notifications. Web Push to the agent's installed PWA is the right mechanism. Email as a secondary fallback for agents who have Web Push permission denied.

Phase 2 lane action items (anniversary push-failure, retention SMS-stalled, referral 24h-no-reply) are EXCEPTION paths, not routine async work. The agent is most likely already at their dashboard when they encounter them. Email notification is sufficient for the rare cases where the agent is away. Web Push for these is opt-in nice-to-have, not required.

## 5. What stays the same from the May 4 / v3.1 architecture

These pieces are unchanged and continue to apply:

- **Welcome message content** (locked v3.1 §3.3 copy): personal greeting, app download link, login code, "tap Activate" instruction
- **Client-side mobile Activate screen** (Track B, May 6): hard gate between login and the agent profile screen on the React Native client app; composes pre-filled `sms:` outbound to the Linq line on tap
- **Linq webhook welcome-activation handler** (Track B): recognizes the client's activation inbound via byPhone placeholder + clientCode regex match, stamps `clientActivatedAt`, sends vCard MMS reply (subject to `LINQ_OUTBOUND_DISABLED` kill switch), tracks thumbs-up reciprocity
- **vCard generation pipeline** (Track B): server-side per-agent vCard with embedded compressed photo, cached on agent doc, regenerated on name/photo change
- **Push permission lifecycle for clients** (Track A, May 5): unchanged; this is client-side Expo push, separate from any agent-side Web Push consideration
- **The `actionItems` Firestore schema** (Track B): forward-compat across welcome / anniversary / retention / referral lanes; still the audit trail + Mode 2 working surface + Phase 2 exception-recovery surface
- **Linq line operating model** (v3.1 §5, §6): 50/day new conversation cap, KPI tier system, push-only-no-fallback for anniversary / holiday / birthday — none of this changes
- **Phase 2 lane action item architecture** (CONTEXT.md > Channel Rules > Agent action item surface): anniversary action items fire only on push-failure; retention only on SMS-stalled; referral only on 24h-no-reply. These are exception paths, low frequency, NOT routine async agent work
- **Pricing tiers** (v3 + Track C): no changes; the welcome flow architecture is independent of pricing
- **Bulk import as Phase 2 work** (v3.1 §4.7, §7): three paths (Onboarding Ceremony / Hybrid / Concierge), all currently disabled in UI; Mode 2 PWA + Push requirement activates when the bulk import surface re-enables

## 6. Implementation implications

### 6.1 What needs to be built (from the current state, May 7, 2026)

- Inline welcome compose surface in the dashboard add-client flow (replaces the current "Welcome added to your queue / View queue" stage that was added in the Track B cutover commit `99e134f`)
- Platform-aware Send button on the inline compose surface that routes to the correct `sms:` behavior or copy-paste fallback per device combo
- Demote `pwaInstalled` and `webPushGranted` milestones from REQUIRED to OPTIONAL in the OnboardingMilestones schema usage (the schema fields stay; the gating logic relaxes)
- Strip the install + push steps out of the OnboardingOverlay STEPS array (or hide them behind an opt-in upsell only — needs decision)
- Revert the dashboard layout's onboarding gating to no longer force-show the overlay for existing agents missing the new milestones (revert the May 6 `missingNewHardGate` logic)
- Update the cohort communication to remove the "install AFL on your phone" requirement framing

### 6.2 What can be removed or made dormant from the current state

- The `pwaInstalled` and `webPushGranted` HARD gate enforcement in `dashboard/layout.tsx` (Daniel's locked May 6 decision to enforce them on existing agents) — REVERT
- The "Switch back to your laptop" / "Now grab your phone" device-transition cards in `PlatformInstructions.tsx` — REMOVE (no longer relevant; agent isn't transitioning devices in Mode 1)
- The "Install AFL on your phone" + "Allow notifications on your phone" steps in OnboardingOverlay STEPS array — REMOVE (or demote to opt-in upsell, not in the main flow)
- The PWA service worker, manifest, web-push lifecycle infrastructure stay in the codebase but are no longer required for any agent
- The Loom videos for "how to install AFL on iPhone" / "how to install AFL on Android" are no longer urgent for the May 12 relaunch (they become useful when bulk import is re-enabled in Phase 2)

### 6.3 What this means for the May 12 maintenance window

- The maintenance window can probably be SHORTER because there's less new behavior for agents to learn (no PWA install required, no push permission required, just a new inline welcome compose surface in the create-client flow)
- The cohort email simplifies dramatically: "We rebuilt the welcome flow. Now when you create a new client, AFL gives you a one-tap Send button that opens iMessage with the welcome pre-filled. No setup needed."
- The "Reset my onboarding (admin)" button purpose narrows — there's less to reset because the install + push gates aren't blocking anything

## 7. Open questions

- For the inline Send UI: when does the action item record get written to Firestore? Two options:
  - Option A: write at "create client" time (current Track B behavior). Action item is created immediately; if agent taps Send, it's marked `completed`; if agent taps Skip, it stays `pending` for the queue.
  - Option B: write at "Send" time. No action item if agent doesn't send. Cleaner audit trail (only welcomes that were actually sent or explicitly queued exist).
  - Recommendation: Option A — captures "client created but no welcome sent" as a queryable state for compliance metrics.
- For the copy-paste fallback: do we mark the action item as `completed` when the agent taps "Copy text"? No way to verify they actually sent the SMS. Recommendation: yes, mark `completed` with `completionAction: 'text_personally'` and an annotation that the send was via copy-paste rather than direct sms:. Trust the agent.
- The Track A push permission lifecycle (client-side, Expo, the iOS notifications path) is unchanged by this amendment — it governs anniversary / holiday / birthday / beneficiary push to clients, all of which remain push-only-no-fallback per the May 4 strategy decisions. Confirmed.

## 8. Decision log entries to capture in CONTEXT.md

When this amendment is folded into `CONTEXT.md` (in the same commit), the following sections need updates:

- `Source-of-Truth Documents`: add this amendment to the precedence list, above v3.1.
- `Channel Rules > The two-step welcome flow > Phase 1 implementation constraints`: mark superseded by this amendment for Mode 1; retain for Mode 2 (bulk import) only.
- `Channel Rules > Agent action item surface`: clarify that the welcome lane's primary surface is now inline-at-create-time; the action item collection serves audit, recovery, and Mode 2 working surface.
- `Phased Roadmap > Phase 1`: revise the Track B status to reflect the partial revision — Track B infrastructure shipped, but the agent-facing primary surface is being rewired to inline-at-create-time per this amendment.
- `Recent fixes`: add a "May 7, 2026: welcome flow architecture amendment — Mode 1 / Mode 2 framing" entry summarizing the change.
- `Open Questions > Phase 1 product questions still open`: close out / archive any questions premised on the asynchronous welcome workflow being primary.

## 9. Summary — five things to remember

1. **The welcome flow has TWO modes**: Mode 1 (real-time daily, primary) and Mode 2 (bulk import, once per agent lifetime, currently disabled in UI).
2. **Mode 1 is inline at create-client time.** No PWA install required, no push notification required. Smart `sms:` routing handles desktop (Mac+iPhone Continuity), mobile (native Messages), and copy-paste fallback for unsupported combos.
3. **Mode 2 keeps the action items queue + PWA install + Web Push** — those become required at the moment the bulk import wizard initiates (Phase 2 work).
4. **The Phase 2 lane action items** (anniversary / retention / referral) are EXCEPTION paths, not routine async work. Surfaced in the dashboard when they fire; agent is most likely already there. Email sufficient for rare notification need; Web Push opt-in.
5. **The OnboardingOverlay reverts to 4 steps** (profile / first client / first welcome / patch). PWA install + Web Push become opt-in upsell, not required milestones. Existing-agent re-onboarding gate from May 6 is reverted.

*End of amendment.*
