# Handoff — May 18, 2026 → Lead-mode feature flag + mobile notification deferral

> **For the agent picking this up.** Daniel and I ran a long session over May 16–18 layering a bunch of agent-facing polish onto the lead-mode work + shelving the carrier-fit engine. The carrier-fit work is **parked** in `web/lib/_archived-carrier-fit/` and we're not bringing it back yet. The send-confirmation flow now uses a QR-scan bridge from desktop to phone (Daniel's call after a long iteration). The next session has two well-scoped tasks bundled together: gate the entire pre-application lead-mode surface behind a global env-var flag, and stop the AFL mobile app from prompting leads for notification permission so the one-shot OS prompt survives for client activation. Read this doc plus CONTEXT.md and you have everything.

## Context inheritance

Read in order:

1. `CONTEXT.md` — source of truth for the operating model.
2. `docs/handoffs/HANDOFF_2026-05-15_to_carrier_engine.md` — the prior handoff that briefed me. Useful background, especially Chunks 1–5 + the carrier-fit shelving rationale (which is now executed; see `web/lib/_archived-carrier-fit/README.md`).
3. This doc.
4. `git log --oneline -25 main..claude/charming-satoshi-3be4cc` — 23 net-new commits since May 15 are the source of truth for what shipped this stretch. Branch is **NOT pushed**.
5. Memory:
   - `project_agent_world_context.md` — AFL agents are 100% remote, no walk-ins, referrals exist but are just leads. Don't design defensive logic for prior-install scenarios.
   - `project_close_of_sale_upload_anchor.md` — live-guided activation is the load-bearing ritual. Notification permission grant happens here.
   - `feedback_match_scope_to_data.md` — Daniel will push back on overengineering. Default to small fix + opt-in to apparatus.

## What shipped May 16–18, 2026

29 commits on branch `claude/charming-satoshi-3be4cc`. **NOT pushed.** Daniel hasn't taken the lead-mode work live yet; the upcoming feature-flag work is precisely so he can deploy without exposing it.

### Lead-mode features that shipped + stayed

- **`d15788a` Booked chip on lead list.** Each lead row in `/dashboard/leads` (both All and Queue views) renders a teal `📅 Booked Thu May 21 · 2pm` pill when the lead has a future appointment. Live subscription to `agents/{uid}/appointments` builds a leadId → next-appointment map. Anchored TZ used so out-of-state leads show their local time.

- **`3f5bbbc` Lead import dedup.** Shared `web/lib/lead-dedup.ts` helper. Same-agent phone collision returns the existing lead (yellow "Already imported" banner with Open link per row) instead of silently creating an L-fallback dupe. Wired into both `/api/leads/upload` (single + multi-page) and `/api/leads/create` (manual).

- **`9f0157b` / `32f909b` / `a7e6bb9` Lead list search + sort + column cleanup.** Search bar (top-right of the tab strip, All view only) matches name / phone / leadCode / source / email / state / city. Sortable columns: Name / Source / Created (default Created desc). Dropped the State column and the redundant Code column after Daniel's UX feedback — Phone column already conveys the code (it's the same digits).

- **`6ea430e` Lead PDF auto-archive cron.** Daily cron at 08:00 UTC scans every agent's leads and archives the source PDF after 21 days of no activity (no dials, no notes edits, no appointment touches, no autosave edits). Hard skips: converted leads, leads with future appointments, legacy leads without `sourceFileStoragePath`. The `?dryRun=1` query param logs what would archive without deleting. Already in `web/vercel.json`.

### Send-confirmation flow (the QR-scan saga)

Daniel hit a regression on May 17 — the macOS send-confirmation flow was inserting the title field into the body text, dropping the license PDF entirely, and not pre-filling the recipient. We iterated through several attempts:

1. Restored mobile-only Web Share gate (`c08c1ad`)
2. Tried restoring `title` field (`75e3383`) — broke worse
3. Built two-button Mac flow with `navigator.share({ files })` step 2 (`a5f89cf`) — Daniel tested, files landed in a NEW blank Messages thread, not the focused one. Bet failed.
4. Pivoted to PDF→PNG + clipboard paste (`47f5aba`)
5. Made QR-scan the primary desktop bridge (`e5f8ec7`)
6. **Final state (`eda28bb`)**: dropped all desktop copy/paste + drag fallback paths entirely.

