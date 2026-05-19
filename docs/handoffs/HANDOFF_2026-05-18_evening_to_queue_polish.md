# Handoff — May 18, 2026 (evening) → Queue polish + feature flag + EAS rebuild

> **For the agent picking this up.** Tonight's session continued the May 18 work on `claude/charming-satoshi-3be4cc`. We shipped the mobile notification deferral (commit `64cefce`) and the call-queue two-pane layout with extracted `LeadDetailPanel` (commit `8ee2a0c`). End-of-day CONTEXT.md update and this handoff (commit pending at write time). Branch is **NOT pushed.** Three threads queued for the next session — all independent of each other; pick whichever Daniel wants to tackle first.

## Context inheritance

Read in order:

1. `CONTEXT.md` — recently updated; the May 12–18 entry under `Recent fixes` is the most complete summary of the lead-mode surface and what's already shipped on the branch.
2. `docs/handoffs/HANDOFF_2026-05-18_to_feature_flag.md` — the handoff that briefed me. The feature-flag task description there (Task 1) is the authoritative spec for thread (b) below; nothing has changed about Daniel's intent for that work.
3. This doc.
4. `git log --oneline -10 main..claude/charming-satoshi-3be4cc` — last 10 commits are the source of truth for what's currently on the branch.
5. Memory:
   - `feedback_match_scope_to_data.md` — Daniel will push back on overengineering. Default to small fix + opt-in to apparatus.
   - `project_close_of_sale_upload_anchor.md` — live-guided activation is the load-bearing ritual; the notification deferral is in service of this.
   - `project_agent_world_context.md` — 100% remote agents, no walk-ins.

## What shipped this stretch (commits since the May 18 morning handoff)

- `64cefce` Mobile: defer iOS notification prompt to client activation. Single-condition narrow in `mobile/app/index.tsx:153` from `('client' || 'lead')` to `('client')`. Rewrote the 8-line comment block above it to explain the iOS one-shot-prompt rationale and the close-of-sale activation ritual. Trade-off: lead-side appointment push reminders won't have tokens to push to. Practically a no-op today (no EAS dev build has shipped the lead push path live anyway). Requires EAS dev rebuild to verify on-device.
- `8ee2a0c` Call queue: two-pane layout with `LeadDetailPanel` on desktop. Extracted the entire `[leadId]/page.tsx` JSX + state surface into `web/components/LeadDetailPanel.tsx` (~1942 lines). The standalone `/dashboard/leads/[leadId]` route is now a 36-line thin wrapper that mounts the panel and forwards the `?openConfirmation=` deep-link param. `/dashboard/leads` queue view renders the same panel inline next to a narrow list rail on desktop (`md:w-[360px]` list + `md:flex-1` panel). Selection state is in `?leadId=`; auto-selects top of queue on first paint. Desktop Call button picks the least-dialed phone and hands the dial off via a `pendingDial` nonce — panel fires `tel:` and opens the outcome prompt in one motion. After any outcome chip / booking / convert / delete, the panel fires `onOutcomeLogged` / `onConverted` / `onDeleted` and the queue advances the right pane to the next queue lead synchronously via shared `advanceToNextQueueLead` callback. Mobile keeps the existing single-column queue with the inline outcome chip flow. tsc clean.

The CONTEXT.md update + this handoff doc were tonight's final commit before Daniel ended the day.

## What's NOT done

Three independent threads. Pick whichever Daniel wants first; none depend on each other.

### (a) Make the queue list rail sticky

The right pane is long — full lead profile + form fields + dial script overlay + appointments + dial history + activity log. The narrow left list rail (rank + name + phone + Call button per row) is shorter. They currently share the page scroll, so when the agent scrolls down to read dial history, the list rail scrolls out from under them and they lose the queue context.

**Fix:** make the list rail sticky on the page scroll so it stays visible while the right pane scrolls past it. Right pane stays in normal flow; list rail uses `md:sticky md:top-N` with `md:max-h-[calc(100vh-Y)] md:overflow-y-auto` so it scrolls independently when the queue is long enough to need it.

**Critical files:**
- `web/app/dashboard/leads/page.tsx` — the wrapping `<div className={... 'md:flex md:gap-4 md:items-start' : ''}>` around the list card + right pane (around the "List card — branches on view" comment, ~line 1019). Add the sticky classes to the list card.
- The dashboard layout's `<main>` is the scroll container (`web/app/dashboard/layout.tsx` ~line 844 — `<main className="flex-1 p-4 md:p-6 overflow-auto">`). The list rail's sticky needs to compute its top offset relative to this — likely `md:top-0` works because main has its own padding above.

