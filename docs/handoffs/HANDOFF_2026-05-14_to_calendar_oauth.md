# Handoff — May 14, 2026 → Google Calendar OAuth (Chunk 5)

> **For the agent picking this up.** Daniel ran a full sprint May 13–14 building lead-mode + the appointment workflow end-to-end. The conversion engine he described — dial → outcome → book → confirmation → reminder, with state-matched license attachments and per-lead attachment dedup — is shipped and tested through the dashboard. You're picking up **Chunk 5: Google Calendar OAuth one-way sync**, the last load-bearing piece of the appointment workflow. Read this doc cold and you have what you need.

## Context inheritance

Read in order:

1. `.cursorrules` if present, then `CONTEXT.md` (full file). Source of truth for the operating model. The appointment workflow lives within Phase 1 lead-mode, which is an additive surface beneath the existing welcome / retention / referral lanes — none of those were touched.
2. `~/.claude/plans/the-agentforlife-app-has-immutable-pike.md` — original lead-mode plan from May 12. Read for context on the lead-side architecture; the appointment workflow extended this scope mid-sprint and is documented here, not there.
3. This doc.
4. `git log --oneline -3` — the May 14 commit (`8203ece`) is the source of truth for what shipped today.
5. Memory:
   - `feedback_no_client_activate_skip.md` — Activate gate locked for clients; lead-mode uses a separate `/lead-login` route.
   - `feedback_pdf_pipeline_locked.md` — application-extractor + ingestion-v3-pdf NOT touched. The lead-form extractor is parallel-track.
   - `feedback_match_scope_to_data.md` — informed the "MVP first, extension later" pacing on chunks like 4f.
   - `feedback_marketing_narrative_frame.md` — agent business outcome framing throughout copy.

## What shipped today (May 14, 2026)

Single commit `8203ece` on branch `claude/charming-satoshi-3be4cc`. NOT pushed to main. Deployed Firestore rules + indexes already live (see "Operational moves" below).

### Lead mode (Chunks 1, 2)

**Dashboard side** — `/dashboard/leads`:
- New sidebar nav entry next to Clients (`web/app/dashboard/layout.tsx`).
- Slide-in Add Lead form mirroring the Clients add-flow geometry (72% + 15.25rem belt offset, 700ms cubic-bezier, opacity 0.75 on the outgoing list — see `SLIDE_TRANSITION` and `BELT_OFFSET` in `web/app/dashboard/leads/page.tsx`).
- Drop-zone PDF upload at the top of the list. Calls the lead-form extractor.
- All / Call queue tab switcher.
- Just-created banner with `derived` vs `fallback` code variants.
- Lead detail page (`web/app/dashboard/leads/[leadId]/page.tsx`) with:
  - Header: Call button + Book appointment button + lead code pill
  - Status cards (Downloaded / Assessment / Created)
  - "From the lead form" panel rendering all extracted fields with confidence badge + flag warnings + "Open original PDF" link
  - Lead profile autosave (DOB / height / weight)
  - Your notes autosave (notes + monthly mortgage amount)
  - Assessment answers section (renders when lead submits)
  - Appointments card (Chunk 4c)
  - Dial history card (Chunk 4b)
  - Activity timeline
  - Danger-zone Delete

**Mobile side** — Expo:
- `mobile/app/lead-login.tsx` — code-entry screen, accepts 10-digit phone codes OR `L`-prefix fallback codes. Linked from a small mint-colored link on `/activate` ("Got a code from your agent before your appointment?"). Numeric keypad, strips dashes/parens as you type.
- `mobile/app/lead-home.tsx` — assessment + (placeholder) videos. Follows the diagram Daniel sketched: main video → Step 1 Assessment → Step 2 FAQ row → Step 3 Case studies. Hides empty tiles gracefully.
- `mobile/components/LeadAssessment.tsx` — 10 default questions, Yes / No / Not sure, one per screen with progress bar.
- `mobile/lib/api-base.ts` — single source of truth for the dev API URL.
- `mobile/app/index.tsx` extended: `accessType: 'lead'` branch routes to `/lead-home`, skips push registration for leads.