**Current send-confirmation behavior:**

- **Mobile (iPhone / Android)**: single Send button → direct `navigator.share({ files, text })` to Messages with everything pre-filled. Magical one-tap. The way it always worked.
- **Desktop (Mac or Windows/Linux)**: single **`📱 Send from your phone →`** button → opens a QR code modal. QR encodes `${window.location.origin}/dashboard/leads/{leadId}?openConfirmation={apptId}`. Agent scans with phone camera → AFL loads on phone with the drawer auto-mounted (lead detail page reads the `openConfirmation` URL param, finds the matching appointment, sets `confirmingAppointmentId`, strips the param from history) → tap Send → iOS Web Share magic → done.

**Key lessons Daniel verified empirically:**

- macOS Web Share to Messages **does not pre-fill the recipient** (no Web Share spec field for recipient). The May 15 morning comment claiming this was a "different machine test" turned out to be correct.
- macOS Web Share to Messages **silently drops PDFs** when mixed with image files.
- The `title` field on `navigator.share()` **leaks into the SMS body on macOS**. Daniel saw this with his own eyes. The 3fabce4 commenter who removed title was right.
- `navigator.share({ files })` on macOS opens a **new blank Messages thread**, not the currently-focused one. The "files land in the open thread" hypothesis was wrong.
- The QR-scan + iPhone Web Share path is the only working version that delivers recipient + body + all files (including PDFs) in one motion. Daniel's call: teach agents the QR-scan behavior.

**Production gotcha:** the QR encodes `window.location.origin`. In local dev that's `http://localhost:3001` which an iPhone on Wi-Fi can't reach. The drawer has a yellow dev-mode banner inside the QR modal that detects localhost / private IPs and explains how to test locally (HOST=0.0.0.0 + Mac LAN IP, or ngrok). Once AFL is deployed, the QR works automatically against the deployed domain. **Daniel will not deploy until after the feature flag work below ships.**

### Carrier-fit engine — shelved

- **`3b01c44`** moved the entire carrier-fit work into `web/lib/_archived-carrier-fit/`, `web/components/_archived-carrier-fit/`, and `web/scripts/_archived-carrier-fit/`. `tsconfig.json` excludes `**/_archived-*/**` so the parked code doesn't need to maintain compilable imports.
- The lead detail page no longer renders the Underwriting profile card or Suggested carriers card. PDF extraction is unchanged (DOB, gender, smokerStatus, coborrowerStatus, heightText, weightLbs, etc. still extracted).
- 12 build charts and 28 carrier products' worth of rules data preserved 1:1 with git history.
- Restore steps in `web/lib/_archived-carrier-fit/README.md` — 5-minute restore via `git mv` + re-add the import + JSX block.
- **Do not unshelve this without Daniel's explicit OK.** He told me to keep it parked.

## What's next: feature flag + mobile notification deferral

Two bundled tasks for the next session. Both contribute to the same goal: Daniel deploys AFL to production with the new lead-mode work invisible to live agents, and surfaces it later when he's ready.

### Task 1: Global feature flag for the entire pre-application lead-mode surface

