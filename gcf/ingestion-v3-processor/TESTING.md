# Extraction pipeline - manual smoke test checklist

This is the pre-deploy checklist for any change that touches application
extraction. Run through it before `firebase deploy --only functions:ingestionv3`
any time you have modified:

- `src/carrier-prompt-supplements.ts` (any supplement, or the file itself)
- `src/index.ts` (the generic prompt, `CARRIER_FORM_TYPE_OVERRIDES`, normalization, or schema)
- `../../web/lib/pdf/application-page-map.ts` (PAGE_MAP entries)
- `../../web/lib/pdf/render-selected-pages-to-jpeg.ts` (render scale, quality, or strict/tolerant modes)
- `../../web/app/dashboard/clients/page.tsx` (`APPLICATION_TYPE_OPTIONS`, `SHORT_FORM_CARRIER_FORM_TYPES`, or the `parseApplicationFile` path)

## Where the reference PDFs live

`~/Developer/insurance-app-fixtures/` (on Daniel's laptop, NOT in the repo -
they contain real customer PII). One subfolder per `carrierFormType` plus an
`unknown/` folder for the fallback path.

## How to run the checklist

1. Deploy to production (or run the Cloud Function locally via emulator).
2. Open the AgentForLife web dashboard, go to `/dashboard/clients`, click "Add
   Client".
3. For each fixture row below:
   - Pick the dropdown option listed in the "Dropdown label" column.
   - Upload the PDF from the fixture folder.
   - Wait for the extraction job to finish (review_ready).
   - Compare the review card's values against the "Expected values" column.
   - Check the box at left if every expected value matches.
4. Any row with a mismatch = DO NOT deploy. Fix the regression first.
5. Delete the test clients from the dashboard once you're done so they don't
   pollute the real client list.

## Fixture rows

### Banner / LGA (ICC17-LIA)

Dropdown label: **Banner/LGA - Term**  •  Form type: `banner_lga_icc17_lia`

- [ ] **`Jordan Wittmaier - Banner Beyond Term 30.pdf`** (11-page short-form variant, Banner brand)
  - insuredName: `Jordan Wittmaier`
  - insuredDateOfBirth: `2003-10-17`
  - coverageAmount: `135000`
  - planOfInsurance: `BeyondTerm 30`
  - insuranceCompany: `Banner Life`
  - policyType: `Term Life`
  - applicationSignedDate: `2026-04-15`
  - primary beneficiaries: `Victoria Wittmaier 50% Parent` + `Nathan Wittmaier 50% Parent`
  - review_ready: true

- [ ] **`Paree Gatewood - Banner Beyond Term 30.pdf`** (20-page Part 1 + Part 2 variant, Banner brand)
  - insuredName: `Paree Gatewood`
  - insuredDateOfBirth: `1990-03-29`
  - coverageAmount: `246000`
  - planOfInsurance: `BeyondTerm 30`
  - insuranceCompany: `Banner Life`
  - policyType: `Term Life`
  - applicationSignedDate: `2026-02-10`
  - primary beneficiary: `Dana Burton 100% Aunt`
  - review_ready: true

- [ ] **`Vijay Teetheram - LGA Quility Term Plus 15.pdf`** (30-page full bundled variant, LGA brand)
  - insuredName: `Vijayakumar Teertham`
  - insuredDateOfBirth: `1979-08-30`
  - coverageAmount: `295000`
  - planOfInsurance: `Quility Term Plus 15`
  - insuranceCompany: `Banner Life` (NOT "LGA" or "Legal & General America" - both brands roll up to Banner Life)
  - policyType: `Term Life`
  - applicationSignedDate: `2025-11-05`
  - primary beneficiary: `Harathi Bethu 100% Spouse`
  - review_ready: true

### Americo Term / CBO (ICC18-5160)

Dropdown label: **Americo - Term or CBO**  •  Form type: `americo_icc18_5160`

