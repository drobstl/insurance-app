# Handoff — May 15, 2026 → Carrier-Fit Suggestion Engine

> **For the agent picking this up.** Daniel and I ran a long session on May 15 layering polish onto the appointment workflow (Chunk 5 Calendar OAuth shipped at the start, plus a dozen smaller items). All of that is committed. What we **didn't** finish: the carrier-fit suggestion engine driven off Daniel's underwriting cheat sheet. Context was running thin (~75%), so I deferred to a fresh session rather than half-ship it. Read this doc + the screenshots + the worktree state and you have the full handoff.

## Context inheritance

Read in order:

1. `CONTEXT.md` — source of truth for the operating model.
2. `docs/handoffs/HANDOFF_2026-05-14_to_calendar_oauth.md` — the doc that briefed me at session start. Documents Chunks 1–4f-MVP.
3. This doc.
4. `git log --oneline -5` — the three May 15 commits are the source of truth for what shipped today (`8aeb513`, `8b44cb1`, `3fabce4`).
5. Memory:
   - `feedback_match_scope_to_data.md` — Daniel will push back on overengineering. Start small.
   - `feedback_pdf_pipeline_locked.md` — extractor is parallel-track; lead-form-extractor is the only Phase-1 extractor.
   - `feedback_marketing_narrative_frame.md` — agent business outcomes, not platform mechanics.

## What shipped today (May 15, 2026)

Three commits on branch `claude/charming-satoshi-3be4cc`. **NOT pushed.** Daniel's choice: "this leads stuff" stays off prod until he's tested everything.

### `8aeb513` — Chunk 5 + lead-mode polish
- **Calendar OAuth (Chunk 5)**: full one-way sync. Connect via Settings → Profile. POST `/api/leads/[id]/appointments` mirrors to Google Calendar; PATCH/DELETE patch/delete the event. Token store at `integrations/{agentId}/google/calendar` (mirrors the existing Drive pattern — NOT on the agents doc as the original 5/14 handoff doc suggested). Endpoints under `/api/integrations/google-calendar/{auth,callback,status,disconnect,events}`. Scope: `calendar.events`. Daniel verified end-to-end works.
- **Video appointments**: phone/video mode toggle in the picker + per-agent defaults in Settings (`appointmentMode`, `defaultMeetingLink`, `autoCreateGoogleMeet`). Auto-Meet via `conferenceData.createRequest`. Lead.email + Calendar attendees so the lead gets a real calendar invite by email.
- **TZ correctness (booking)**: IANA TZ captured at booking time, anchored to the Calendar event, rendered with a short label.
- **Reschedule + Cancel** on the appointment card; mirror to Calendar with `sendUpdates=all`.
- **Day strip** in the appointment picker: GET `/api/integrations/google-calendar/events?date=&tz=` returns the day's events; picker renders a horizontal hour grid (7am-9pm) with existing events as gray bars + proposed appointment in teal; conflicts turn red.
- **Editable lead profile**: email (autosave); Tobacco + Co-borrower tri-state toggles.
- **Do-not-call outcome**: dial chip + queue filter + hard-stop on the Call button.
- **Lead → Client conversion**: POST `/api/leads/[id]/convert` creates client + mirrors + stamps `convertedToClientId`. UI confirmation modal.
- **Mobile bottom nav**: Leads replaces Settings (gear stays in top-right header).

### `8b44cb1` — Chunk 4f-extension + Chunk 3 + Patch prompt
- **Chunk 4f-extension**: `/api/cron/appointment-push-reminders` every 5 min; per-agent `reminderPushHoursBefore` (default 1, 0 disables). Push-token register extended to handle L-prefix lead codes; mobile `index.tsx` extended to register push tokens for leads (requires EAS dev rebuild to test on-device — see "Operational TODOs" below).
- **Chunk 3 lead-home videos**: `/api/lead-content/{upload,delete}` writes to `agents/{uid}/lead-content/{slot}.{ext}` with 1-year signed URLs. Settings → Profile → Lead-home videos section: intro slot + reusable FAQ/case-study lists.
- **Patch prompt**: new section 3 "Leads" + Lead Mode core concept + 9 new Q&As. Subsequent sections renumbered (4–10).

