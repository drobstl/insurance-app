# Handoff — May 11, 2026 → Onboarding rebuild

> **For the agent picking this up.** Daniel ran another full sprint May 11 (17 commits + 1 OTA + 1 Firestore index deploy). May 12 relaunch is tomorrow. Today closed out: landing page rebuild + welcome activation bug fix (silent 3-day breakage) + brand voice sweep + Patch global rewrite + subscription card surfacing tier and trial state. You're picking up an **onboarding rebuild** — first-90-seconds problem on the Add Client flow. Read this doc cold and you have what you need.

## Context inheritance

Read in order:

1. `.cursorrules` — load-bearing rules.
2. `CONTEXT.md` — full file. Single source of truth. May 11 sprint block is the bottom-most dated entry.
3. `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` — Mode 1 / Mode 2 framing.
4. `docs/handoffs/HANDOFF_2026-05-10_to_landing_page_rebuild.md` — what May 10 set up + carry-forwards.
5. This doc.
6. `git log --oneline -25` — May 11 commit history is the source of truth for what shipped.
7. Your memory, especially:
   - `feedback_marketing_narrative_frame.md` — agent-business-outcome voice, never platform-mechanics.
   - `feedback_customer_visible_mechanism_is_value.md` — iMessage rendering, branded app, etc. ARE legit value framing, NOT internal ops. Don't over-prune.
   - `feedback_match_scope_to_data.md` — small fix + opt-in to big apparatus.

## What shipped today (May 11, 2026)

17 commits, 1 OTA, 1 Firestore index deploy, all on `origin/main` and Vercel-deployed.