**Verification:** dev server is running on port 3001 in Daniel's existing browser. Hit `/dashboard/leads?view=queue` (or click Call queue tab), confirm a long lead's detail can scroll while the list rail stays put. Test on a few list lengths (5, 15, 30 leads) to make sure the rail doesn't overflow the viewport without its own scroll.

**Out of scope for thread (a):** redesigning the row content at 360px (truncation behavior is a separate visual polish item — name + 📅 booked chip share one line). The current behavior is acceptable per my read; iterate only if Daniel flags it visually.

### (b) Global feature flag for the entire pre-application lead-mode surface

**This thread was deferred from the morning handoff** because Daniel said "not yet ready to push/go live with lead mode but i do want to go ahead with the mobile notification deferral part of the plan." When he IS ready to push lead mode to prod with the surface invisible, this is the unblock.

The original spec lives in `docs/handoffs/HANDOFF_2026-05-18_to_feature_flag.md` (Task 1). Daniel's exact words for the visual treatment:

> "what if we do a feature flag where the Leads nav item is still there but it's crossed out? We could even put a small chip right on top of the nav item that says 'Coming soon.' And on mobile, we just don't show the nav item."

**Implementation summary (verbatim from my approved plan earlier this session, which we paused at ExitPlanMode rejection):**

- New env var: `NEXT_PUBLIC_LEAD_MODE_ENABLED` (default `false`). Add to env docs.
- Single source of truth: `web/lib/feature-flags.ts` exports `LEAD_MODE_ENABLED: boolean`. NEXT_PUBLIC_ vars inline at build time so a plain constant is sufficient — no hook, no context.
- **Desktop sidebar** (`web/app/dashboard/layout.tsx`, sidebar `NAV_ITEMS` map ~line 421 + render block ~line 649): when flag is off, render the Leads row as a non-interactive `<div>` (not a button, no `router.push`). Apply `line-through` + dimmed text (`text-white/40`) + a small "Coming soon" chip absolutely positioned top-right of the row (`bg-[#44bbaa]/20 text-[#daf3f0] border border-[#45bcaa]/30`, `text-[10px] font-bold uppercase tracking-wider`).
- **Mobile bottom nav** (same file, `mobileNavItems` filter ~line 593): omit Leads entirely when flag is off. Grid is `grid-cols-6` (line 850); switch to `grid-cols-5` via explicit ternary (`mobileNavItems.length === 6 ? 'grid-cols-6' : 'grid-cols-5'`) — Tailwind doesn't pick up dynamic class names from string interpolation.
- **Route guards** on both `web/app/dashboard/leads/page.tsx` AND `web/app/dashboard/leads/[leadId]/page.tsx`: at top of the component, `useEffect(() => { if (!LEAD_MODE_ENABLED) router.replace('/dashboard'); }, [router]);` and `if (!LEAD_MODE_ENABLED) return null;` Client-side gate matches existing AFL patterns (the `SubscriptionGate` in the dashboard layout).
- **Cron defense in depth**: at the top of `web/app/api/cron/lead-pdf-archive/route.ts` handler, after auth: `if (process.env.NEXT_PUBLIC_LEAD_MODE_ENABLED !== 'true') return Response.json({ skipped: true, reason: 'lead_mode_disabled' });` Read `process.env` directly server-side to avoid pulling a client-marked import into the server graph.
- **Convert-to-Client is automatically behind the flag** because it lives inside the lead detail surface, which is gated.
- **What to leave alone**: the carrier-fit archive (already shelved at `web/lib/_archived-carrier-fit/`), the PDF extractor (`application-extractor.ts`, `ingestion-v3-pdf.ts`), Clients tab + welcome flow + action items + conservation + retention + rewrites, other crons (anniversary / birthday / holiday / conservation / beneficiary), and the mobile `lead-home.tsx` screen (Daniel's call: "we don't need to worry about the mobile app right now. Clients aren't just going to enter their phone number in randomly.").

**Verification:** `npx tsc --noEmit` clean. Then start the dev server (Daniel's existing one on port 3001 may still be running). Verify with flag unset → sidebar shows Leads with strikethrough + "Coming soon" chip, mobile bottom nav (resize ≤ 768px) shows 5 items, manual nav to `/dashboard/leads` redirects to `/dashboard`, cron returns `{ skipped: true }`. Then `NEXT_PUBLIC_LEAD_MODE_ENABLED=true npm run dev` and verify everything works as today.

**Commit suggestion:** single commit, message like:

```
Lead-mode feature flag: hide pre-application surface behind NEXT_PUBLIC_LEAD_MODE_ENABLED

Desktop sidebar shows Leads with strikethrough + "Coming soon" chip, not
a link. Mobile bottom nav omits the item entirely. Routes redirect to
/dashboard. lead-pdf-archive cron returns skipped:true. Single source of
truth in web/lib/feature-flags.ts.
```

### (c) EAS dev rebuild + on-device verification of the mobile notification deferral

Commit `64cefce` is shipped to the branch but can't be verified on-device until Daniel triggers an EAS dev rebuild. The change is JS-only (one condition narrow + comment block rewrite) so an OTA update via `eas update --branch production --message "..."` from `mobile/` is technically possible, but the cleaner path is a dev rebuild because:

- It hasn't been deployed to prod yet (the entire branch is local-only).
- Future lead-mode mobile screens may need native-level changes that an OTA can't deliver, so a fresh dev binary establishes the baseline.

**Steps:**
1. `cd mobile && eas build --profile development --platform ios` (or `--platform all` for both). Reuse the existing development build profile in `mobile/eas.json`.
2. Wait for the build to finish (~10–15 min).
3. Install on Daniel's iPhone.
4. **Test path:**
   - Enter a lead L-code in the app. Confirm NO OS notification permission prompt fires. App should land on `/lead-home`.
   - Take the lead through Convert-to-Client on the dashboard.
   - In the mobile app, log out, then enter the NEW client code. Confirm the OS notification permission prompt DOES fire this time (because `activate.tsx`'s auto-prompt logic sees `permission === 'undetermined'` and fires fresh).
   - Grant notifications. Confirm `agents/{agentId}/clients/{clientId}.pushToken` populates in Firestore.

**If the prompt doesn't fire on the client path:** check whether the device was previously prompted under an earlier dev build of AFL. iOS persists the OS-level permission state per install — a device that's already been through the prompt won't see it again regardless of code state. Reset by deleting + reinstalling AFL, or test on a fresh device.

**Out of scope:** prod `eas update` push of the change. Wait until the feature flag work in (b) ships and Daniel deploys the branch.

## Repo state at handoff

- Branch: `claude/charming-satoshi-3be4cc` (NOT pushed to origin).
- Last commit at write time: `8ee2a0c` Call queue two-pane.
- `git status`: working tree contains the CONTEXT.md update + this handoff doc, both staged for the end-of-day commit.
- Dev server: port 3001, running in Daniel's terminal against this worktree. HMR active.
- `npx tsc --noEmit -p web/tsconfig.json`: clean as of `8ee2a0c`.

## Critical safety reminders

- **Branch is local-only.** Don't push. Don't run `./deploy.sh` or `vercel --prod`. Don't `eas update` to production. Daniel deploys when ready.
- **Firestore is the shared prod project** (`insurance-agent-app-6f613`). Test writes go there.
- **`feedback_pdf_pipeline_locked.md` still applies.** The lead-form extractor is parallel-track. Don't touch `application-extractor.ts` or `ingestion-v3-pdf.ts`.
- **Carrier-fit work is archived at `web/lib/_archived-carrier-fit/`.** Don't unshelve without Daniel's explicit OK.
- **Lead mode is not in prod.** The feature flag in thread (b) is the prerequisite for Daniel deploying the branch.
- Today is May 18, 2026 (evening).

## Useful commands

```
# Worktree
cd /Users/danielroberts/Developer/insurance-app/.claude/worktrees/charming-satoshi-3be4cc

# Branch (local-only — DO NOT PUSH)
git status     # → claude/charming-satoshi-3be4cc
git log --oneline -10

# Dev server (port 3001; main checkout owns 3000)
cd web && set -a && source .env.local && set +a && PORT=3001 npm run dev

# Type check
cd web && npx tsc --noEmit
```

Good luck. Daniel will read your work in a new session — make it match what he'd build himself.