### `3fabce4` — Lead detail polish + send-flow fixes
- **Multi-phone**: `lead.phones[]` additive on legacy `phone`. Per-row Call + label dropdown (cell/home/work/other) + dial count + last outcome on the lead detail header. "+ Add another phone" inline. Call queue auto-picks least-dialed. Extractor adds `phones[]`; dial endpoint accepts `phoneDialed`.
- **Dial script overlay**: floating panel during a live call with token substitution. Default partial script in `web/lib/dial-script.ts`. Per-agent template at `agentProfile.dialScript`; edited in Settings → Profile. Auto-dismisses on outcome pick.
- **Booked-aware dismiss**: opening Book appointment while outcome prompt is showing now auto-clears the prompt on save.
- **Send-confirmation fixes**:
  - Dropped `title` from `navigator.share` (was leaking "Appointment confirmation for {lead}" into the SMS).
  - "Loading license…" indicator + Send disabled while license PDF fetches (fixes the race where Send fired and only the card got shared).
  - Web Share kept on every platform per Daniel's call. macOS share-sheet picker is the cost of one-shot recipient + body + files.
  - Desktop sms: fallback (when Web Share fails) auto-downloads card + license + shows a "Drag these in" post-send panel with Copy buttons.
- **SMS body TZ**: composeMessage now uses the **lead's state TZ** (via `web/lib/state-timezone.ts` USPS → IANA map, dominant zone for split states), not the agent's booking TZ. Calendar event + dashboard stay in agent TZ.
- **Smoke test**: runner prints `smokerStatus` + `coborrowerStatus`; 4/5 fixtures still pass (mail-in-1 baseline unchanged). Symmetry Call-In fixtures extract `coborrowerStatus: 'N'` correctly.

## What's next: Carrier-fit suggestion engine

Daniel wants AFL to auto-suggest underwriting carriers based on a lead's profile (age + tobacco + health conditions). His decision matrix is a private Google Sheet — he can't share or export it, so he screenshotted it for me. I have the full Matrix tab top-to-bottom + all 26 carrier columns.

### Why deferred

Context was at ~75% when we hit this. Building the rules table cleanly (26 carriers × dozens of rule rows + recommendation engine + UI card + lead schema extension + tests) would burn the rest of the budget with no margin for iteration. Daniel called it — A. defer to fresh session.

### The cheat sheet — what I saw

The sheet has a `Matrix` tab plus per-carrier deep-dive tabs + admin tabs. **For the engine, only the Matrix tab matters** (per-carrier tabs are reference material). The Matrix is:

**26 carrier/product columns** (top row → age range in parens):
- AMAM Express Term (18-75)
- AMAM Home Certainty Term & Express UL (20-75)
- AMAM Dignity Solutions Whole Life (50-85)
- AMAM QSFP Whole Life (50-85)
- AMAM Term Made Simple (20-75)
- Americo HMS 100, 125, CBO Term, & IUL (20-75)
- Americo Eagle Select Whole Life — 40-85 nonsmoker / 40-80 smoker
- Fidelity & Guarantee Pathsetter UL (0-80)
- Foresters Strong Foundation Term Smart UL (18-80)
- Foresters Plan Right Whole Life 50-75 (eApp) / 76-85 (in-person wet sign)
- COREBRIDGE GIWL — age unclear in screenshots, likely 45-85; verify
- COREBRIDGE SIWL — age unclear, verify
- John Hancock Term Vitality (20-60)
- LGA/Banner Life QLT Term Plus (18-75)
- MOO Critical Advantage (18-89)
- MOO Term Life Express IUL (18-75)
- MOO Living Promise Whole Life (45-85)
- National Life Group EIUL (18-85)
- SBLI EasyTrak (18-60)
- TransAmerica Super / LB Term (18-80)
- Trans America Immediate Solutions (0-85)
- TransAmerica FE Express Solution (18-85)
- TransAmerica FFIUL II Express — age unclear, verify
- UHL Simple Term (20-60)
- UHL Whole Life (20-80)
- AIG (30-80)

