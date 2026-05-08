# Handoff — Welcome Flow Implementation Pivot (May 7, 2026)

> **For the next agent picking this up.** Read this whole doc before touching any code. It's self-contained — you don't need to read prior chat history.

## Who you are and what you're doing

You're a coding agent in Cursor working on AgentForLife (AFL) at `/Users/danielroberts/Developer/insurance-app`. The user is Daniel Roberts (founder, solo). You're picking up an implementation pivot that was scoped and locked-in via spec but not yet executed in code.

The spec is locked. The work is mechanical. Don't relitigate the architecture — read the amendment, do the implementation. If you find yourself wanting to change the architecture, surface it and get Daniel's sign-off rather than just doing it.

## Required reading order (do this FIRST, in this order)

1. `.cursorrules` (repo root) — load-bearing rules including PDF pipeline lockdown, TypeScript deploy guardrails, Context-Use Guardrail, repository safety rules. **Read before any changes.**
2. `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` — the spec for the work. Locked May 7, 2026. This is the source of truth for what you're building.
3. `CONTEXT.md` — full file. Especially:
   - `Source-of-Truth Documents` (the amendment is now #1 in precedence)
   - `Channel Rules > The two-step welcome flow > Phase 1 implementation constraints (REVISED May 7, 2026)` — note the "SUPERSEDED for Mode 1" callout
   - `Recent fixes` → "Architecture amendment (May 7, 2026)" entry
   - `Phased Roadmap > Phase 1`
4. `git log --oneline -20` to see what's been shipped recently. Especially commits `a1e1d06`, `99e134f`, `55ab665` (Track B), and `e8c1b27` (the amendment).

Don't skip step 2. The amendment is the canonical spec; everything else is context.

## What's currently live in production

- Track B (welcome flow + PWA + Web Push + vCard + action items + cutover) is fully deployed via Vercel.
- `MAINTENANCE_MODE_READONLY=true` is set in Vercel env. The amber maintenance banner is showing on the dashboard right now. Read-only mode blocks all mutation API routes outside the allowlist (see `web/lib/maintenance-mode.ts`).
- `LINQ_OUTBOUND_DISABLED=true` is set in Vercel env (Daniel's kill switch from commit `e017d55`). Every outbound call to Linq throws `LinqOutboundDisabledError`. Inbound webhooks still work.
- VAPID env vars (4 of them) are set in Vercel for the agent-side Web Push that you're about to demote.
- 4 commits ahead-of-relaunch are queued: the amendment plus assorted Track B work. All pushed.

## The relaunch target

Tuesday, May 12, 2026. The maintenance window lifts that morning. Daniel will (a) record Loom videos if needed, (b) write the cohort email, (c) submit the mobile React Native app update to App Store + Play Store. None of those are your work; focus on code.

## What you're building

The May 7 amendment introduced a two-mode framing for the welcome flow:

- **Mode 1 (real-time, daily, primary):** agent at workstation on a live phone call → creates client → inline send UI fires `sms:` URL → done. No PWA install required, no Web Push required.
- **Mode 2 (bulk import, async, once per agent lifetime, currently disabled):** action items queue surface with PWA + Web Push as required setup. Activates with Phase 2 work.

The current code reflects the old (May 4) framing where Mode 1 didn't exist as a concept — everything was treated as async and PWA + Web Push were HARD onboarding gates. You're pivoting the code to match the new framing.

### Specific work, in order

1. **Revert the May 6 existing-agent re-onboarding gate** in `web/app/dashboard/layout.tsx`. Look for the `missingNewHardGate` variable in the `useEffect` near line ~530 that controls `setShowOnboarding`. Daniel's May 6 decision force-showed the overlay for existing agents missing `pwaInstalled` or `webPushGranted` — that decision is reverted by the amendment. Restore the original simple gating: `const shouldShow = agentProfile.onboardingComplete !== true;` and update the `useEffect` deps accordingly.

2. **Strip install + push steps from `OnboardingOverlay.tsx`.** The `STEPS` array (around line 205) currently has 7 entries (welcome / profile / pwaInstall / webPushPermission / firstClient / firstWelcome / patch). Remove the `pwaInstall` and `webPushPermission` entries entirely. STEPS becomes 5 entries (welcome / profile / firstClient / firstWelcome / patch). Update any code that references the indices or these step IDs:
   - The auto-jump-to-first-incomplete effect (around line 444)
   - The `primaryLabel` switch (around line 1118) — remove the `pwaInstall` / `webPushPermission` cases I added
   - The `handlePrimary` function — remove the entire branches for `pwaInstall` and `webPushPermission` (around line 935+)
   - The `milestones` useMemo and the `requiredMilestoneCount` constant (around line 412) — these still need to reflect 4 required milestones (the OLD count) instead of 6. The `pwaInstalled` and `webPushGranted` keys can stay in the milestones object for the opt-in upsell to use, but they don't count toward `allRequiredDone` or `completedRequiredCount`.
   - The custom render block (around line 1517) that conditionally renders `<PlatformInstructions />` for `pwaInstall` / `webPushPermission` / `firstClient` / `firstWelcome` — remove the first two from the condition (keep `firstClient` and `firstWelcome` for now, then remove those too in step 5 below).

3. **Demote `pwaInstalled` + `webPushGranted` milestones to optional** in `web/app/dashboard/DashboardContext.tsx`. Two changes:
   - `OnboardingMilestones` interface: keep the keys (PWAInstaller code still writes them) but change the comment to note they're optional.
   - `areAllOnboardingMilestonesComplete`: change from `Object.values(milestones).every(Boolean)` to an explicit check of the 4 OLD required milestones only. The two new keys are tracked but don't gate completion.
   - `OnboardingChecklistRail.tsx`: remove the two `pwaInstalled` / `webPushGranted` items from `CHECKLIST_ITEMS` (added in commit `a1e1d06`).

4. **Build the inline welcome compose surface in `web/app/dashboard/clients/page.tsx`.** This is the biggest change. The current `welcome` add-flow stage shows "Welcome added to your queue / View queue" CTAs (Track B cutover from commit `99e134f`). Replace it with the inline compose surface per amendment §4.1:
   - Pre-filled welcome message (use the existing `buildWelcomeSms` helper, which is still in the file from before the cutover)
   - Primary "Send via iMessage" button that fires the `sms:` URL scheme — use a small platform-detection helper to pick the right URL form (iOS canonical `&body=`, Android canonical `?body=`)
   - "Copy welcome text" fallback for unsupported platforms (Linux, Chromebook, Mac+Android, Windows-without-Phone-Link). Detect via UA + a try/check on `Linking.canOpenURL` equivalent for the browser (`window.location.href = 'sms:...'` doesn't fail-detect well; safer to render the copy fallback alongside the Send button on platforms known to be unsupported).
   - "Skip — send later" deferral that closes the compose surface and lets the action item stay `pending` in the queue (the queue page at `/dashboard/welcomes` is unchanged and still functions as the recovery surface).
   - The action item write happens at "create client" time (current Track B behavior — keep it). On Send tap, complete the action item via `/api/agent/action-items/[itemId]/complete` with `completionAction: 'text_personally'`.

5. **Remove device-transition cards from `web/components/onboarding/PlatformInstructions.tsx`.** Specifically the `FirstClientBlock` and `FirstWelcomeBlock` and `DeviceSwitchBlock` functions (added in commit `b65ff2c`). For Mode 1 there's no device transition — agent is at workstation the whole time. The component file can be deleted entirely OR kept around for Mode 2 use later. Daniel's preference: delete unless there's a reason to keep. If you keep it, make sure no live code paths reference it.

6. **Update Test 1** (the test plan from the prior chat session) is OBSOLETE. Don't continue running it. The new flow is so different that any prior test instructions are stale.

### What does NOT change (unchanged surfaces)

These pieces of Track B stay exactly as they are. Don't touch them:

- `web/lib/action-item-types.ts` and `web/lib/action-item-store.ts` — the schema and store
- `web/app/api/agent/action-items/welcome/queue/route.ts` — the action item queue API
- `web/app/api/agent/action-items/[itemId]/view/route.ts` and `.../complete/route.ts` — the view/complete API
- `web/app/api/cron/welcome-action-item-expiry/route.ts` — the daily expiration cron
- `web/lib/welcome-action-item-writer.ts` — the writer with idempotency + thread placeholder
- `web/lib/welcome-activation-handler.ts` — the Linq webhook handler
- `web/app/api/linq/webhook/route.ts` — the welcome-activation routing
- `web/lib/vcard.ts`, `web/lib/agent-vcard-store.ts`, `web/app/api/agent/vcard/regenerate/route.ts` — the vCard pipeline
- `mobile/app/activate.tsx` and the mobile React Native client app changes from commit `55ab665` and `9bc9025`
- `web/app/dashboard/welcomes/page.tsx` and `web/components/WelcomeActionItemCard.tsx` — the queue page stays as audit/recovery surface (NOT primary)
- `web/lib/web-push-lifecycle.ts`, `web/components/PWAInstaller.tsx`, `web/public/sw.js`, `web/public/manifest.webmanifest`, `web/app/api/agent/web-push/*` — the PWA + Web Push infrastructure stays in place but becomes unused-by-default. Don't delete it; it'll re-activate when bulk import enables in Phase 2.
- The maintenance mode infrastructure (`web/lib/maintenance-mode.ts`, `web/proxy.ts`, `/api/system/maintenance-status`, `MaintenanceBanner.tsx`) — unchanged.

### Open questions to confirm with Daniel as you go

These are §7 of the amendment, with my recommendations:

- **Action item write timing:** write at "create client" time (current behavior, recommended). Marks `completed` on Send tap, stays `pending` if agent skips for later.
- **Copy-paste fallback completion semantics:** when agent taps "Copy text," mark the action item as `completed` with `completionAction: 'text_personally'` and an annotation that the send was via copy-paste. Trust the agent — no way to verify they actually pasted/sent.
- **Track A push permission lifecycle (client-side Expo) is unchanged.** Confirmed in amendment.

If any of these need different decisions, ask Daniel before implementing.

## Constraints to respect

- **PDF extraction pipeline is locked** per `.cursorrules`. Don't touch `gcf/ingestion-v3-processor`, `web/lib/pdf/...`, or `web/app/dashboard/clients/page.tsx`'s PAGE_MAP. The clients page change you're making is in the add-flow `welcome` stage UI, not the PDF pipeline.
- **Maintenance mode allowlist** (`web/lib/maintenance-mode.ts`): the welcome compose surface needs to be reachable. The action item complete + view routes are already allowlisted (commit `a903e53`). Adding any new mutation API routes? Add them to the allowlist with a comment explaining why.
- **Linq outbound is off.** No `createChat` / `sendMessage` / `uploadAttachment` calls will succeed. Wrap them in try/catch where they exist (already done in the welcome-activation-handler). For new code that doesn't need Linq (the `sms:` URL launches are client-side, not Linq), no concern.
- **Pre-commit checks always:** `cd web && npx tsc --noEmit` clean across workspace. `npm run build` clean. ESLint clean on touched files. The 7 pre-existing lint warnings/errors in `web/app/dashboard/clients/page.tsx` and `web/components/OnboardingChecklistRail.tsx` are documented as present in HEAD before changes — leave them alone (Track A pattern).
- **Don't push without confirming with Daniel.** The `.cursorrules` says NEVER push to remote unless explicitly asked. Commit locally; ask before pushing.

## How Daniel works

- He's the founder, not an engineer in the traditional sense. Talk plainly. No jargon-bombing.
- He's been iterating on this welcome flow for ~12 hours and is tired/frustrated. Be a real partner, not sycophantic.
- He wants synthetic thinking — read the relevant docs and integrate them BEFORE responding, not piecemeal as he reveals context. The amendment is the integrated picture; you have it; use it.
- When you complete commits, push them only when he asks. He has Vercel auto-deploy set up; pushes go live in ~60 seconds.
- He's currently in a maintenance window (until May 12) which means he's the only "user." He'll test changes himself on his Mac+iPhone setup.

## Suggested commit structure

This work could be one big commit or split into 2-3 logical pieces. Suggestion:

- **Commit A:** Revert the May 6 onboarding gate + strip install/push from STEPS + demote milestones + delete PlatformInstructions device cards. (Defensive cleanup of the now-deprecated Track B onboarding gates. Build clean, but no new feature yet.)
- **Commit B:** Build the inline welcome compose surface in clients/page.tsx + smart `sms:` routing + copy-paste fallback. (The actual new feature.)
- **Commit C:** Update CONTEXT.md `Recent fixes` with the implementation entry referencing both commits. Optional — could fold into Commit B.

If you commit incrementally, each commit should pass `tsc + build + lint`. Don't commit broken intermediate states.

## Things I'd test before declaring done

1. As Daniel (existing agent with `onboardingComplete=true` from before Track B): hard-refresh the dashboard. The OnboardingOverlay should NOT appear (the May 6 gate is reverted). The dashboard should look like normal AFL with the maintenance banner at the top.
2. Reset onboarding via the admin button: should land on step 1/5 (Welcome) and walk through 5 steps (no install, no push).
3. Add a client (would require flipping `MAINTENANCE_MODE_READONLY` to false temporarily — confirm with Daniel before doing this): the new inline compose surface should appear immediately after profile creation. Pre-filled welcome text, "Send via iMessage" button, "Copy text" fallback button, "Skip — send later" link.
4. On Daniel's Mac, tap "Send via iMessage": iMessage should open with the welcome pre-filled. (This is the win — the desktop send path that was previously forbidden by May 4 decisions.)
5. The `/dashboard/welcomes` page still exists and the action item is reachable there. If agent tapped Skip, the queue should show the pending item.

Daniel will test the actual send + iMessage opening on his real device. You can confirm tsc/build/lint clean.

## When you're done

- Tell Daniel what you changed (commit-message-style summary, not a wall of text).
- List the commits you produced (`git log --oneline -5`).
- Confirm pre-commit checks passed.
- Suggest what he should test as a sanity pass.
- Ask whether to push.

Don't volunteer to do Track C (pricing tiers) or any other unrelated work in the same session. The Mode 1 implementation pivot is the scope. Anything else is a separate ask.

---

**Final note:** the amendment doc was the result of a long iterative conversation that reached clarity. It's the locked spec. Trust it. Don't second-guess the architecture; just implement it cleanly. If you find an actual bug or contradiction in the amendment vs the code, raise it with Daniel — don't silently work around it.

Good luck.