| Commit | What |
|---|---|
| [46e1148](https://github.com/drobstl/insurance-app/commit/46e1148) | Beneficiary intro UI removal — `ClientDetailModal` "Send Beneficiary Intro" buttons + composer drawer + orphaned "Jump in manually" textbox all stripped (Linq-line sender was wrong channel for v3.1 invite-only). `/api/beneficiary/send-manual` now orphaned, scheduled for June 9 deletion alongside `send-intro`. |
| [64459cf](https://github.com/drobstl/insurance-app/commit/64459cf) | Landing page rebuild Round 1 — banner pill ("Built to 3x your book"), retention copy, ROI rework, founding-cohort sweep, mobile sticky CTA fix. |
| [a2cf614](https://github.com/drobstl/insurance-app/commit/a2cf614) | Dashboard mobile nav: Action Items surfaced in the bottom row between Clients and Referrals. Grid bumped to 6 cols. |
| [68dcefb](https://github.com/drobstl/insurance-app/commit/68dcefb) | Landing page Round 2 part 2 — Action Items dashboard callout + "How does AFL 3x my book?" FAQ entry. |
| [6e0d4f4](https://github.com/drobstl/insurance-app/commit/6e0d4f4) | Brand voice: AFL is the actor everywhere ("AFL extracts", "AFL sends", "AFL Takes Over") + pricing page header SVG swapped to the canonical `/logo.png` infinity logo. Sitewide meta description updated. |
| [9753a43](https://github.com/drobstl/insurance-app/commit/9753a43) | Pricing teaser headline "Pricing built around conversations" (operator-speak) → "Pricing that fits your book" + tightened subhead. |
| [c204390](https://github.com/drobstl/insurance-app/commit/c204390) | Mobile `/policies` auto-refresh — `useFocusEffect` + `AppState` foreground listener + `RefreshControl` pull-to-refresh. Fixes force-quit requirement to see the Invite button after an agent updates a beneficiary phone. |
| [f61484a](https://github.com/drobstl/insurance-app/commit/f61484a) | **Firestore collectionGroup indexes added for `entries.phoneE164` + `entries.providerThreadId`.** Welcome activation, beneficiary activation, and conversation thread registry had been silently no-op'ing on every inbound for ~3 days. Deployed to `insurance-agent-app-6f613` via `firebase deploy --only firestore:indexes`. |
| [58ba092](https://github.com/drobstl/insurance-app/commit/58ba092) | Welcome activation reply: 3-bullet activation checklist instead of paragraph. `THUMBS_UP_REGEX` broadened to also match "thanks" / "thank you" / "ty" / "thx" / "gracias" (the reply copy now explicitly invites Thanks/Gracias). |
| [598e4f7](https://github.com/drobstl/insurance-app/commit/598e4f7) | Linq webhook error differentiation — transient (DEADLINE_EXCEEDED / RESOURCE_EXHAUSTED / INTERNAL / UNAVAILABLE / Node network errors) return 503 so Linq retries; permanent errors return 200 + fire-and-forget Firestore write to `webhookErrors` collection. Caught the missing-index bug above; designed to prevent the next silent failure. |
| [0863647](https://github.com/drobstl/insurance-app/commit/0863647) | Dashboard settings subscription card — tier-aware. Hardcoded `$9.99/mo · Unlimited clients & policies` replaced with `PRICING_TIERS[membershipTier]` lookup. Founding members fall through to "Founding Member · grandfathered plan". |
| [7815177](https://github.com/drobstl/insurance-app/commit/7815177) | Trial countdown chip — Stripe webhook now writes `trialEndsAt` on `checkout.session.completed` + `subscription.updated`. Settings card renders "Trial · X days left" alongside the Active badge when `trialEndsAt` is in the future. |
| [5a01d77](https://github.com/drobstl/insurance-app/commit/5a01d77) | Welcome flow landing section body rewrite — chargeback mechanism named ("when the next premium hits, they don't recognize the charge — and they cancel"), branded-app elevation ("stop being a stranger and become the agent they remember, refer, and trust"), closer card locked to "Most agents have a book of business. AFL agents have a book that doesn't leak, and compounds their income from leads they already won." |
| [804695f](https://github.com/drobstl/insurance-app/commit/804695f) | Patch (dashboard AI assistant) — added Action Items section + first AI→AFL voice pass. |
| [be4af5e](https://github.com/drobstl/insurance-app/commit/be4af5e) | Patch global rewrite — added "CORE CONCEPTS" (welcome flow Mode 1/2, retention cadence, referral hand-off, beneficiary invite), "PRICING & TRIAL" block, "WHAT YOUR CLIENTS SEE" block, 11 new how-tos. ~120 → ~235 lines. |
| [45b0e6d](https://github.com/drobstl/insurance-app/commit/45b0e6d) | CONTEXT.md May 11 entry block + Patch section refresh. |

**Mobile OTA pushed**: update group `62aca2b3-709e-4d1f-bac0-3eab55f0ac52`, commit `58ba092`, branch `production`. Policies-screen auto-refresh live in users' apps on next launch.

**Operational moves today:**
- Two Firestore field-override indexes deployed (`entries.phoneE164` + `entries.providerThreadId` at COLLECTION_GROUP scope). Unblocked welcome activation, beneficiary activation, conversation thread registry — all three share the same collectionGroup query shape.
- Calendar reminders set on Daniel's primary Google Calendar (`daniel@crosswindsfg.com`) for: **May 26** (review line-health data + decide on Phase B build), **June 4** (delete `/api/client/welcome-sms` + `/api/client/send-bulk-intro`), **June 9** (delete `/api/beneficiary/send-intro` + `/api/beneficiary/send-manual`), **June 11** (drop `displayContext.welcomeMessageBody` alias).

## What's next: Onboarding rebuild

### The problem

Add Client has a **first-90-seconds** problem. New agents click "Add Client" expecting a typical CRM form, and they don't know:

1. The flow works best when you bring a **recent active client** (not a cold lead from 5 years ago).
2. The fastest path is **PDF upload**, not manual entry — AFL extracts the data for you.
3. At the end you'll get a **one-tap invite** ready to send from your phone.
4. The client will install **your branded app** and your contact card will land in **their** phone.
5. From there, AFL does the relationship maintenance automatically.

If the agent doesn't know any of this going in, they either (a) get confused mid-flow, (b) pick a bad first client and the demo falls flat, or (c) churn before they hit the magic moment.

### The plan — 3 layers, NOT 1

You don't pick one approach. Stack three layers so agents with different learning styles all get help at the right depth. Patch is the fourth layer (already exists, no work needed).

#### Layer 1 — Empty state on `/dashboard/clients` when zero clients exist

Replace the typical "No clients yet" empty state with structured framing. Three numbered steps + a Loom embed + a primary CTA.

Copy direction (don't ship as-is, this is the voice):

> ### Your first client onboarding
>
> 1. **Pick a recent active client** — someone from the last 12 months who'd remember you. AFL is built to wake up real relationships, not cold leads.
> 2. **Drop their application PDF** — AFL extracts the policy, beneficiaries, and contact info for you. (Or add manually if you don't have the PDF.)
> 3. **One-tap invite** — you'll get a text ready to send from your phone. They install your branded app, your contact card lands in theirs.
>
> **[Add your first client]**   **[Watch the 90-sec walkthrough]**

Voice rules: speak agent-business-outcomes (per `feedback_marketing_narrative_frame.md`); AFL is the actor (not "AI"). The "real relationships, not cold leads" line is load-bearing — gently shapes WHICH client they pick first.

#### Layer 2 — Loom (90-second screen recording)

You record this ONCE. Show the full loop:
1. Click "Add Client" → upload PDF
2. AFL extracts → review extracted data → save
3. Action item appears in `/dashboard/action-items` → tap → Messages opens with welcome text pre-filled
4. Client receives text → installs app → taps Activate → vCard reply arrives
5. End state: client in book, agent's contact in client's phone, welcome action item auto-completed

Embed in the empty state. Link from Patch (`web/app/api/dashboard-assistant/route.ts` — add a "watch the walkthrough" mention to the welcome-flow how-to). Drop the URL anywhere else useful (onboarding emails, landing page, pitch deck).

Update cadence: re-record every 6-12 months OR when the flow changes substantially.

#### Layer 3 — Inline framing inside the Add Client flow

Not heavy onboarding — one line of context at each consequential step:

- **PDF upload step**: small caption text below the dropzone — *"AFL will extract policy and beneficiary data. You'll review before saving."*
- **Post-create state** (right before they tap send): small text above the action item — *"This text comes from YOUR phone, not AFL. The client gets it as if you texted them personally."*
- **After welcome sent**: small celebration moment + *"What happens next: they install the app and your contact card lands in their phone within minutes. You don't need to do anything else."*

Don't over-instrument. Three touchpoints, well-placed, beats ten scattered tips.

### Things I'd NOT do (and the reasons why)

- **Onboarding overlay that blocks the UI** (coach-mark walkthrough). Agents hate gates; high abandon rate.
- **Pre-populated demo client.** Confuses real vs fake. Agent inevitably texts the demo client and gets weird behavior.
- **Onboarding checklist sidebar.** Real estate cost on the dashboard; better to just show what matters in the empty state.
- **Loom alone with no inline support.** Most users don't watch onboarding videos until they're already stuck. The video is a fallback for explicit "show me first" learners.

### Cost estimate

Roughly 1 day of focused work, mostly copy not engineering:

- Empty state rewrite (design + copy + build): ~2 hrs
- Loom recording (3-5 takes + light edit): ~1 hr
- Inline framing across flow steps: ~3-4 hrs
- Patch hook-up to reference the Loom: ~15 min

### Key file references

- `web/app/dashboard/clients/page.tsx` — the Add Client flow (4500+ lines, read selectively; focus on the empty state + the create-client flow + the post-create welcome action item surface)
- `web/components/ClientDetailModal.tsx` — client detail view (touched May 11 — beneficiary intro UI was stripped)
- `web/app/api/dashboard-assistant/route.ts` — Patch system prompt (Layer 4; add Loom link to the "How do I add clients?" and "What does my client see..." how-tos)
- `web/lib/welcome-action-item-writer.ts` — writes the welcome action item; useful for understanding what fields drive the post-create surface
- `web/app/dashboard/action-items/page.tsx` — where the welcome action item surfaces after client creation
- `mobile/app/activate.tsx` — what the client sees when they install the app and tap Activate

## Pre-launch carry-forwards (do before May 12)

1. **iPhone QA the 6-column dashboard mobile nav.** Tap targets ~62px per item — tight but readable. Eyeball on a real iPhone. If unworkable, swap to 5 items (drop Referrals or Retention since both are reachable from Action Items).
2. **Send the Ben/Linq email** about per-carrier overlay metrics. Daniel has a draft ready. Sending it unblocks Phase B planning.
3. **Sweep `/api/webhooks/stripe`** (and any other webhook routes) for the same 200-on-error swallow pattern that hid the missing-index bug for 3 days. The Linq webhook now differentiates transient vs permanent (commit `598e4f7`); apply the same shape to other webhook endpoints.
4. **Eyeball Vercel deploys** from today's pushes on `agentforlife.app`. Particularly the new welcome flow section copy + the trial countdown chip on `/dashboard/settings`.

## Post-launch carry-forwards (calendar reminders set)

| Date | Task |
|---|---|
| May 26 | Review `/dashboard/admin/line-health` data — decide whether the 15%/20%/25% auto-throttle thresholds match real AFL traffic before building Phase B. |
| June 4 | Delete `/api/client/welcome-sms` + `/api/client/send-bulk-intro` (marked `@deprecated`). |
| June 9 | Delete `/api/beneficiary/send-intro` (marked `@deprecated`) + `/api/beneficiary/send-manual` (orphaned by today's UI removal). |
| June 11 | Drop deprecated `displayContext.welcomeMessageBody` alias from `web/lib/action-item-types.ts`. |
| Pending Linq response | Per-carrier overlay metrics (STOP rate, T-Mobile delivery, 30007/30008 codes) — blocked on Ben's reply. |
| Phase 3 | Conversation counter (per-agent monthly bucket, foundation for overage billing). |
| As needed | Stripe customer cleanup — 4 founding members with cards on file (inert). |
| Revisit | Agent-side beneficiary affordances in dashboard (Daniel removed UI May 11; revisit if real demand surfaces, with personal-phone hand-off NOT Linq). |

## Pre-commit baseline (carry-forward)

- Web `npx tsc --noEmit` clean from worktree (use symlinked node_modules from canonical if working in a Claude worktree).
- Web ESLint pre-existing baseline: 6 errors in `clients/page.tsx`; 1 warning each in `OnboardingChecklistRail.tsx` and `referral-ai.ts`. Don't fix unless that file is the focus of your change.
- Mobile `tsc` baseline: 3 pre-existing errors at `mobile/app/_layout.tsx` lines 18/103/104 (expo-notifications API drift). Don't fix.
- Mobile `policies.tsx` ESLint: clean as of May 11 (was 1 useEffect exhaustive-deps warning; fixed during the auto-refresh rewrite).

## Vercel + EAS state

- `main` HEAD is `45b0e6d` (CONTEXT.md May 11 update). All commits Vercel-deployed.
- Mobile binary: v1.6.1 build 37 (iOS) / versionCode 29 (Android), in stores.
- Latest OTA update: `62aca2b3-709e-4d1f-bac0-3eab55f0ac52` (commit `58ba092`), shipped May 11.
- `LINQ_OUTBOUND_DISABLED` is **false** in Vercel — line is live.
- `MAINTENANCE_MODE_READONLY` is **false** in Vercel.
- `REACTIVATION_FENCE_AT` is **not configured**.
- Firestore index file `web/firestore.indexes.json` was updated May 11 with two new field overrides — config now matches what's deployed in `insurance-agent-app-6f613`.

## How Daniel wants to work right now

- "All gas no brakes" through May 12 relaunch (tomorrow from this handoff).
- Push and OTA after every meaningful commit so he can verify on his iPhone.
- He runs binary submissions himself; OTA via `eas update` Claude can run with explicit instruction (verify printed `Commit` matches expected per `feedback_eas_uses_canonical_working_dir.md`).
- Ask before destructive / hard-to-reverse actions. Don't ask before normal local edits.
- He'll push back fast on overengineering — keep proposals scoped and pragmatic.
- **Voice rule (load-bearing):** speak about AFL doing things, not "AI" as the actor. "AI" appears only in literal feature names (e.g., "the AFL referral assistant uses AI to qualify leads"). See `feedback_marketing_narrative_frame.md` + the Patch system prompt at `web/app/api/dashboard-assistant/route.ts` for the canonical voice.

Good luck. The onboarding rebuild is the natural next step after the May 12 launch — agents who land in the product after the relaunch deserve a first 90 seconds that sets them up for the magic moment instead of confusing them past it.

---

## Addendum — May 12, 2026 update (read this first)

The May 11 plan said "next session builds the empty state." Daniel got a jump on it overnight and already shipped a first cut. Pick up from where it is, not from scratch.

### What's already on `main` (as of `6d0f941`)

| Commit | What |
|---|---|
| [`3319436`](https://github.com/drobstl/insurance-app/commit/3319436) | Extraction overload: detect upstream 529 banner, skip doomed fallback. |
| [`78e6317`](https://github.com/drobstl/insurance-app/commit/78e6317) | Sample bulk-import CSV (350 fake rows) for the Loom demo. |
| [`85d763f`](https://github.com/drobstl/insurance-app/commit/85d763f) | **Clients empty state — first pass.** Two side-by-side poster cards: "The 90-second ritual" (~90 sec) + "Bulk import ceremony" (~2 min). Single `activeWalkthrough` state drives which modal opens. Env-var driven Loom URLs (`NEXT_PUBLIC_ONBOARDING_WALKTHROUGH_LOOM_URL` + `NEXT_PUBLIC_BULK_IMPORT_WALKTHROUGH_LOOM_URL`). |
| [`ec549fc`](https://github.com/drobstl/insurance-app/commit/ec549fc) | Bulk import: immediate drip release on activate (capped at 15/UTC-day). |
| [`d9d7c49`](https://github.com/drobstl/insurance-app/commit/d9d7c49) | Bulk import drip: drop `orderBy` that needed a missing composite index. |
| [`5303471`](https://github.com/drobstl/insurance-app/commit/5303471) | `/v5/referrals` H1 → "A top producer's playbook. Run for every referral." + AI→AFL sweep on referral cards. |
| [`6d0f941`](https://github.com/drobstl/insurance-app/commit/6d0f941) | Patch system prompt: bulk-import Loom share URL hardcoded in the "How does bulk import work?" how-to. |

**Bulk-import Loom is recorded and embedded.** URL: `https://www.loom.com/share/5aa201063a1d4754896d701f2677e3c7`. Production env var set + Vercel rebuilt. Live on `/dashboard/clients` empty-state + `/dashboard/resources`.

**Onboarding (90-second ritual) Loom: status unclear.** `NEXT_PUBLIC_ONBOARDING_WALKTHROUGH_LOOM_URL` may or may not be set in Vercel; verify in the empty state by checking whether the left poster renders the video or a placeholder.

### Daniel's critique of the current empty state (May 12, after seeing it live)

> "I feel like this needs work. It's a lot here to take in. And the videos need to be labeled so at a glance we know which is which — and also that the 90-second ritual one is more important as the ongoing method. And the bulk is more of a one-time to get your current book into the system."

**Three problems to solve:**

1. **Hierarchy is flat.** Both posters look equally weighted. An agent reading "your first client onboarding" doesn't know which one to watch first or which one is the actual product loop vs the one-time migration.
2. **Labels don't convey use frequency.** "The 90-second ritual" and "Bulk import ceremony" describe content but not when to use each. An agent doesn't know: "the 90-second ritual is what you do on EVERY close" vs "bulk import is what you do ONCE to migrate your existing book."
3. **Body copy below is overwhelming.** The page has three sections of text after the videos ("Watch the walkthrough first" / "Then, on your next close, come back here" / "While you've still got them — ask for the referral"). On top of two video posters + section title, it's too much for a first-load.

### Direction for the rework (not yet built)

**Visual hierarchy:**
- Make "The 90-second ritual" the dominant poster — larger, primary position (left or top), maybe with a "PRIMARY" or "START HERE" badge.
- Make "Bulk import ceremony" secondary — smaller, lower visual weight, framed as "Have an existing book to migrate?" entry point.
- The 90-second ritual is the everyday product loop; the bulk import is a one-time setup tool. The empty state should TEACH that hierarchy at a glance.

**Labels:**
- 90-second ritual: lead the label with "For every new sale" or "Your everyday ritual" or similar frequency-signaling copy.
- Bulk import: lead the label with "One-time setup" or "Migrate your current book" — make it clear this is NOT what you do every day.

**Body copy:**
- Trim aggressively. The body copy below the videos is largely already covered IN the 90-second Loom itself. Keep maybe one short line ("Watch the 90-second ritual first — it's what you'll do on every close") and drop the three-paragraph walkthrough text.
- If retention of the body copy matters, consider collapsing it into a "Read the full ritual" expandable section instead of forcing it on the empty state.

**Possible alternative layouts to consider:**
- **Asymmetric 2/3 + 1/3 split** with the 90-second ritual on the left taking 2/3 of the width.
- **Stacked, primary on top** with the 90-second ritual full-width above, then bulk import as a smaller card below with "Have an existing book? Watch this instead."
- **Single-video-with-secondary-link** — the 90-second ritual is the only poster; the bulk-import link is a small tertiary "Got an existing book? Migrate it here →" link below.

The asymmetric split is probably the lightest lift; the single-video-with-link is the most aggressive simplification. Daniel's pushed back on overengineering before — start with the simpler shape and add only if the simpler one doesn't carry the message.

### Other things the new session should pick up

- **Inline framing inside the Add Client flow** (Layer 3 from the original plan) — still untouched. Once empty state is dialed, add per-step context inside the create-client flow per the original spec.
- **`NEXT_PUBLIC_ONBOARDING_WALKTHROUGH_LOOM_URL` — verify it's set in Vercel.** If not, the 90-second ritual poster shows a placeholder. Daniel may not have recorded that Loom yet — confirm with him before assuming it's ready.
- **Pre-launch carry-forwards from above still open**: iPhone QA the 6-col dashboard mobile nav, send the Ben/Linq email, sweep `/api/webhooks/stripe` for the 200-on-error swallow pattern.