**Row groups visible in the matrix**:
1. Header/links: Agent Guides (URL), Carrier Website, Agent Office, Phone Number, E Apps
2. Miscellaneous Info: Declines Reported?, Docusign?, Paramed Vendors, Payments Accepted?, Phone Interview Required, Split w/Uncontracted Agent, Telesales?
3. Background Questions: Alcohol/Drug Treatment, Avocations, Citizenship, Criminal History (Felonies), Disability, Driver License/DUI, Family History, Marijuana Use, Military, Occupation, Tobacco
4. Medical Conditions (~80 rows, A-Z): Activities of Daily Living, AIDS, AIDS Related Complex, ALS, Alzheimers, Amputation, Anemia, Aneurysm, Angina, Angioplasty, Anxiety, Arrhythmia, Arthritis-Osteo, Asthma, Asthma-Steroid Inhaler, Atrial Fibrillation, Autism, Bi-Polar Disorder, Blood Clots, Brain Tumor (Non Cancerous), Bronchitis-Chronic, Cancer, Cardiomyopathy, Cerebral Palsy, Circulatory/Cardiac Surgeries, Cirrhosis of Liver, Crohns, Congestive Heart Failure, COPD, COVID-19, CPAP w/No Oxygen, CPAP w/Oxygen, Cystic Fibrosis, Defibrillator, Depression, Dementia, Diabetes (+ Gestational, Gout, Insulin, Neuropathy, Retinopathy, w/Smoking), Gabapentin, Down's Syndrome, Diverticulitis, Emphysema, Endometriosis, Epilepsy, Erectile Dysfunction, Fibromyalgia, Gallbladder Disorder, Gastric Bypass, Gout, Heart Attack/Heart Disease, Heart - Mitral Valve Insufficiency/Prolapse, Heart Surgeries (Bypass), Hepatitis, High Blood Pressure, HIV, HIV PREP, Hospitalization, Huntington's Disease, Hypothyroidism, Kidney Dialysis, Kidney Disease-Chronic, Kidney Failure, Kidney Stones, Liver Disease, Liver-Fatty Liver, Lupus, Migrane Headaches, Multiple Sclerosis, Muscular Dystrophy, Organ Transplant, Oxygen Use, Pacemaker, Pain-Chronic/Pain Pills, Pancreatitis, Paralysis, Parkinson's, Peripheral Vascular Disease, PTSD, Pulmonary Embolism, Renal Failure, Rheumatoid Arthritis, Sarcoidosis, Schizophrenia, Seizures, Scooter Use, Sickle Cell Anemia, Sleep Apnea, Stent, Stroke, Suicide Attempt, TIA, Ulcerative Colitis, Walker Use, Wheelchair Use.

**Cell content vocabulary**: ACCEPT / DECLINE / CALL CARRIER / CONDITIONAL with time-window qualifiers ("Over 2 years = ACCEPT", "Within 5 years = DECLINE", "GRADED", "PREFERRED", "STANDARD"). Green cells appear to mark recently-updated or noteworthy rules.

### Daniel can't share the sheet — only screenshot

Sheet has copy/download/print restricted by the owner. He has 9 screenshots covering the full Matrix tab (all rows + all columns). When you start, **ask Daniel to drop those screenshots into the chat again** — I can read them at full resolution. Alternative if he's willing: he opens the sheet, you connect via the Chrome MCP (claude-in-chrome) and read cells via DOM rather than image OCR. Cleaner but only if the MCP is connected.

### Recommended architecture

I sketched this with Daniel before deferring. He didn't push back on the shape.

**Schema** (`web/lib/carrier-fit-rules.ts`):