**Server side**:
- `web/lib/lead-code-derive.ts` — phone-as-code helper. The agent's pitch is *"your code is your phone number"* (Daniel's call after seeing that PDF-extracted forms list age not DOB).
- `web/lib/lead-code-generator.ts` — random `L…` fallback for collisions.
- `web/lib/lead-code-lookup.ts` — mirror of `client-code-lookup.ts` against `leadCodes/`.
- `web/lib/lead-form-extractor.ts` — **single Claude vision call** that classifies form template + extracts fields in one shot. Handles all three templates (Mail-In handwritten, Call-In Symmetry, Digital Lighthouse) via the `formType` enum in the JSON schema. **Important deviation from the original plan**: the plan called for three separate per-template extractor modules; we built one. Same accuracy, one-third the surface area.
- `web/app/api/leads/{create,upload,[leadId],[leadId]/dials,[leadId]/appointments}` — full CRUD.
- `web/app/api/mobile/lookup-client-code/route.ts` — added `L`-prefix + 10-digit-numeric branch returning `accessType: 'lead'`.
- `web/app/api/mobile/{lead-assessment,lead-content}` — assessment write + content manifest read.

**Test fixtures** — `web/tests/lead-corpus/fixtures/{mail-in-1,2,3.pdf, call-in-1.pdf, digital-1.pdf}` — 5 real lead-form PDFs Daniel provided. Smoke test at `web/tests/lead-corpus/run-smoke.ts`. **4/5 pass**; mail-in-1 fails extraction but correctly self-flags low confidence — the agent-verification path handles it.

Run smoke test:
```
cd web && set -a && source .env.local && set +a && \
  node --require ./scripts/server-only-shim.cjs --import tsx ./tests/lead-corpus/run-smoke.ts
```

### Appointment workflow (Chunks 4b, 4c, 4d, 4e, 4f-MVP)

**4b — Dialer + dial tracking + call queue:**
- `tel:` deep link from lead detail page + queue rows (US-only — raw digits, no `+1` prefix).
- Outcome chips: `no_answer` / `left_vm` / `wrong_number` / `not_interested` / `callback_requested` / `booked`.
- `lead.dialLog: Array<{at, outcome, notes?}>` + denormalized `lastDialAt` / `lastDialOutcome` for queue sorting.
- Call queue priority: never-dialed > overdue (cooldown by outcome: callback 4h, no_answer 24h, voicemail 48h). Filters out converted / booked / not-interested / wrong-number.
- Inline outcome chips on queue rows for ripping through dials in sequence.
- Endpoint: `POST /api/leads/[leadId]/dials`.

**4c — Appointment picker + storage:**
- `agents/{agentId}/appointments/{apptId}` (top-level under agent, NOT nested under lead — so the eventual cron in Chunk 4f-extension can scan one subcollection).
- Schema in `web/lib/appointments.ts`. Status: `scheduled` | `completed` | `cancelled` | `no_show`.
- `web/components/AppointmentPicker.tsx` — modal with date / time (defaults to next half-hour 1+ hour out) / duration chips / notes.
- Picker submit atomically creates appointment + logs `booked` dial outcome via `POST /api/leads/[leadId]/appointments`.
- "Book appointment" standalone button on lead detail header (so booking works without going through the dial flow first).
- Appointments card on lead detail page — splits past/future visually, status badges, sentConfirmationAt + sentReminderAt indicators.
- Firestore composite indexes deployed: `appointments(leadId, scheduledAt DESC)` + `appointments(status, scheduledAt ASC)`.
- Endpoints: `POST /api/leads/[leadId]/appointments`, `PATCH /api/appointments/[apptId]`, `DELETE /api/appointments/[apptId]`.

**4d — Multi-state license uploads:**
- Settings → Profile → "State Licenses" section (`web/components/StateLicensesSection.tsx`).
- One PDF + license number + expiration per state. State dropdown filters out already-uploaded.
- "Expired" badge when expiration is past.
- View PDF via signed URL (1-year TTL).
- Schema: `agents/{uid}.licenses: { [stateCode]: { number, expiresOn, pdfStoragePath, uploadedAt } }`. Added to `AgentProfile` interface in DashboardContext (and `fetchProfile` was missing the field copy — fixed).
- Helper `getLicenseForState(agentId, stateCode)` in `web/lib/agent-licenses.ts` — used by 4e dispatch.
- Endpoints: `POST /api/agent-licenses/upload`, `GET /api/agent-licenses/[stateCode]` (signed URL), `PATCH /api/agent-licenses/[stateCode]` (metadata-only renewal), `DELETE /api/agent-licenses/[stateCode]`.

**4e — Booking confirmation flow:**
- `web/components/SendConfirmationDrawer.tsx` — opens automatically right after a booking, also reachable from "Send confirmation" button on appointment cards.
- Locked template via `composeMessage` in `web/lib/booking-confirmation.ts`. Two `kind` modes:
  - `'confirmation'`: *"Hi {first}. Just a reminder of our appointment for {dayOfWeek} at {time} to discuss Mortgage Protection options. Looking forward to speaking with you. - {agentFirst}"*
  - `'reminder'`: *"Hi {first}, quick reminder of our appointment today at {time} to discuss Mortgage Protection options. Looking forward to it. - {agentFirst}"*