- [ ] **`Kyle Bodnar - Americo CBO 100 copy.pdf`** (image-only PDF - expected values captured from dashboard review card)
  - insuredName: `Kyle Bodnar`
  - insuredPhone: `(216) 688-6505`
  - insuredEmail: `dorismg1218@gmail.com`
  - insuredDateOfBirth: `1994-01-25`
  - coverageAmount: `200000` (NOTE: filename says "CBO 100" but coverage is $200k - filename is not authoritative)
  - insuranceCompany: `Americo`
  - policyType: `Term Life`
  - policyNumber: `AM02296011` (from Bank Draft page)
  - premiumAmount: `105.67`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2025-02-02`
  - effectiveDate: `2025-02-02` (fallback from signed date)
  - primary beneficiary: `Doris Bodnar` (Spouse)
  - review_ready: true

- [ ] **`Nicole Price - Americo Term 125.pdf`** (image-only PDF - expected values from review card)
  - insuredName: `Nicole M Price`
  - insuredPhone: `(636) 543-5458`
  - insuredEmail: `nicole.price618@yahoo.com`
  - insuredDateOfBirth: `1994-06-18`
  - coverageAmount: `137000` (filename says "125" but actual is $137k)
  - insuranceCompany: `Americo`
  - policyType: `Term Life`
  - policyNumber: `AM02927613`
  - premiumAmount: `44.73`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2025-12-23`
  - effectiveDate: `2025-12-23` (fallback from signed date)
  - primary beneficiary: `Megan Hurtgen` (Sibling)
  - review_ready: true

### Americo IUL (ICC18-5160-IUL)

Dropdown label: **Americo - IUL**  •  Form type: `americo_icc18_5160_iul`

- [ ] **`Robin Howard - Americo IUL.pdf`** (PDF too large to read directly; expected values captured from dashboard review card)
  - insuredName: `Robin Howard`
  - insuredPhone: `(636) 697-8933`
  - insuredEmail: `romitchell41580@gmail.com`
  - insuredDateOfBirth: `1980-04-15`
  - coverageAmount: `75000`
  - insuranceCompany: `Americo`
  - policyType: `IUL`
  - policyNumber: `AM02854798`
  - premiumAmount: `52.11`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2025-11-18`
  - effectiveDate: `2025-11-18` (fallback from signed date)
  - primary beneficiary: `Kevin Howard` (Spouse, 100%)
  - review_ready: true

### Americo Whole Life / Eagle Select (ICC24-5426)

Dropdown label: **Americo - Whole Life**  •  Form type: `americo_icc24_5426`

- [ ] **`Bert Alderman Americo FE copy.pdf`** (image-only PDF - expected values from review card)
  - insuredName: `Bert Alderman`
  - insuredPhone: `(417) 437-9151`
  - insuredEmail: `Bert.alderman@icloud.com`
  - insuredDateOfBirth: `1959-07-24`
  - coverageAmount: `5400` (unusually low face amount for a Final Expense Whole Life; matches what's on the form)
  - insuranceCompany: `Americo`
  - policyType: `Whole Life`
  - policyNumber: `AM02573494`
  - premiumAmount: `30.99`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2025-12-23`
  - effectiveDate: `2025-12-23` (fallback from signed date)
  - primary beneficiary: `Mackenzie Tuggle` (Grandchild, 100%)
  - review_ready: true

### American-Amicable Mortgage Protection (ICC15-AA9466)

Dropdown label: **American-Amicable - Mortgage Protection**  •  Form type: `amam_icc15_aa9466`