```ts
type UnderwritingOutcome = 'ACCEPT' | 'DECLINE' | 'CONDITIONAL' | 'CALL_CARRIER';

interface CarrierProduct {
  id: string;                // 'amam-express-term'
  carrier: string;           // 'AMAM'
  product: string;           // 'Express Term'
  productType: 'term' | 'whole' | 'ul' | 'iul';
  ageMin: number;
  ageMax: number;
  smokerAgeMax?: number;     // Americo Eagle Select: 80 for smokers, 85 nonsmokers
  agentGuideUrl?: string;
  rules: Record<UnderwritingCondition, RuleFn>;
}

type RuleFn = (lead: LeadUnderwriting) => { outcome: UnderwritingOutcome; note?: string };
```

**Lead underwriting fields** (extend `agents/{uid}/leads/{id}.underwriting`):

```ts
interface LeadUnderwriting {
  // Derived
  age?: number;             // from DOB or ageYears
  smoker?: 'Y' | 'N';        // from existing smokerStatus

  // Structured flags to ADD to the lead profile UI (start with these
  // ~10 high-signal ones; long-tail conditions in v2):
  diabetes?: 'none' | 'gestational' | 'oral_meds' | 'insulin';
  cancer?: 'none' | 'remission_5yr' | 'remission_2yr' | 'active';
  heartHistory?: 'none' | 'angina' | 'attack' | 'bypass' | 'stent' | 'afib';
  copd?: 'none' | 'mild' | 'severe';
  felony?: 'none' | 'over_5yr' | 'within_5yr' | 'within_2yr';
  dui?: 'none' | 'over_5yr' | 'within_5yr' | 'within_2yr';
  marijuana?: 'none' | 'recreational' | 'medical' | 'daily';
  hiv?: boolean;
  kidneyDisease?: 'none' | 'chronic' | 'dialysis' | 'failure';
  mentalHealth?: 'none' | 'mild' | 'moderate' | 'severe' | 'suicide_attempt';
}
```

**Recommendation engine**:

```ts
function recommendCarriers(lead: LeadUnderwriting): RankedRecommendation[] {
  return ALL_CARRIERS
    .map(c => evaluateCarrier(c, lead))     // applies all rules
    .filter(r => r.overall !== 'DECLINE')   // any DECLINE rule → carrier out
    .sort((a, b) => priorityScore(a) - priorityScore(b));
}
```

**UI**: a "Suggested carriers" card on the lead detail page (below the existing "From the lead form" panel). Shows top 3-5 with one-line "why this carrier" reasoning. Inline editable medical-flag toggles to refine the suggestion.

**Phasing strategy** (per `feedback_match_scope_to_data.md`):

- **Phase 1 (ship in next session)**:
  - Type definitions
  - All 26 carriers registered with age + tobacco rules only
  - 5-7 high-signal medical condition rules (cancer, heart, diabetes-insulin, COPD, HIV, dialysis, felony, marijuana, mental health w/ suicide attempt)
  - Lead profile gets the structured flags above as a new editable panel
  - Suggested-carriers card on the lead detail page
- **Phase 2** (later): transcribe the long-tail medical conditions (40+ more rows) over several sessions. Daniel can also fill rows directly in `carrier-fit-rules.ts` himself — the schema is meant to be agent-editable.

### Bundled-with-this-handoff task: lead PDF auto-archive cron

Daniel raised this alongside the carrier engine. Build it in the **same session**; it's ~100 lines and addresses a real compliance posture concern (lead PDFs hold PII — name, DOB, address, mortgage, sometimes SSN).

**Rule**: archive `lead.sourceFileUrl` after **21 days of inactivity**.

**Inactivity = none of the following in the trailing 21 days**:
- `lead.lastDialAt`
- `lead.notesUpdatedAt`
- Any appointment created / rescheduled / cancelled for the lead
- Any underwriting / phone / autosave field edited on the lead

**Hard-skip if**:
- `lead.convertedToClientId` is set (converted leads keep their PDF indefinitely — historical record).
- The lead has appointments scheduled in the future.