**Goal:** A single env var `NEXT_PUBLIC_LEAD_MODE_ENABLED` (default `false`). When off, the lead-mode work is visually present but unreachable — the Leads nav item appears with strikethrough + "Coming soon" chip, but the route is blocked. When on (Daniel's dev / staging), all of lead mode works as it does today.

**Daniel's exact words for the visual treatment:**

> "what if we do a feature flag where the Leads nav item is still there but it's crossed out? We could even put a small chip right on top of the nav item that says 'Coming soon.' And on mobile, we just don't show the nav item."

So:
- **Desktop sidebar (when flag is off)**: Leads nav item rendered with `line-through` styling, dimmed text, and a small "Coming soon" chip on top. **Not a link** — `disabled` state, cursor stays as default, clicking does nothing.
- **Mobile bottom nav (when flag is off)**: Leads nav item not rendered at all.
- **Route protection**: `/dashboard/leads` and `/dashboard/leads/[leadId]` redirect to `/dashboard` when the flag is off. This protects against bookmark / typed-URL access.
- **Lead PDF archive cron**: leave running, harmless on a DB where no new lead docs are being created. (No new UI surfaces → no new lead docs → cron has nothing to act on.) Optionally env-gate the handler itself if Daniel wants belt-and-suspenders.

**Where the line is drawn**: anything that exists to **manage a lead before they sign an application** is flagged. The Convert-to-Client surface (which produces a client record from a lead) is on the lead-mode side and goes behind the flag. The existing Clients tab + Add Client + upload-application + welcome flow + conservation + retention etc. all stay visible and untouched. Daniel's exact framing: "anything that would come before writing the application."

**Convert-to-Client behavior summary (for context):** `POST /api/leads/[leadId]/convert` creates a new client doc with name/phone/email/dateOfBirth mirrored from the lead, generates a client code, registers it in `clientCodes`, stamps the lead with `convertedToClientId` + `convertedAt`, and clears `lastDialOutcome`. Lead persists as historical record. Welcome action item fires through the existing pipeline (not from the convert endpoint directly — by virtue of a new client landing in the Clients surface). Application upload still happens via the existing Clients-tab flow on the new client record. Agent workflow post-launch: (1) take application during appointment, (2) click Convert on the lead, (3) switch to Clients tab, (4) upload application to the new client, (5) welcome action item appears, (6) send welcome SMS — steps 4–6 are the unchanged existing AFL flow.

**Implementation notes:**

- Env var: `NEXT_PUBLIC_LEAD_MODE_ENABLED` (so it's available client-side via Next.js public env). Default `false`. Add to `web/.env.example` (or wherever env docs live).
- Single source of truth: `web/lib/feature-flags.ts` exports a `LEAD_MODE_ENABLED: boolean` constant + a `useLeadMode()` hook if needed. Don't read `process.env.NEXT_PUBLIC_LEAD_MODE_ENABLED` in 12 different places.
- **Files to edit (rough list — verify against current code first):**
  - `web/app/dashboard/layout.tsx` — sidebar nav. Render Leads item with strikethrough + "Coming soon" chip when flag is off. Mobile bottom nav: omit when off.
  - `web/app/dashboard/leads/page.tsx` — top of the component, if flag is off, `useRouter().replace('/dashboard')` and return null.
  - `web/app/dashboard/leads/[leadId]/page.tsx` — same redirect pattern.
  - Optionally `web/app/api/cron/lead-pdf-archive/route.ts` — early-return when flag is off (defense in depth).
- **What to leave alone:**
  - Carrier-fit archive (already shelved).
  - PDF extractor (still extracts everything; no UI surfacing changes).
  - Clients tab, welcome flow, action items, conservation, retention, etc.
  - Existing crons (anniversary, birthday, holiday, conservation, beneficiary, etc.).

### Task 2: Defer the mobile notification prompt for leads

**Goal:** Stop the AFL mobile app from triggering `Notifications.requestPermissionsAsync()` when a user enters a lead code. iOS only gives one OS-level "would like to send you notifications" prompt per install — burning it during the lead phase costs us the high-value moment (close-of-sale activation) when the agent is on the phone walking the new client through the ritual.

**Daniel verified the current behavior matches the concern:** `mobile/app/index.tsx:153` currently runs `registerAndSavePushToken` for both `accessType === 'client'` AND `accessType === 'lead'`, which fires the OS prompt for leads at lead-login time.

**Surgical change (one condition):**

```ts
// mobile/app/index.tsx, around line 153
// BEFORE:
if (accessType === 'client' || accessType === 'lead') {
  registerAndSavePushToken(clientCode).catch(...);
}
// AFTER:
if (accessType === 'client') {
  registerAndSavePushToken(clientCode).catch(...);
}
```

Plus a comment explaining *why* (iOS one-shot prompt, save for client activation, see Daniel's May 18 conversation).

**Effects:**

- Lead enters L-code → no push-token registration call → no OS prompt. OS permission state stays `undetermined`.
- Same user later converts and enters their new client code → `accessType === 'client'` → registration runs → if `undetermined` (which it will be), `activate.tsx`'s existing auto-prompt logic fires the OS prompt for the first time. Fresh prompt during the live-guided activation ritual.
- Lead never converts → no notifications either way. Lead-side app still works for pull-based content (intro video, assessment, FAQs, case studies).

**Trade-off Daniel accepted:** lead-side appointment-push-reminders (Chunk 4f-extension, May 15) won't have any push tokens to push to. Practically, the cron currently has zero leads with valid tokens anyway (no EAS dev build has been deployed for the lead push path), so this isn't a regression of anything live. If lead-side reminders ever become load-bearing, they go via SMS — leads will be called by their agent at appointment time regardless, so this is genuinely nice-to-have.

**Requires an EAS dev rebuild** to test on a real device. Per Daniel: not blocking, but flag it.

**No other mobile changes needed for the feature flag.** Per Daniel: "we don't need to worry about the mobile app right now. Clients aren't just going to enter their phone number in randomly."

### Bundling note

Ship as one or two commits — Daniel's call when you get there. They're separate concerns but contribute to the same release goal (deploy AFL without exposing lead mode). One PR with two commits is probably cleanest.

## Operational TODOs / open threads

- **EAS dev rebuild** — Daniel needs this for the lead push-token registration deletion above to be testable on-device. He's been deferring it; doesn't block the env-var work.
- **Verify the QR phone-handoff URL once deployed.** The drawer encodes `window.location.origin`. Once AFL is at a real domain, scan with iPhone, confirm AFL opens with the drawer auto-mounted. Daniel hasn't been able to test locally because his phone can't reach `localhost`.
- **Carrier-fit unshelve** — explicitly parked. Daniel's trigger to unshelve: "when you start onboarding agents who don't have the matrix memorized like you do." Not now.
- **Calendar tab** — Daniel asked about this on May 15 + 16, deferred. Roughly half a day's work; the booked chip handles 90% of the "who's booked when" cognitive load for now.
- **Welcome action item after Lead→Client convert** — Daniel hasn't end-to-end-verified that the welcome action item fires automatically after Convert. The endpoint's comment claims it flows through the same pipeline as manual Add Client; worth sanity-checking by converting a test lead and looking at the welcome action items queue.
- **Google Calendar prod redirect URI** — not yet added to the OAuth client. Required before prod deploy.
- **Lead-mode notification deferral coordination** — the mobile-side change in Task 2 should ship before any EAS update that's pointed at a build that already prompted some users. Otherwise their OS state is already set and the change is moot for them.

## Useful commands

```
# Worktree
cd /Users/danielroberts/Developer/insurance-app/.claude/worktrees/charming-satoshi-3be4cc

# Branch (local-only — DO NOT PUSH)
git status     # → claude/charming-satoshi-3be4cc, clean tree
git log --oneline -10

# Dev server (port 3001; main checkout owns 3000)
cd web && set -a && source .env.local && set +a && PORT=3001 npm run dev

# Type check
cd web && npx tsc --noEmit

# Carrier-fit archive (DO NOT unshelve without Daniel's OK)
ls web/lib/_archived-carrier-fit/
cat web/lib/_archived-carrier-fit/README.md
```

## Critical safety reminders

- **Branch is local-only.** Don't push. Don't run `./deploy.sh` or `vercel --prod`. Don't `eas update`. Daniel deploys when ready.
- **Firestore is the shared prod project** (`insurance-agent-app-6f613`). Test writes go there. Use a clearly-marked test agent uid for heavy testing.
- **`feedback_pdf_pipeline_locked.md` still applies.** The lead-form extractor is parallel-track. Don't touch `application-extractor.ts` or `ingestion-v3-pdf.ts`.
- **Carrier-fit work is archived.** Don't unshelve. Don't touch the `_archived-carrier-fit/` directories.
- Today is May 18, 2026. Daniel hasn't pushed lead mode to prod yet; that's what the feature flag work above enables.

Good luck. Daniel will read your work in a new session — make it match what he'd build himself.