- [ ] **`Tim Davidson - AmAm Dignity Solutions ROP.pdf`** (8-page variant with Bank Draft on page 5)
  - insuredName: `Tim D Davidson`
  - insuredDateOfBirth: `1966-05-31`
  - coverageAmount: `20000`
  - planOfInsurance: `Dignity Solutions ROP` (form header says "Final Expense" but product is sold as Mortgage Protection)
  - insuranceCompany: `American-Amicable`
  - policyType: `Mortgage Protection` (NOT Whole Life / Final Expense)
  - premiumAmount: `123.22`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2024-11-12` (not the 7:30:39 PM timestamp; date portion only)
  - effectiveDate: `null` (form says "On Approval" - supplement rule returns null, pipeline fallback fills from signed date)
  - primary beneficiary: `Chandra M Conner` (Life Partner, DOB 1975-02-02 per addendum, no percentage shown - treat as 100%)
  - policyNumber: `null` (M-numbers like M2174733 are internal tracking IDs, NOT policy numbers)
  - review_ready: true

### American-Amicable Term (ICC18-AA3487)

Dropdown label: **American-Amicable - Term**  •  Form type: `amam_icc18_aa3487`

- [ ] **`Edwin Moman - AmAm Term.pdf`** (11-page ICC18-AA3487 Home Certainty variant)
  - insuredName: `Edwin N Moman`
  - insuredDateOfBirth: `1964-06-27`
  - coverageAmount: `191000` (Face Amount on Image 1; Conditional Receipt cap shown as $191,250)
  - planOfInsurance: `Home Certainty 10X`
  - insuranceCompany: `American-Amicable`
  - policyType: `Term Life`
  - premiumAmount: `239.50`
  - premiumFrequency: `monthly` (Bank MON)
  - applicationSignedDate: `2026-01-22` (date portion of "1/22/2026 8:13:01 PM")
  - effectiveDate: `null` (Requested Policy Date = "On Approval"; supplement returns null, fallback fills from signed date)
  - primary beneficiary: `Alan Wade Moman` (Brother; addendum provides name, no DOB/SSN)
  - policyNumber: `null` (M3166549 is the internal application tracking number, NOT a policy number)
  - review_ready: true

### Foresters Term Life (ICC15-770825)

Dropdown label: **Foresters - Term Life**  •  Form type: `foresters_icc15_770825`

- [ ] **`Brenda Henry - Foresters 83k copy.pdf`** (27-page Foresters Term packet; ICC19 770839 cover + ICC15 770825 application + mental health / heart questionnaires + ADB disclosure)
  - insuredName: `Brenda Henry` (Product Details cover on Image 1)
  - insuredDateOfBirth: `1965-01-07`
  - coverageAmount: `83000` (Image 1 "Amount of life insurance applied for on the proposed insured: $" field; authoritative over anything else)
  - planOfInsurance: `Strong Foundation Term Life 30 Year` (Non-medical, 30-year term checkbox)
  - insuranceCompany: `Foresters` (short form; NOT "The Independent Order of Foresters")
  - policyType: `Term Life`
  - premiumAmount: `189.97` (from Image 5 TIA block: "First premium payment, in the amount of $189.97")
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2025-12-10` (Image 6 "signed in AL on Dec 10, 2025")
  - effectiveDate: `null` (Foresters has no explicit effective date; fallback fills from signed date)
  - primary beneficiary: the Beneficiary grid on Image 3 lists "Brenda N Henry" as primary (Child, 100%). This is almost certainly an application fill error - the beneficiary name matches the insured. Extraction should still return whatever Claude reads; agent corrects downstream.
  - policyNumber: `null` (the UUID `e898a5ca-...` on footer is an internal session identifier)
  - review_ready: true

### Mutual of Omaha Term Life / IUL Express (ICC22L683A)

Dropdown label: **Mutual of Omaha - Term Life Express / IUL Express**  •  Form type: `moo_icc22_l683a`

Same physical form covers Term Life Express AND IUL Express - the supplement derives `policyType` from the checked plan box. Ideally fixture this with ONE of each variant.