**Action when archiving**:
1. Delete the storage object at the path embedded in `lead.sourceFileUrl` (parse the signed URL or — better — read a separate `sourceFileStoragePath` field if it exists; if not, store the path on upload going forward).
2. Update the lead doc: set `sourceFileUrl: null` + stamp `sourceFileArchivedAt: serverTimestamp()`.
3. UI on the lead detail page shows *"Original PDF archived on {date} after 3 weeks of inactivity"* in place of the "Open original PDF →" link. Extracted fields stay — only the raw PDF is gone.

**Implementation**:
- New cron at `web/app/api/cron/lead-pdf-archive/route.ts`. Mirrors the auth pattern from `web/app/api/cron/welcome-action-item-expiry/route.ts` (CRON_SECRET bearer check).
- Daily schedule in `web/vercel.json`: `"0 8 * * *"` (8am UTC).
- Add `sourceFileStoragePath` field to the lead doc in `web/app/api/leads/upload/route.ts` so the archive cron doesn't have to re-derive it from the signed URL.
- UI tweak: lead detail page "Open original PDF" link replaced with the archived-on text when `sourceFileUrl` is null + `sourceFileArchivedAt` is set.

**Out of scope for v1**:
- Per-agent override (Settings → "Archive after N days"). Defer; default of 21 is fine.
- Notification to the agent that a PDF was archived. Defer.
- Manual "Archive this lead's PDF now" button. Defer.

### Open questions to resolve with Daniel before building

1. **Ranking priority** — when multiple carriers ACCEPT, what's the sort order? Alpha by carrier? By commission tier? By product type preference? I assumed alpha until told otherwise.
2. **CONDITIONAL display** — should "CONDITIONAL" carriers show up in the suggested list with a yellow flag, or filter out by default? My recommendation: show, with a note like "Call carrier — may accept with conditions."
3. **Verify age ranges** I marked uncertain: COREBRIDGE GIWL, COREBRIDGE SIWL, TransAmerica FFIUL II Express.
4. **Living Benefits tab** — separate sheet tab Daniel mentioned. Is that a separate concern (riders), or does it overlap with the Matrix? Probably out of scope for v1.

## Useful commands

```
# Worktree
cd /Users/danielroberts/Developer/insurance-app/.claude/worktrees/charming-satoshi-3be4cc

# Branch (local-only — DO NOT PUSH)
git status     # → claude/charming-satoshi-3be4cc, clean tree after the May 15 commits
git log --oneline -5

# Dev server (port 3001; main checkout owns 3000)
cd web && set -a && source .env.local && set +a && PORT=3001 npm run dev

# Smoke test the extractor (now prints smokerStatus + coborrowerStatus)
cd web && set -a && source .env.local && set +a && \
  node --require ./scripts/server-only-shim.cjs --import tsx ./tests/lead-corpus/run-smoke.ts
```

## Operational TODOs from this session (not blocking)

- **EAS dev build** — Daniel needs to rebuild the mobile dev client to test the lead push-token registration path (Chunk 4f-extension). Not blocking; cron currently has zero leads with valid tokens to push to.
- **Welcome action item after Lead→Client conversion** — I claimed the welcome action item triggers automatically after Convert. Daniel hasn't verified end-to-end; should sanity-check by converting a test lead and checking the welcome lane.
- **Verify Google Calendar setup is complete on Daniel's side** — He added the `calendar.events` scope + redirect URI for `localhost:3001`. Prod redirect URI (Vercel domain) NOT yet added; not blocking until prod deploy.

## Critical safety reminders

- **Branch is local-only.** Don't push. Don't run `./deploy.sh` or `vercel --prod`. Don't `eas update`.
- **Firestore is the shared prod project** (`insurance-agent-app-6f613`). Test writes go there. Use a clearly-marked test agent uid for heavy testing.
- **`feedback_pdf_pipeline_locked.md` still applies.** The lead-form extractor is parallel-track. Don't touch `application-extractor.ts` or `ingestion-v3-pdf.ts`.
- Today is May 15. Daniel runs the May 12 relaunch live for agents on a different branch. Be careful with anything that could leak to the main worktree.

Good luck. Daniel will read your work in a new session — make it match what he'd build himself.