- State-matched license attachment via `getLicenseForState`. Drawer shows the matched license + lets agent override the state if PDF extraction got it wrong or lead was manually entered.
- Channel: **Web Share API with files first** (iOS Safari 15+, Android Chrome — opens system share sheet with files + body queued), **`sms:` deep-link fallback** (desktop, lacking Web Share file support).
- Linq pooled line is **deliberately NOT used** (per Daniel's CONTEXT.md concern about new-conversation cap + send/reply ratio at 30 leads/wk × 2 messages each).
- Stamps `appointment.sentConfirmationAt` on agent's intent to send.
- Endpoint: `POST /api/appointments/[apptId]/confirmation-sent`.

**4f-MVP — Reminder surface:**
- `web/components/UpcomingAppointmentsCard.tsx` at the TOP of `/dashboard/action-items` (above the existing welcome/anniversary/retention/referral lane tabs).
- Live-queries appointments where `status==scheduled` + `sentReminderAt` null + scheduledAt in next 24h.
- "Send reminder" button reuses SendConfirmationDrawer in `kind: 'reminder'` mode.
- Stamps `appointment.sentReminderAt`.
- Endpoint: `POST /api/appointments/[apptId]/reminder-sent`.
- **Deliberate non-integration with action-items lane system**: adding a 5th lane to the locked `ActionItemLane` union would touch ~7 files of carefully-versioned schema for what's structurally a different surface ("upcoming appointments" vs "things needing personal reach-out"). The card surface coexists peacefully without that plumbing.

**Attachment dedup (Daniel's late-session ask):**
- `lead.attachmentsSent: { businessCardAt?, licensesByState?: { [state]: ISO } }`.
- Drawer reads this, hides files already sent in the share payload, surfaces "already on file with this lead — won't re-attach" copy.
- Both stamp endpoints (`/confirmation-sent` and `/reminder-sent`) accept `{ attachedBusinessCard, attachedLicenseState }` body and update the lead doc.
- Per-state granularity for licenses (matters if a lead's state changes or agent picks a different one for a re-send).

### Operational moves today

- **Firestore rules deployed** twice via `firebase deploy --only firestore:rules`:
  - First deploy added `agents/{agentId}/leads`, `agents/{agentId}/leadActivity`, `leadCodes/{code}` rules.
  - Second deploy added `agents/{agentId}/appointments`.
- **Firestore indexes deployed** via `firebase deploy --only firestore:indexes`:
  - `appointments(leadId ASC, scheduledAt DESC)` for the lead-detail-page appointments query.
  - `appointments(status ASC, scheduledAt ASC)` for the future cron + the upcoming-appointments card.
- **No mobile OTA, no Vercel deploy.** Branch is local-only. Daniel said *"we need to keep this to ourselves and test it first"* — that's still the rule.

### What was NOT done today (and why)

- **Chunk 4f-extension** — cron job + push to app-downloaders + per-agent reminder timing config. Daniel deferred to keep momentum. The MVP card surface ships value without it.
- **Chunk 5 — Google Calendar OAuth one-way sync** — that's YOU.
- **Chunk 3 — per-agent video uploads + GCF transcode** — lead-home is functional but visually hollow on the video tiles. Daniel deprioritized below the appointment workflow.
- **Lead → client conversion** — the original plan deferred this; never built. When the agent closes a sale, they currently have to manually re-create the lead as a client.
- **Patch (AI assistant) prompt update** — should mention lead-mode + the new `/dashboard/leads` page. Currently Patch doesn't know leads exist. Low priority.
- **Mobile dev client build** — Expo Go doesn't load AFL because of native firebase modules. Daniel needs an EAS dev build (or full Xcode install) to test mobile changes on his phone. Was discussed but never built. The dashboard side has been the main test surface.

## What's next: Chunk 5 — Google Calendar OAuth one-way sync (~1.5 days)

### Why this next

Daniel asked explicitly during the May 13 design discussion: *"i think a and b would be good to build. agents need to see their whole calendar not just their AFL calendar."* Layer (a) — local appointment storage — is done (Chunk 4c). Layer (b) — push to Google Calendar via OAuth — is what this chunk delivers. Once it ships, the appointment workflow loop is complete: agent's calendar app of choice (Google Calendar, anything that syncs from it) shows the AFL appointment with native device reminders alongside everything else.

### Spec

**OAuth flow:**
- Settings → Profile gets a new "Calendar Sync" section.
- "Connect Google Calendar" button kicks off Google OAuth (scope: `https://www.googleapis.com/auth/calendar.events` — write events, read own events).
- On callback, store the agent's refresh token + access token expiry on `agents/{agentId}.googleCalendar: { connectedEmail, refreshToken, accessToken, accessTokenExpiry, calendarId }`.
- "Disconnect" button revokes + clears.
- AFL existing infrastructure note: there's already Google Drive OAuth in the codebase (`web/lib/google-drive-store.ts`, `web/lib/google-oauth.ts`). Read those first — most of the OAuth machinery (token refresh, error handling) can be reused or factored.

**Event creation:**
- When an appointment is created (in `POST /api/leads/[leadId]/appointments`) AND the agent has Calendar connected, also create a Google Calendar event:
  - Title: `{leadName} — Mortgage Protection appointment`
  - Description: lead phone + appointment notes + a link back to the AFL lead detail page
  - Start: `appointment.scheduledAt`
  - End: start + `appointment.durationMinutes`
  - Reminders: defaults (Google Calendar's own native — popup 30 min before, etc.)
  - Store the returned Google event ID on the appointment doc as `googleEventId` for future updates.
- When an appointment is updated (PATCH endpoint) — reschedule, change duration, change status — also patch the Google event.
- When an appointment is deleted/cancelled — delete the Google event.

**One-way only.** Don't read from Google Calendar (no double-booking detection in this chunk; that's option C in the original spec, deferred per Daniel).

**Failure handling.** If Google API call fails, the appointment write succeeds anyway and we surface a non-blocking warning — the local appointment is the source of truth.

### Files to touch / create

- `web/app/api/oauth/google-calendar/callback/route.ts` — OAuth redirect handler, mirroring the Google Drive pattern.
- `web/app/api/oauth/google-calendar/connect/route.ts` — initiates OAuth flow.
- `web/app/api/oauth/google-calendar/disconnect/route.ts` — revoke + clear stored tokens.
- `web/lib/google-calendar.ts` — wrapper around Google Calendar API. Reuse token-refresh helpers from `web/lib/google-oauth.ts` if they're general enough.
- `web/components/CalendarSyncSection.tsx` — settings UI panel (mirrors the existing Google Drive section pattern).
- Modify `web/app/api/leads/[leadId]/appointments/route.ts` — after writing the appointment, also create the Google event (best-effort, non-blocking).
- Modify `web/app/api/appointments/[apptId]/route.ts` — PATCH and DELETE also touch the Google event.
- Extend `AgentProfile` in `web/app/dashboard/DashboardContext.tsx` with `googleCalendar` field.
- Add the section import + render to `web/app/dashboard/settings/page.tsx` Profile tab.

### Environment variables needed

- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` likely already present (used by Drive integration). Verify.
- `GOOGLE_OAUTH_REDIRECT_URI_CALENDAR` — new redirect for the calendar flow. Has to be added to the Google Cloud Console OAuth client's allowed redirects too.

### Verification

End-to-end test:
1. Settings → Profile → connect Google Calendar (Daniel's daniel@crosswindsfg.com).
2. Book a test appointment with a lead.
3. Check Daniel's Google Calendar in another tab — event should appear within ~5 sec with the right title, time, and notes.
4. PATCH the appointment (reschedule or change duration) via the existing API or UI — Google event updates.
5. Cancel the appointment (PATCH status='cancelled') — Google event deletes.
6. Disconnect → reconnect — flow round-trips cleanly.

## Useful commands

```
# From repo root: dev server (port 3001 because main checkout uses 3000)
cd web && set -a && source .env.local && set +a && npm run dev

# Worktree path
cd /Users/danielroberts/Developer/insurance-app/.claude/worktrees/charming-satoshi-3be4cc

# Branch
git status   # → claude/charming-satoshi-3be4cc
git log --oneline -5
```

## Critical safety reminders

- **Branch is local-only.** Don't push to main without Daniel's explicit OK. Don't run `./deploy.sh` or `vercel --prod`. Don't run `eas update` (that OTAs to live AFL users).
- **Firestore is the single shared prod project** (`insurance-agent-app-6f613`). Test writes go there. Use a clearly-marked test agent uid for any heavy testing.
- **`feedback_pdf_pipeline_locked.md` still applies.** The lead-form extractor is deliberately parallel-track. Don't touch `application-extractor.ts` or `ingestion-v3-pdf.ts`.
- Today is May 14. The May 12 relaunch shipped on May 11 (the Daniel Roberts canonical handoff). Agents are using AFL daily — be careful with anything affecting existing flows.

Good luck. Daniel will read your work in a new session — make it match what he'd build himself.