- [ ] **`Danny Clifton MOO Term 30 App copy.pdf`** (Term Life Express variant - 30-Year Level Term box checked)
  - insuredName: `Danny Clifton`
  - insuredDateOfBirth: `1998-10-10`
  - coverageAmount: `250000`
  - planOfInsurance: `30-Year Level Term Life` (Term Life Express Amount of Insurance Applied for field populated)
  - insuranceCompany: `Mutual of Omaha` (NOT "United of Omaha" even though the agreement text references United of Omaha Life Insurance Company)
  - policyType: `Term Life` (derived from the checked 30-Year Level Term box, NOT "IUL")
  - premiumAmount: `50.29`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2024-11-16` (date portion of "11/16/2024 at 23:33:49 GMT" on Page 4)
  - effectiveDate: `null` (MOO assigns post-issuance; pipeline fallback fills from signed date)
  - primary beneficiary: `Shianna Anderson` (Spouse, 100%, DOB 2001-12-01)
  - policyNumber: `null` (AIS BU4972695 is an internal tracking identifier)
  - review_ready: true

- [ ] IUL Express sample - **SAMPLE PDF PENDING** - add when next MOO IUL sale closes.

### Mutual of Omaha Living Promise (ICC23L681A)

Dropdown label: **Mutual of Omaha - Living Promise**  •  Form type: `moo_icc23_l681a`

- [ ] **`Vickie Besozzi MOO Final Expense.pdf`** (Living Promise Level Benefit Product; filename says "Final Expense" because Living Promise is MOO's FE product)
  - insuredName: `Vickie Besozzi`
  - insuredDateOfBirth: `1953-10-04`
  - coverageAmount: `50000`
  - planOfInsurance: `Level Benefit Product` (Level box checked on Image 2)
  - insuranceCompany: `Mutual of Omaha`
  - policyType: `Whole Life`
  - premiumAmount: `268.20`
  - premiumFrequency: `monthly` (Bank Draft)
  - applicationSignedDate: `2024-12-17` (date portion of "12/17/2024 at 19:44:25 GMT")
  - effectiveDate: `null` (fallback fills from signed date)
  - primary beneficiary: `Doug Besozzi` (Child; NOTE: unlike the supplement's usual claim that "beneficiary grid is not on pages 1-3", THIS variant DOES have a beneficiary on the form — accept whatever Claude returns)
  - policyNumber: `null` (AIS BU5020888 is an internal tracking identifier)
  - review_ready: true

### Mutual of Omaha Accidental Death (MA5981)

Dropdown label: **Mutual of Omaha - Accidental Death**  •  Form type: `moo_ma5981`

- [ ] **`Lindsay Klaric - MOO Accidental copy.pdf`** (MA5981 standalone Accidental Death)
  - insuredName: `Lindsay Klaric`
  - insuredDateOfBirth: `1981-02-15`
  - coverageAmount: `75000` (Accidental Death Insurance Benefit Amount in Section B)
  - planOfInsurance: `Individual` (Type of Plan)
  - insuranceCompany: `Mutual of Omaha`
  - policyType: `Accidental`
  - premiumAmount: `12.75`
  - premiumFrequency: `monthly` (Monthly Bank Service Plan / BSP)
  - applicationSignedDate: `2025-09-25` (date portion of "09/25/2025 at 02:30:55 GMT")
  - effectiveDate: `null` (fallback fills from signed date)
  - primary beneficiary: `Myles Klaric` (Child, 100%)
  - policyNumber: `null` (UUID `aa20000f-...` is internal)
  - review_ready: true

### "Other Carrier" fallback path (unknown form type)

Dropdown label: **Other Carrier**  •  Form type: `unknown`

This path is critical: it's what agents use for any carrier we don't have a supplement for. The pipeline falls through to the generic prompt with no carrier supplement, no PAGE_MAP (renderer uses first 6 pages, capped), and no deterministic override. The expectation is NOT perfect extraction - the agent will fix things in the UI - but the pipeline MUST NOT crash, must return review_ready with at least insuredName + coverageAmount + policyType, and the carrier name should be whatever Claude reads from the page (agent corrects if wrong).

- [ ] **`Daxton Bryant - MOO Child WL copy.pdf`** (Mutual of Omaha Children's Whole Life, form ICC17L663A - not yet a supported form type. Expected values on the real form: insured Daxton Bryant DOB 2017-09-23, coverage $15,000, Owner Wanda Bryant (Grandparent, DOB 1960-11-26), premium $7.65 monthly Bank Service Plan, signed 2025-02-20 Clayton AL.)
  - Pipeline completes without error: YES
  - review_ready: true
  - insuredName populated: `Daxton Bryant`
  - coverageAmount populated: `15000`
  - policyType: read from form - should be `Whole Life` (Claude will infer from "Children's Whole Life Insurance" header)
  - insuranceCompany: `Mutual of Omaha` (may come back as "United of Omaha" from legal text — either is acceptable on the unknown path since agent reviews)

- [ ] **`Donald Nauert - Corebridge.pdf`** (Corebridge Financial / American General Life Guaranteed Issue Whole Life, form ICC15-108847 - not yet supported. Expected: Donald Morley Nauert DOB 1963-11-20, coverage $12,000 Graded Death Benefit GI WL, premium $94.70 monthly Bank Draft, primary beneficiary Kelly Nauert Spouse 100%, signed 2025-11-12 Morley MO.)
  - Pipeline completes without error: YES
  - review_ready: true
  - insuredName populated: `Donald Morley Nauert` (or "Donald Nauert")
  - coverageAmount populated: `12000`
  - policyType: `Whole Life` (Guaranteed Issue Whole Life with Graded Death Benefit)
  - insuranceCompany: expected to come back as something like `American General Life` or `Corebridge` or `AIG` — any of those is acceptable on unknown path

- [ ] **`Kimber Jones UHL Term 20 DLX copy.pdf`** (United Home Life Simple Term 20 DLX, form ICC22 200-878A - not yet supported. Expected: Kimber Jones DOB 1996-10-11, coverage $50,000, premium $43.93 monthly EFT, primary beneficiary John Hull (Fiance) 100%, signed 2025-08-23 Clinton MO.)
  - Pipeline completes without error: YES
  - review_ready: true
  - insuredName populated: `Kimber Jones`
  - coverageAmount populated: `50000`
  - policyType: `Term Life`
  - insuranceCompany: expected `United Home Life` or `UHL`

- [ ] **`Shianna Anderson UHL Term DLX copy.pdf`** (United Home Life Simple Term 20 DLX - same form as Kimber, different insured. Expected: Shianna Anderson DOB 2001-12-01, coverage $50,000, premium $28.14 monthly EFT, primary beneficiary Danny Clifton (Husband) 100%, signed 2024-11-15 Fredericktown MO.)
  - Pipeline completes without error: YES
  - review_ready: true
  - insuredName populated: `Shianna Anderson`
  - coverageAmount populated: `50000`
  - policyType: `Term Life`
  - insuranceCompany: expected `United Home Life` or `UHL`

- [ ] **`Francis Hanson AIG.pdf`** (Corebridge/AIG Guaranteed Issue Whole Life Graded Death Benefit, form ICC15-108847. Cleaner replacement for Tim fixture.)
  - Pipeline completes without error: YES
  - review_ready: true
  - insuredName populated: `Francis Hanson`
  - insuredDateOfBirth: `1947-07-19`
  - coverageAmount populated: `12000`
  - premiumAmount: `260.01`
  - premiumFrequency: `monthly`
  - applicationSignedDate: `2025-02-18`
  - primary beneficiary: `Patricia Hanson` (Spouse, 100%)
  - policyType: `Whole Life`
  - insuranceCompany: expected `American General Life` / `Corebridge` / `AIG`

## When a fixture fails

1. Note which fixture(s) failed and which fields were wrong (screenshot the review card).
2. Do NOT deploy.
3. Diagnose:
   - Wrong field on ONE carrier only? → likely a supplement bug or PAGE_MAP bug for that carrier.
   - Wrong field on MULTIPLE carriers? → likely a generic prompt bug, normalizer bug, or schema bug.
   - review_ready=false on a carrier that used to pass? → supplement told Claude to return null for a field that `evaluateCompleteness` requires.
   - Pipeline error / throw? → check the Cloud Function logs (`firebase functions:log --only ingestionv3:processIngestionV3Queued`).
4. Fix, redeploy to staging if available, re-run the failing fixture.
5. Once green again, re-run the full checklist (a fix for carrier A can regress carrier B).

## Adding new fixtures

1. Drop the PDF into the appropriate `~/Developer/insurance-app-fixtures/<carrier_form_type>/` subfolder.
2. Upload it via the dashboard once with the right dropdown selection. Verify the extraction manually against the source PDF.
3. Add a new checkbox row above with filename + expected values.
4. Commit the updated `TESTING.md`.

## Refreshing expected values

If an intentional prompt/normalizer change alters field shape (e.g. we decide
phone numbers should now include country code), the expected values in this
file need to change in the same commit. That way the reviewer sees "yes, the
expected values are changing, that's the point" and can sanity check.

Never edit an expected value to match a buggy extraction result - that defeats
the whole point of the checklist.

## Known issues / fixtures to revisit

### Brenda Henry (Foresters) - beneficiary is valid, not a form error
The beneficiary "Brenda N Henry" is the insured's daughter (same first name),
so this is a valid beneficiary entry and should NOT be treated as bad data.

### Tim Olwin (Corebridge/AIG, unknown path) - optional edge-case only
The Tim fixture has "New Carlisle" (a city) in the Middle Initial field and is
now replaced in the main checklist by `Francis Hanson AIG.pdf`. Keep Tim only
as an optional resilience check for malformed applications.

### MOO Living Promise supplement - confirmed incorrect re: beneficiary grid
The current `moo_icc23_l681a` supplement in
`src/carrier-prompt-supplements.ts` says:
> "The primary ICC23L681A application pages (1-3) do NOT include a beneficiary
> grid. Return an empty array or null for beneficiaries..."

This rule is WRONG. Investigation of 5 separate MOO Living Promise
applications confirms the Beneficiary grid is present and populated on
PDF page 5 (the 3rd image in PAGE_MAP [3,4,5]) on every sample, located in
the "BENEFICIARY (If more space is needed, list on a separate sheet)"
section below the Authorization/Agreement:

| Insured | Primary Beneficiary | Relationship | Contingent |
|---|---|---|---|
| Vickie Besozzi | Doug Besozzi | Child | — |
| Leslie Nitteberg | Roy Harison | Sibling | — |
| Kelly Nauert | Donald Nauert | Spouse/Civil Union Partner | Elizabeth Carey (Child) |
| James Drennan | Tori Epperson | Domestic Partner | — |
| Gary Tucker | Sabrina Williams | Child | — |

5 out of 5 have a populated beneficiary. The "return empty array" rule is
making the Cloud Function miss a real field in production. This is a live bug,
not just a fixture quirk.

FIX: update the supplement's beneficiary rule to something like:
"extract the Primary (and Contingent if present) beneficiary from the
Beneficiary section on the 3rd image. Capture name, relationship, and DOB
when written. Only return empty array if the section is actually blank."

IMPACT when fixed: every production MOO Living Promise job going forward will
have the primary beneficiary name extracted. Historical jobs already in
Firestore won't be backfilled; agents would need to edit those manually.
Re-test all three current MOO fixtures (Vickie, Danny Clifton for Term,
Lindsay for MA5981) after the change.

### Danny Clifton (MOO Term Life Express) - insuranceCompany override test
The MOO application body repeatedly uses "United of Omaha Life Insurance
Company" (the legal subsidiary name) while we want Claude to return
"Mutual of Omaha" (the parent brand the override forces). This fixture is
specifically useful for verifying the `CARRIER_FORM_TYPE_OVERRIDES` post-
extraction override is working: even if Claude returns "United of Omaha" from
the page text, the Cloud Function's override should rewrite it to
"Mutual of Omaha" before Firestore write. If that assertion fails, check the
override block around lines 200-240 of `src/index.ts`.

### Kyle Bodnar & Nicole Price - filename coverage doesn't match actual coverage
Both filenames include a number ("CBO 100", "Term 125") that does NOT match
the actual face amount on the form (200000 and 137000 respectively).
Filenames are not authoritative - always trust the extracted value. No action
required, just don't mistake the filename digit for the coverage.
