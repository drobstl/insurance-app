# Archived: Carrier-fit engine + build charts

Parked 2026-05-17. Not currently wired into the app — the underwriting
profile card + suggested carriers card were removed from the lead
detail page. Agents capture any extra med / health info in the lead's
`notes` field instead.

PDF extraction is **unchanged** — `dateOfBirth`, `gender`, `smokerStatus`,
`coborrowerStatus`, `heightText`, `weightLbs`, etc. are still extracted
and stored on the lead doc as before. The underwriting work parked here
is the *consumer* of that data (ranking + build-chart lookup + medical-
flag UI), not the producer.

## What's here

| File | What it does |
|---|---|
| `carrier-fit-rules.ts` | 28 `CarrierProduct` entries with age + smoker + medical-flag rules, ranking algorithm (`recommendCarriers`), tobacco quirk notes, schema for `LeadUnderwriting` (10 structured medical flags). |
| `carrier-build-charts.ts` | Height/weight build charts for 12 products: SBLI EasyTrak, UHL Term + Whole Life, Banner QLT, AMAM Express + Home Certainty, Americo HMS, Foresters Strong Foundation + Plan Right, F&G Pathsetter (sex-aware + age-bump), MOO TLE + Living Promise + Critical Advantage. Schema supports per-sex columns + age-band weight bumps. |
| `../../components/_archived-carrier-fit/CarrierFitPanel.tsx` | Self-contained two-card UI (Underwriting profile + Suggested carriers) with feature-flag, autosave to `lead.underwriting.*`, and build-chart line per recommendation. |
| `../../scripts/_archived-carrier-fit/strip-lead-underwriting.ts` | Dry-run-by-default cleanup script that wipes `lead.underwriting` subdocs from Firestore. Still useful if you want to clean up data that was written during testing — run as `npx tsx scripts/_archived-carrier-fit/strip-lead-underwriting.ts --apply` from `web/`. |

## To restore

Five minute restore:

1. `git mv web/lib/_archived-carrier-fit/carrier-fit-rules.ts web/lib/`
2. `git mv web/lib/_archived-carrier-fit/carrier-build-charts.ts web/lib/`
3. `git mv web/components/_archived-carrier-fit/CarrierFitPanel.tsx web/components/`
4. (Optional) `git mv web/scripts/_archived-carrier-fit/strip-lead-underwriting.ts web/scripts/`
5. Re-add to `web/app/dashboard/leads/[leadId]/page.tsx`:
   - Import block:
     ```ts
     import CarrierFitPanel from '../../../../components/CarrierFitPanel';
     import type { LeadUnderwriting } from '../../../../lib/carrier-fit-rules';
     ```
   - Lead interface field:
     ```ts
     underwriting?: Partial<LeadUnderwriting>;
     ```
   - JSX block (above the "Your notes" card):
     ```tsx
     {user && (
       <CarrierFitPanel
         agentUid={user.uid}
         leadId={lead.id}
         dateOfBirth={lead.dateOfBirth}
         ageYears={lead.ageYears}
         smokerStatus={lead.smokerStatus}
         heightText={lead.heightText}
         weightLbs={lead.weightLbs}
         gender={lead.gender}
         underwriting={lead.underwriting}
       />
     )}
     ```
6. Remove the `**/_archived-*/**` entry from `tsconfig.json`'s `exclude` if you want type-checking to cover archived files in place during the restore.

## Provenance

The carrier-fit work was built over the May 15–17 sessions. Source of
truth for rules + build charts is the Quility Underwriting Cheat Sheet
(Google Sheet `1fbx_Mb4mk7vAD9WpxRjcBzipQ_-ccBCOEbZZxNcrlXU`).

The 12 build charts that were transcribed are the most numerically-
verified parts. The 28 carrier rules engine is structurally complete
but the per-condition medical rules are scoped to ~10 high-signal flags
(cancer, heart, diabetes, COPD, HIV, kidney, felony, DUI, marijuana,
mental health). Long-tail medical conditions (~80 rows in the cheat
sheet's Matrix tab) were deliberately deferred — Daniel can extend
either file directly when restoring.
