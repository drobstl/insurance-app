# AFL Phase 1 Planning Notes — 2026-05-04

**Prepared for:** Daniel Roberts, Brainstorm Labs LLC
**Companion to:** `AFL_Strategy_Decisions_2026-05-04.md`, `AFL_Messaging_Operating_Model_v3.1.md`, `AFL_Pricing_Packaging_Playbook_v3.md`
**Purpose:** Capture decisions made during the May 4, 2026 Phase 1 scoping conversation that are not yet in the strategy doc, list open product questions that need answers before implementation, and hand off cleanly to a Cursor session focused on producing a Phase 1 implementation plan.
**Status:** Working notes. The Cursor session that consumes this doc should produce a Phase 1 implementation plan as a new doc, not write code.

---

## Decisions made in the May 4 scoping conversation

These extend `AFL_Strategy_Decisions_2026-05-04.md` and should be folded into the canonical strategy doc once Phase 1 is fully scoped.

### 1. Welcome flow Step 1 is mobile-only on the agent side

The "Send from my phone" button only exists on the mobile dashboard. On desktop, the dashboard surfaces the welcome queue (so an agent at their workstation can see what's pending) but does not provide a send action. The desktop view shows a state like "ready to send — open AFL on your phone."

**Rationale:** The `sms:` URL scheme behaves differently across desktop OS + phone combinations. iPhone-paired Mac handles it cleanly via Continuity, but Mac+Android, Windows-without-Phone-Link, and Chromebook fail silently or partially. Locking the welcome send to the agent's phone standardizes the workflow, eliminates a 10–20% silent-failure surface, and forces every welcome to come from a phone where iMessage/SMS is guaranteed to work.

**Divergence from v3.1:** v3.1 §9.3 recommended mobile-first with desktop fallback. This decision tightens to mobile-only. Desktop fallback is not built.

### 2. Agent PWA install + Web Push are Phase 1 onboarding requirements

Because the welcome send is mobile-only, every agent must have AFL installed to their phone home screen (PWA) and have agent-side Web Push notifications enabled. Without these, the welcome flow does not work — the agent has no way to be notified that a new client needs a welcome, and no fast surface to send it from.

This becomes a hard onboarding gate, not a "nice to have." A new agent cannot complete Phase 1 onboarding without (a) installing the PWA on their phone and (b) granting Web Push permission. The existing milestone-driven onboarding flow (added April 26, 2026) needs to be extended with these two milestones.

### 3. Three implications of mobile-only welcome that the build must account for

- **Desktop dashboard policy-reviews / clients page needs a "send welcome" indicator that is visibly read-only on desktop and tells the agent to grab their phone.** Not a broken button, not a button that does nothing — an explicit "Open on your phone to send" affordance.

- **PWA install is a real moment in agent onboarding, not an afterthought.** The onboarding flow needs a step that walks the agent through installing the PWA on their phone, including iOS-specific Add to Home Screen instructions and Android-specific install prompt handling.

- **Agent-side Web Push wiring is required.** This is separate from client-side push (which is Expo on the React Native mobile app) and uses different infrastructure. Web Push works on iOS 16.4+ and current Android. The agent gets a push notification on their phone when a new client is queued for welcome.

---

## Open product questions

These need answers before the Cursor session can produce a complete Phase 1 implementation plan. Some have my (Daniel's) gut already; others need real thought. Cursor should surface each one to me individually before assuming an answer.

### Welcome flow

**Q1. What is the trigger for a welcome being "ready to send"?**

Today, a client record exists as soon as PDF auto-extract finishes. The welcome message contains the client's login code, which means the client record needs to exist *and* the code needs to be generated *and* ideally the agent needs to be in a moment where they can tap their phone.

Sub-questions:
- Should the welcome be queued the moment the client record exists, or should there be a hold (e.g., "wait until extraction is fully verified by the agent")?
- Should there be any agent action between PDF upload and welcome-ready state, or is it fully automatic?
- If automatic, what happens if the extraction has errors and the agent corrects them — does the welcome regenerate?

**Q2. What does the welcome queue look like on the agent's phone?**

- Single list, or grouped by some dimension (date created, urgency, etc.)?
- How long does an unsent welcome stay queued before it expires or escalates?
- Can the agent dismiss/skip a welcome (i.e., choose not to send for a specific client)? If yes, what happens to that client — do they get an email fallback? Per v3.1 §4.1, "If no agent send within 7 days, platform sends an email introduction with app link as fallback." Does that hold here?
- What's the visual treatment for a welcome that's been sitting unsent for 1 day vs. 5 days vs. 7 days?

**Q3. What does the in-app Activate screen on the client's phone look like?**

v3.1 §3.3 has recommended copy. Open implementation questions:
- Does the activation screen appear immediately after first login, or does the client see the main app first and then a prompt?
- Is the Activate button gated behind notification permission (i.e., does the client have to grant push permission before they can tap Activate)? Or is notification permission asked separately?
- What happens if the client denies push permission? They've already activated — do they get an email-fallback story for anniversary? (Per Strategy §1, no — anniversary is push-only with no fallback. So this client just doesn't get anniversary outreach.)
- What does the screen look like *after* the client taps Activate? Does it return them to the main app, show a confirmation, surface the agent's vCard for saving?

**Q4. What is the Linq line's first response copy, exactly?**

v3.1 §3.3 has recommended copy:
> Hey [Client]! You're all set. I'll reach out here when it's time for your annual review or if anything important comes up with your policy. Save my contact so you'll always know it's me — and shoot back a thumbs up so I know we're connected. Carriers sometimes block messages and that's how I'll know you're getting them. Talk soon! [vCard attached]

Open implementation questions:
- Is this copy locked, or do we want to test variations?
- Is the vCard sent as MMS attachment in the same message, or as a separate immediate follow-up?
- What happens if the carrier downgrades the MMS and the vCard doesn't deliver? Is there a retry?
- If the client doesn't reply with a thumbs-up within X hours, do we do anything? (Probably no — per v3.1 §3.4 the thumbs-up is a deliberate ask, not a hard requirement.)

**Q5. vCard generation — when does it run?**

- On agent profile photo upload (regenerate vCard derivative)?
- On agent profile creation (initial generation)?
- On every Linq line first-response send (regenerate from current photo every time)?
- Cached and regenerated only when name or photo changes?

v3.1 §9.7 says "regenerated when the agent's name or photo changes." That's the right answer. The implementation question is where the trigger lives — Cloud Function on agent doc write? Inline at first-response send time with caching?

### Pricing

**Q6. How do the founding 34 migrate to the new pricing structure?**

The strategy doc says they're grandfathered at Growth-equivalent (75 conversations/month, 8/day cap, free for life, full-price overage). But:
- Today they're on legacy free or `$25/$35/$49` Stripe products. They need to land on the new internal-flag founding tier without disruption.
- Do they get notified of the change? If yes, what does that communication say?
- Do they see anything different in their agent dashboard after migration (e.g., a "founding member" badge, a conversation count widget)?
- What happens to any in-flight Stripe subscriptions on the legacy products? Do they get canceled, refunded, or migrated?

**Q7. When does the new pricing go live for new signups?**

- The strategy doc says Phase 3 (months 5–6 in v3.1's phasing). But the strategy doc also moves things around. What's the actual cutover date?
- Do new signups during Phase 1 (next 6 weeks) land on the legacy tiers and get migrated later, or do they land on the new tiers immediately?
- Is there a soft-launch / private-beta approach where the new tiers go live for a small cohort first?

**Q8. What is the Closr AI bundle pricing decision?**

Strategy doc explicitly defers this. But: any Phase 1 work that touches billing or pricing surfaces in code needs to know whether Closr AI bundle pricing is going to land in Phase 2, Phase 3, or later. If it's Phase 2, the Stripe products and conversation counter design need to anticipate it. If it's Phase 5+, we can build for AFL standalone only and refactor later.

### Cross-cutting

**Q9. Are we retiring the old Linq welcome path entirely, or running both in parallel for a transition period?**

v3.1 implies a clean cutover. But: the founding 34 may have specific expectations or workflows tied to the current Linq-based welcome. Three options:
- **Hard cutover:** ship the new welcome flow, retire the old, all agents move at once.
- **Per-agent flag:** `WELCOME_FLOW_V2_ENABLED` on the agent doc, default true for new signups, opt-in for the founding 34, full migration over a 30-day window.
- **Parallel period:** both paths work for 30 days, with telemetry comparing them, then the old path retires.

The hard cutover is cleanest but riskiest. The flag is most flexible but adds code surface area that has to be cleaned up later. Recommendation needed.

**Q10. What is the priority order for Phase 1 sub-tasks?**

The welcome flow has at least 6 distinct sub-builds that can ship somewhat independently:
- vCard generation pipeline (server-side)
- Agent dashboard "Send from my phone" button (mobile only)
- Agent dashboard welcome queue UI (desktop + mobile)
- In-app Activate button + activation screen (mobile React Native)
- Linq webhook handler for activation inbound + auto-response with vCard
- Push permission lifecycle management

The pricing rollout has its own sub-tasks:
- Conversation counter (per-agent monthly bucket, Firestore + increment paths)
- Stripe product migration (4 new products + retire legacy)
- Pricing page rebuild
- Founding 34 migration

Question: in what order do these ship, given that the welcome flow is the strategic anchor and the pricing rollout depends partly on the welcome flow defining what counts as a "conversation"?

---

## Source-of-truth pointers (for the Cursor session)

- `docs/AFL_Strategy_Decisions_2026-05-04.md` — canonical decisions log; supersedes v3.1 / v3 where they conflict
- `docs/AFL_Messaging_Operating_Model_v3.1.md` — full messaging operating model spec
- `docs/AFL_Pricing_Packaging_Playbook_v3.md` — full pricing playbook
- `CONTEXT.md` — codebase + decisions state
- `docs/linq-scale-playbook.md`, `docs/linq-messaging-safety-policy.md`, `docs/linq-decision-record-2026-05.md` — supporting Linq references (superseded as primary source of truth by v3.1, retained for context)

## Code surfaces relevant to Phase 1

The Cursor session that produces the implementation plan should investigate at minimum:

- `web/app/dashboard/clients/page.tsx` — current welcome flow trigger and PDF upload surface
- `web/app/dashboard/policy-reviews/page.tsx` — for context on agent-facing dashboard patterns
- Any existing welcome-send routes under `web/app/api/welcome/*` and `web/app/api/referral/first-message/route.ts`
- Welcome message template files (search for "welcome" in `web/lib/`)
- `web/lib/linq.ts` — current Linq client; the vCard-MMS path needs to land here
- `web/app/api/linq/webhook/route.ts` — needs a new handler for activation inbound messages
- `mobile/app/_layout.tsx` and `mobile/app/index.tsx` — current login + push registration flow
- `mobile/app/` — needs a new activation screen
- `web/lib/firebase-admin.ts` and the agent profile photo upload path — vCard regeneration trigger
- `web/lib/stripe.ts` and `web/app/api/webhooks/stripe/route.ts` — Stripe wiring for new products
- `web/app/pricing/page.tsx` (if exists) or the marketing-side pricing page — needs rebuild
- `web/components/OnboardingOverlay.tsx` and the milestone-driven onboarding state — PWA install + Web Push milestones

## What the Cursor session should produce

A new doc at `docs/AFL_Phase_1_Implementation_Plan_2026-05-04.md` containing:

- **Answers** to Q1–Q10 (above) where the answer is determinable from code or specs, or **explicit surfacing** to me (Daniel) where the answer needs a product decision
- **Sub-task breakdown** for the welcome flow (4–6 sub-tasks) and pricing rollout (3–4 sub-tasks), each scoped enough to be a single Cursor session
- **Sequencing** — which sub-tasks depend on which, and what order they should ship in
- **Risk and unknowns log** — anything the spec or strategy doc didn't anticipate, or anywhere the existing code makes a decision harder than expected
- **Prerequisites** — anything that needs to happen *before* Phase 1 implementation can start (e.g., Stripe sandbox setup, ops conversations with Linq, founding-cohort communication)

The Cursor session should NOT write code. The output is the markdown plan, surfaced product questions, and nothing else.

## What the Cursor session should NOT do

- No code edits.
- No commits.
- No assumptions about open product questions — surface them to me.
- No re-litigation of decisions already made in `AFL_Strategy_Decisions_2026-05-04.md` or in §1–§3 of this doc. Those are locked.
- No working around existing code structure silently if it conflicts with the spec — flag it explicitly so I can decide whether to refactor or adapt the spec.

*End of Phase 1 planning notes.*
