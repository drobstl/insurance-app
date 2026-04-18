"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARRIER_PROMPT_SUPPLEMENTS = void 0;
exports.CARRIER_PROMPT_SUPPLEMENTS = {
    // PAGE_MAP: [1, 2, 5, 7, 8] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 5, Image 4 = page 7 (when present), Image 5 = page 8 (when present)
    // If PAGE_MAP changes for this form type, update image references below.
    americo_icc18_5160: `CARRIER-SPECIFIC GUIDANCE - Americo ICC18 5160 (Term / CBO)
You are receiving 3 or 5 images depending on the application length. Full 9-page applications include a Bank Draft Authorization (Image 4) and a Premium Conditional Receipt (Image 5); short-form 5-page applications omit both and you will receive only 3 images.

Image 1: Insured information (Section 1) and product details (Section 2).
Image 2: Beneficiaries (Section 4) and policy owner (Section 5).
Image 3: Signature and signed date (Section 9).
Image 4 (when present): Bank Draft Authorization - extract the policy/application number from the "Policy Number(s)" field in the top-right under Owner Information. If that field is blank, return policyNumber as null.
Image 5 (when present): Premium Conditional Receipt (form AAA8482). Extract the date written next to "on (Month/Day/Year)" near the top of the page and return it as effectiveDate in YYYY-MM-DD format. If that date field is blank, return effectiveDate as null.

WARNINGS:
- State: use ONLY the state from the mailing address (field 5). Do NOT use field 13 (Place of Birth) - it is a different value.
- If Section 5 (Owner) is blank or matches the insured, return policyOwner as null.
- If only 3 images are supplied (short-form application with no Bank Draft page), return policyNumber as null.
- If only 3 images are supplied (short-form application with no Premium Conditional Receipt page), return effectiveDate as null.`,
    // PAGE_MAP: [1, 2, 5, 21, 22] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 5, Image 4 = page 21, Image 5 = page 22
    // If PAGE_MAP changes for this form type, update image references below.
    americo_icc18_5160_iul: `CARRIER-SPECIFIC GUIDANCE - Americo ICC18 5160 IUL (Indexed Universal Life)
You are receiving 5 images.

Image 1: Insured information (Section 1) and product details (Section 2).
Image 2: Beneficiaries (Section 4) and policy owner (Section 5).
Image 3: Signature and signed date (Section 9).
Image 4: Bank Draft Authorization - extract the policy/application number from the "Policy Number(s)" field near the top.
Image 5: Conditional Receipt - if the signed date on Image 3 is blank, extract the date from this page (next to "on (Month/Day/Year)") and use it as the applicationSignedDate.

WARNINGS:
- State: use ONLY the state from the mailing address (field 5). Do NOT use field 13 (Place of Birth) - it is a different value.
- If Section 5 (Owner) is blank or matches the insured, return policyOwner as null.`,
    // PAGE_MAP: [1, 2, 3, 4, 5] -> Images 1-5 = pages 1-5 sequentially
    // If PAGE_MAP changes for this form type, update image references below.
    americo_icc24_5426: `CARRIER-SPECIFIC GUIDANCE - Americo ICC24 5426 (Whole Life / Eagle Select)
You are receiving 5 images. Images 1 and 2 are the application form. Images 3-5 may include supplemental applications, rider disclosures, a Bank Draft Authorization, and/or an Agent's Report.

Images 1-2 (application):
- Image 1: Insured information (Section A), policy owner (Section B), beneficiaries (Section C), and product details (Section D).
- Image 2: Signature and signed date (Section G).

Bank Draft Authorization (scan Images 3-5):
- One of these images will be a Bank Draft Authorization form with "Bank Draft Authorization" in the header and an AF55019 form number. Extract the policy number from the "Policy Number(s)" field near the top of that form.
- If no Bank Draft Authorization is found, return policyNumber as null.

WARNINGS:
- State: use ONLY the state from the address in Section A (field 5a). Do NOT use field 8 (Place of Birth) - it is a different value.
- If Section B (Owner) indicates the insured is the owner, return policyOwner as null.
- Ignore supplemental applications, rider disclosures, and Agent's Report pages - they do not contain fields we need to extract.`,
    // PAGE_MAP: [1, 2, 4, 5, 6] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 4, Image 4 = page 5, Image 5 = page 6 (when present)
    // The 8-page variant is missing page 6, so you may receive only 4 images. The extended-addendum variant shifts the Bank Draft from page 5 to page 6.
    // If PAGE_MAP changes for this form type, update image references below.
    amam_icc15_aa9466: `CARRIER-SPECIFIC GUIDANCE - American-Amicable ICC15-AA9466 (Final Expense / Dignity Solutions, sold as Mortgage Protection)
You are receiving 4 or 5 images. The form header says "Final Expense / Dignity Solutions" but this product is sold as Mortgage Protection - always classify policyType accordingly.

Image 1 (page 1): Main application. Contains insured info, DOB, mailing address, SSN, primary beneficiary, plan, face amount, premium mode, modal premium, tobacco, physician, existing insurance, health questions.
Image 2 (page 2): Signatures page. Contains child coverage, agreement, signatures, agent report, preauth bank info, application date, signed city/state.
Image 3 (page 4): Addendum (page 1 of addendum). May contain multi-beneficiary details.
Images 4-5 (pages 5 and 6 when present): Bank Draft Authorization (form AA9903) and/or the second page of an extended addendum, plus HIPAA release / rider disclosure pages. The Bank Draft appears on page 5 in most applications but shifts to page 6 when the addendum spans 2 pages. Image 5 is absent in 8-page variants.

FIELD RULES:
- insuredName, insuredDateOfBirth, insuredPhone, insuredEmail, insuredState: extract from Image 1 only.
- insuredState: use ONLY the state from the mailing address row (City / State / Zip). Do NOT use "State of Birth" (the field below DOB) - it is a different value.
- coverageAmount: extract from the "Face Amount of Insurance $" field on Image 1 as a plain number (e.g. 250000, not "$250,000").
- premiumAmount: the modal premium on Image 1 as a plain number.
- premiumFrequency: derive from the premium mode checkboxes on Image 1 (monthly/quarterly/semi-annual/annual).
- beneficiaries: extract from Image 1 in the normal case. BUT if Image 1's primary beneficiary field reads "Multi Bene - See Addendum", "Multiple Beneficiaries", "See Addendum", or similar placeholder text, extract the actual beneficiary names, relationships, and percentages from the Addendum (Image 3, and Image 4 if the addendum spans two pages). Do NOT return the placeholder string as a beneficiary name.
- applicationSignedDate: extract from the "Date of Application" field on Image 2. The value may be a full timestamp like "9/13/2025 6:39:05 PM" - return YYYY-MM-DD only (drop the time component).
- effectiveDate: extract from the "Requested Policy Date" field on Image 1 (located next to the Mode / Modal Premium section). Return YYYY-MM-DD if a real date is written (e.g. "10/17/2024" -> "2024-10-17"). If the field contains "On Approval", "Upon Approval", is blank, is struck through, or contains any non-date text, return null. Do NOT substitute the signed date here; downstream pipeline logic handles the fallback.
- policyType: ALWAYS return exactly "Mortgage Protection". Do not return "Whole Life" or "Final Expense" even though the form header mentions them.
- insuranceCompany: ALWAYS return exactly "American-Amicable" (short form). Do NOT return the long form "American-Amicable Life Insurance Company of Texas", and do NOT return "AMAM".
- policyOwner: if not explicitly shown as a person other than the insured, return null.

HARD RULES - ALWAYS RETURN NULL:
- policyNumber: ALWAYS return null. This form has no policy number at application time. The "M-number" at the top right of Image 1 (e.g. M3352695) is an internal application tracking number, NOT a policy number - do not return it. The Bank Draft page has routing and account numbers but no policy number field.

BANK DRAFT GUARDRAIL:
- A qualifying Bank Draft page MUST have BOTH the header text "Bank Draft Authorization" AND the form number "AA9903". Only that page is the Bank Draft.
- Do NOT extract any values from the HIPAA release, rider disclosures, COVID addendum, or Conditional Receipt. If none of Images 4-5 is a qualifying Bank Draft page (e.g. in an 8-page variant), that is acceptable - the schema has no bank fields. The point of this rule is to prevent routing/account digits or other numbers from non-Bank-Draft pages from ever being returned as policyNumber.`,
    // PAGE_MAP: [1, 2, 4, 5] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 4, Image 4 = page 5
    // This supplement unifies two AMAM term products that share the same extraction rules but
    // differ in layout: ICC18-AA3487 "Home Certainty" (11 pages, primary) and the legacy
    // ICC17-AA3413 "Express Term" (9 pages, rare). Form number on Image 1 identifies which.
    // If PAGE_MAP changes for this form type, update image references below.
    amam_icc18_aa3487: `CARRIER-SPECIFIC GUIDANCE - American-Amicable Term (Home Certainty ICC18-AA3487 and Express Term ICC17-AA3413)
You are receiving 4 images from one of two American-Amicable term application layouts. Identify which by reading the form number printed on Image 1:
- "Form No. ICC18-AA3487" = HOME CERTAINTY (11-page application, primary). Plan name is "Home Certainty 10X" or "Home Certainty 20X".
- "Form No. ICC17-AA3413" = EXPRESS TERM (9-page application, legacy/rare). Plan name is "Express Term 10" or similar. Header says "EXPRESS TERM" instead of "HOME CERTAINTY".

Both layouts extract into the same schema; the rules below apply to both unless called out.

IMAGE MAPPING:
- Image 1 (page 1): Main application. Contains insured info, DOB, mailing address, phone, email, SSN, DL#, height/weight, primary beneficiary, plan name, face amount, premium mode, modal premium, Requested Policy Date, tobacco, and Section A health questions.
- Image 2 (page 2): Signatures page. Contains agreement text, signature lines, "Date of Application" field, signed city/state, and Agent's Report. On Express Term (ICC17-AA3413) ONLY, page 2 also contains an embedded "PREAUTHORIZATION CHECK PLAN - AUTHORIZATION TO HONOR CHARGE DRAWN" block with bank routing/account info - treat this as non-extractable (see BANK GUARDRAIL).
- Image 3 (page 4): Addendum. Contains Drivers License details, comments, agent info, and beneficiary details (DOB/SSN/relationship when available).
- Image 4 (page 5): For Home Certainty, this is the Bank Draft Authorization page (form AA9903). For Express Term, this is the HIPAA release (form AA9526). Neither page yields extractable fields - see BANK GUARDRAIL.

FIELD RULES:
- insuredName: concatenate the three name columns (First, Middle, Last) with single spaces, dropping the Middle segment if blank. Middle may be a single initial (e.g. "L"), a single word (e.g. "N"), a compound like "Chad Harrison", or absent. Strip any trailing "X" checkbox marks.
- insuredDateOfBirth: from page 1. Return YYYY-MM-DD.
- insuredPhone: from page 1.
- insuredEmail: from the Email field on page 1. If the field literally contains "None", "N/A", "none", or is blank (case-insensitive), return null. Do NOT return the literal filler text.
- insuredState: use ONLY the state from the mailing address row (City / State / Zip) on page 1. Do NOT use "State of Birth" (the field next to DOB) - it is a different value.
- coverageAmount: from the "Face Amount" field on page 1 as a plain number (e.g. 300000, not "$300,000").
- premiumAmount: the modal premium ("Modal Prem $") on page 1 as a plain number.
- premiumFrequency: derive from the Mode checkboxes on page 1. Text hints like "Bank MON" or "Dir MON" indicate monthly but the authoritative signal is the checked box (Monthly/Quarterly/Semi-Annual/Annual).
- beneficiaries: extract BOTH primary AND contingent when either is present. For each, capture the name, relationship (Spouse/Son/Daughter/Brother/Fiance/etc.), and - when the Addendum (Image 3) provides them - DOB and SSN. If page 1's primary beneficiary field reads "Multi Bene - See Addendum", "Multiple Beneficiaries", "See Addendum", or similar placeholder text, pull the actual beneficiaries from the Addendum (Image 3). Do NOT return placeholder strings as beneficiary names.
- applicationSignedDate: extract from the "Date of Application" field on Image 2. The value may be a full timestamp like "12/9/2025 6:42:33 PM" - return YYYY-MM-DD only (drop the time component).
- effectiveDate: extract from the "Requested Policy Date" field on Image 1 (located near the Mode / Modal Premium section). Return YYYY-MM-DD if a real date is written (e.g. "10/17/2024" -> "2024-10-17"). If the field contains "On Approval", "Upon Approval", is blank, is struck through, or contains any non-date text, return null. Do NOT substitute the signed date here; downstream pipeline logic handles the fallback.
- policyType: ALWAYS return exactly "Term Life". Both Home Certainty and Express Term are term life products.
- insuranceCompany: ALWAYS return exactly "American-Amicable" (short form). Do NOT return the long form "American-Amicable Life Insurance Company of Texas", and do NOT return "AMAM".
- policyOwner: if Owner / Payor fields are blank or identify the insured as the owner, return null.

HARD RULES - ALWAYS RETURN NULL:
- policyNumber: ALWAYS return null. This form has no policy number at application time. The "M-number" at the top right of Image 1 (e.g. M3066723, M3166549, M2746508, M2140015) is an internal application tracking number, NOT a policy number - do not return it.

BANK GUARDRAIL:
- Do NOT extract any values from the Bank Draft Authorization page (AA9903, Home Certainty page 5) or from the "PREAUTHORIZATION CHECK PLAN" block embedded on page 2 of Express Term. Routing and account numbers are never policy numbers.
- Do NOT extract any values from the HIPAA release, rider disclosures, Conditional Receipt, or COVID addendum pages. These exist in both layouts and contain no fields the schema cares about.`,
    // PAGE_MAP: [1, 2, 3, 8, 9, 10] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 3, Image 4 = page 8, Image 5 = page 9, Image 6 = page 10
    // Foresters Term Life packet: ICC19 770839 Product Details cover (page 1) + ICC15 770825 Application pages 1-9 (PDF pages 2-10).
    // Total PDF length varies 17-24 pages (optional questionnaires, overflow, HIPAA, Electronic Delivery, eSignature Data Page),
    // but pages 1-10 are always present and deterministic. Everything after page 10 is ignored.
    // If PAGE_MAP changes for this form type, update image references below.
    foresters_icc15_770825: `CARRIER-SPECIFIC GUIDANCE - Foresters Term Life (ICC19 770839 cover + ICC15 770825 Application)
You are receiving 6 images from a Foresters Term Life application packet. The packet is a two-form stack: a one-page Product Details cover (form ICC19 770839 US 12/19) followed by a 9-page Individual Life Insurance Application (form ICC15 770825 US 10/15). Any further pages in the PDF (TIA Agreement, Notices, ADB Rider Disclosure, HIPAA release, questionnaires, Producer Report, Electronic Delivery, eSignature Data Page) are NOT sent to you.

IMAGE MAPPING:
- Image 1 (PDF page 1, form ICC19 770839): Product Details cover. Header reads "Foresters Term Life". Contains "Amount of life insurance applied for on the proposed insured: $ ____", plan type checkboxes ("Non-medical - Strong Foundation Term Life" vs "Medical - Your Term Life"), Term length checkboxes (10/15/20/25/30 year), rider amounts (Accidental death $, Children's term $, Waiver of premium checkbox), Charity Benefit Beneficiary Designation, and the Proposed Insured first/middle/last name.
- Image 2 (PDF page 2, App Page 1 of 9): Proposed Insured block (name, gender, street address / city / state / zip, SSN, home phone, alternate/cell phone, DOB, state & country of birth, US citizen, photo ID, occupation & duties, income, full/part time, military, Foresters member, email, primary language) AND the Owner block (complete only if owner is a different person than the insured).
- Image 3 (PDF page 3, App Page 2 of 9): Beneficiary grid with a Primary section (up to 5 rows) and a Contingent section (up to 3 rows). Each row has Name, Address, DOB, Relationship to proposed insured, Beneficiary Type (Revocable / Irrevocable), and % Share.
- Image 4 (PDF page 8, App Page 7 of 9): Payment Information and Authorization. Contains "Payment mode" checkboxes (Monthly / Quarterly / Semi-annually / Annually), First/Subsequent premium payment method, Preferred draft date, and PAC banking information (financial institution name, routing, account). Ignore the bank info - it contains no policy number.
- Image 5 (PDF page 9, App Page 8 of 9): Declarations and Agreements, TIA Questions & Acknowledgement. This is the ONLY page on the application where the modal premium DOLLAR AMOUNT is written, and only when TIA is accepted. Look for the line "First premium payment, in the amount of $ ______, is authorized, provided or collected by" inside the "Yes. I, the owner, understand that temporary coverage is subject to..." block. If the TIA "No" checkbox / owner's initials are present instead (declining temporary coverage), the dollar field will be blank - return premiumAmount as null.
- Image 6 (PDF page 10, App Page 9 of 9): Signature Section. Contains the signed state and signed date on the line "The owner or the proposed insured, if the proposed insured is the owner, signed in ____ (State) on ____ (mmm/dd/yyyy)." Also contains the Producer Certification with producer name and number.

FIELD RULES:
- insuredName: concatenate the three name columns from Image 1 (First, Middle, Last) on the "Product Details" cover with single spaces, dropping the Middle segment if blank. Cross-check against the name on Image 2 if needed. Middle may be a single initial (e.g. "M", "W", "L") or absent. Strip any trailing "X" checkbox marks. Do NOT return a beneficiary name.
- insuredDateOfBirth: from Image 2 "Date of birth (mmm/dd/yyyy)" in the Proposed Insured block. Return YYYY-MM-DD. Example: "Jul 14, 2001" -> "2001-07-14".
- insuredPhone: from Image 2 Proposed Insured block. Prefer the "Alternate phone/Cell #" if both home and alternate are filled; otherwise use whichever is present. Format as a 10-digit string or standard "(xxx) xxx-xxxx".
- insuredEmail: from Image 2 "Email" field in the Proposed Insured block. This field is OFTEN BLANK on Foresters applications even when the insured has an email - in that case return null. Do NOT substitute the producer's email or any other email. The agent will fill it in manually downstream.
- insuredState: use ONLY the state from the mailing address row (Street address / City / State / Zip) in the Proposed Insured block on Image 2. Do NOT use "State & Country of birth" (the field immediately below) - it is a different value. Return the 2-letter state abbreviation.
- coverageAmount: extract from Image 1 "Amount of life insurance applied for on the proposed insured: $ ____" as a plain number (e.g. 251000, not "$251,000"). This is the authoritative face amount for this form.
- premiumFrequency: derive from the "Payment mode" checkbox on Image 4. Map "Monthly" -> "monthly", "Quarterly" -> "quarterly", "Semi-annually" -> "semi-annual", "Annually" -> "annual".
- premiumAmount: extract from the "First premium payment, in the amount of $ ______" field on Image 5 (inside the TIA "Yes" acknowledgement block) as a plain number. If the TIA "No" option is selected instead (owner's initials appear next to the "No" line), the dollar field will be blank - return null in that case.
- beneficiaries: extract ALL rows that have a name filled in from Image 3. Primary rows are in the "Primary" section (top), contingent rows are in the "Contingent" section (bottom). For each row, capture name, relationship (Spouse-married / Parent / Sibling / Child / Fiance / etc. exactly as written), percentage (from the % Share column), and type ("primary" or "contingent"). If "Irrevocable" is checked, set irrevocable=true; if "Revocable" is checked or neither is checked, set irrevocable=false.
- applicationSignedDate: from Image 6 Signature Section, the line "signed in (State) on (mmm/dd/yyyy)". Convert to YYYY-MM-DD. Example: "Jan 13, 2026" -> "2026-01-13". If the date is written only as part of the producer's signature block, use that.
- policyType: ALWAYS return exactly "Term Life". This packet is only used for Foresters Term Life products ("Strong Foundation Term Life" non-medical or "Your Term Life" medical - both are Term Life).
- insuranceCompany: ALWAYS return exactly "Foresters" (short name). Do NOT return "The Independent Order of Foresters", "Foresters Financial", or "Foresters Life".
- policyOwner: if the Owner section on Image 2 is blank, return null. If the Owner section is filled but the Owner name/SSN/DOB matches the Insured (a known fill error on this form where the applicant accidentally duplicated their own info into the Owner block), ALSO return null. Only return a value when the Owner is clearly a distinct person from the insured.
- effectiveDate: ALWAYS return null. This form has no explicit effective/policy date field; downstream pipeline logic backfills this from applicationSignedDate.

HARD RULES - ALWAYS RETURN NULL:
- policyNumber: ALWAYS return null. Foresters does not assign a policy or certificate number at application time. The UUID-like string visible at the bottom/footer of most pages (e.g. "f23dfaa5-f47d-4922-89b8-2ed478a0f87c") is an internal session/tracking hash, NOT a policy number - do not return it.

BANK GUARDRAIL:
- Do NOT extract any values from the PAC banking information on Image 4 (routing number, account number, financial institution name) as a policy number. Bank-related fields have no policy number on this form.`,
    // PAGE_MAP: [4, 5, 7, 8] -> Image 1 = PDF page 4, Image 2 = PDF page 5, Image 3 = PDF page 7, Image 4 = PDF page 8 (when present)
    // Mutual of Omaha Term Life Express and IUL Express share the same ICC22L683A application form (18 pages total).
    // PDF pages 1-3 are Consent / HIPAA / MIB Pre-Notice, pages 4-7 are the 4-page application proper, page 8 is the
    // overflow page, pages 9-10 are Producer's Report + Producer Statement, pages 11-14 are ADB Rider Disclosure,
    // page 15 is Bank Draft (Payment Authorization Form), pages 16-17 are Conditional Receipt, page 18 is eSignature Data Page.
    // The Bank Draft has NO policy number and the Conditional Receipt has NO effective date - MOO assigns both post-issuance.
    // If PAGE_MAP changes for this form type, update image references below.
    moo_icc22_l683a: `CARRIER-SPECIFIC GUIDANCE - Mutual of Omaha ICC22L683A (Term Life Express and IUL Express)
You are receiving 3 or 4 images from a Mutual of Omaha Individual Life Insurance Application (form ICC22L683A). The same physical form is used for both Term Life Express (10/15/20/30-Year Level Term) and Indexed Universal Life Express - the checkboxes in the "Plan Information" section identify which.

IMAGE MAPPING:
- Image 1 (PDF page 4, App Page 1): "INDIVIDUAL LIFE INSURANCE APPLICATION" header with "ICC22L683A PLEASE SUBMIT ALL PAGES 1" at the top. Contains Proposed Insured block (First Name / MI / Last Name / Suffix / SSN / Gender / Height / Weight / Home Address / State of Birth / DOB / Phone / Best Time to Call / Annual Income / Email / Driver's License / Occupation / Employer / U.S. Citizen / Tobacco), Plan Information (Term Life checkboxes, Term Riders, Permanent Life IUL checkboxes), and Premium Information (Premium Method, Frequency, Modal Premium, Collected Premium, Name & Address of Payor).
- Image 2 (PDF page 5, App Page 2): "ICC22L683A PLEASE SUBMIT ALL PAGES 2" at the top. Contains Beneficiary block (Primary + Contingent with % of Proceeds, Relationship, DOB), Other Coverage Information questions, Comments, and the Owner block (Complete Policyowner Information if Proposed Insured is not the Policyowner).
- Image 3 (PDF page 7, App Page 4): "ICC22L683A PLEASE SUBMIT ALL PAGES 4" at the top. Contains Underwriting questions 8-10, Authorization and Agreement text, and the SIGNATURE section: "Signed at: ________ City _______ State ____ Date _________". Also contains the signature of the Proposed Insured and any Applicant/Owner/Trustee. This is the page that carries the authoritative signed city, signed state, and applicationSignedDate.
- Image 4 (PDF page 8, when present): Overflow page. Contains supplemental answers (e.g. employment status, supplemental health questions), the Producer Contact Information block (Office Phone Number, Email Address), and miscellaneous addenda. Extraction-wise this page is secondary - use it only to cross-check / fill in the producer's contact info if needed. Do NOT extract applicationSignedDate from timestamps printed here; the authoritative date is on Image 3.

FIELD RULES:
- insuredName: concatenate First Name, MI, Last Name, Suffix from Image 1 with single spaces; drop MI/Suffix if blank.
- insuredDateOfBirth: from the "Date of Birth" field in the Proposed Insured block on Image 1. Return YYYY-MM-DD.
- insuredPhone: from the "Phone Number" field on Image 1.
- insuredEmail: from the "E-mail" field on Image 1. If blank, return null.
- insuredState: use ONLY the state from the Home Address row (Street / Apt / City / State / ZIP) on Image 1. Do NOT use "State of Birth" (the field next to DOB) - it is a different value.
- coverageAmount: extract the value written in the checked plan's "Amount of Insurance Applied for" field on Image 1. For Term Life Express, the field is labeled "Term Life Express Amount of Insurance Applied for $________"; for IUL Express, the field is labeled "Indexed Universal Life Express Amount of Insurance Applied for $________". Return a plain number (e.g. 198000, not "$198,000"). If both appear to have values, prefer whichever plan box is checked; if neither is obvious, use whichever number is written.
- premiumAmount: the "Modal Premium $________" value in Premium Information on Image 1, as a plain number.
- premiumFrequency: from the "Frequency of Modal Premium" checkboxes on Image 1. Map "Monthly" -> "monthly", "Annual" -> "annual", "Semi-Annual" -> "semi-annual", "Quarterly" -> "quarterly".
- policyType: derive from the Plan Information checkboxes on Image 1. Return EXACTLY one of "Term Life" or "IUL":
  - If any of "30-Year Level Term Life", "20-Year Level Term Life", "15-Year Level Term Life", "10-Year Level Term Life" is checked, OR the "Term Life Express Amount of Insurance Applied for" field has a value, return "Term Life".
  - If "Indexed Universal Life Express" is checked OR the "Indexed Universal Life Express Amount of Insurance Applied for" field has a value, return "IUL" (not "Indexed Universal Life").
  - If both appear marked, prefer whichever has a populated Amount field.
- insuranceCompany: ALWAYS return exactly "Mutual of Omaha". Do NOT return "United of Omaha", "United of Omaha Life Insurance Company", or any variant.
- beneficiaries: from Image 2 Beneficiary block. Capture primary and contingent beneficiaries when either is present, including name, relationship to insured, DOB, and % of proceeds. Mark type as "primary" or "contingent" accordingly.
- policyOwner: from the Owner block on Image 2. If that block is blank or matches the insured, return null. Only return a value when a distinct Owner name is written.
- applicationSignedDate: from the "Signed at City / State / Date" line on Image 3 in the Authorization and Agreement section. The date is what was written or eSigned on the application; return YYYY-MM-DD. If the date appears in a full timestamp format like "11/20/2025 at 22:37:27 GMT", return just "2025-11-20".

HARD RULES - ALWAYS RETURN NULL:
- policyNumber: ALWAYS return null. Mutual of Omaha does not assign a policy number at application time - the policy number is generated at issue. The "AIS BU#######" string visible on footer/pages is an internal application session identifier, NOT a policy number. The UUID-like string at the bottom of Image 1 (e.g. "12f84f31-69f8-4cfc-8f58-a73f8894f073") is an internal session hash, NOT a policy number.
- effectiveDate: ALWAYS return null. This form has no explicit effective/policy date field on the application itself; downstream pipeline logic backfills this from applicationSignedDate.

WARNINGS:
- Image count varies: you may receive 3 or 4 images. If Image 4 (overflow) is absent, do not invent employment/producer fields.
- Do NOT pull any values from Bank Draft pages, Conditional Receipt pages, or ADB Rider Disclosure pages - none of those are sent to you, but if they ever appear, they contain no fields we need.`,
    // PAGE_MAP: [3, 4, 5] -> Image 1 = PDF page 3, Image 2 = PDF page 4, Image 3 = PDF page 5
    // Mutual of Omaha Living Promise (Level Benefit Product or Graded Benefit Product) uses the ICC23L681A application.
    // Total PDF length varies (13-15 pages seen in samples) depending on whether the packet includes overflow, ADB Rider
    // disclosure, and/or Bank Draft pages. PDF pages 1-2 are Consent / MIB Pre-Notice; pages 3-5 are the 3-page application
    // proper; everything after page 5 is signatures acknowledgements, ADB disclosure, optional overflow, and Bank Draft.
    // If PAGE_MAP changes for this form type, update image references below.
    moo_icc23_l681a: `CARRIER-SPECIFIC GUIDANCE - Mutual of Omaha ICC23L681A (Living Promise - Level Benefit and Graded Benefit)
You are receiving 3 images from a Mutual of Omaha Living Promise whole life application (form ICC23L681A). The same physical form is used for both the Level Benefit Product and the Graded Benefit Product - which one applies is determined by the health questions in Parts One and Two and confirmed by the "Plan" checkbox on Image 2.

IMAGE MAPPING:
- Image 1 (PDF page 3, App Page 1): "INDIVIDUAL LIFE INSURANCE APPLICATION" with "ICC23L681A PLEASE SUBMIT ALL PAGES 1" at the top. Contains Proposed Insured block (First Name / MI / Last Name / Suffix / Gender / Height / Weight / SSN / Home Address / State of Birth / DOB / Phone No. / Email / Driver's License / US citizen / Tobacco), Owner block (Complete only if Owner/Applicant is different from Proposed Insured), and Underwriting Part One (questions 1-5) - the eligibility knockout questions.
- Image 2 (PDF page 4, App Page 2): "ICC23L681A PLEASE SUBMIT ALL PAGES 2" at the top. Contains the rest of Underwriting (questions 6-11, including Part Two which determines Level vs Graded eligibility), Optional Comments, Plan Information ("Q Level Benefit Product" / "Q Graded Benefit Product" with "Amount Applied For $ ______" and "Rider: Q Accidental Death Rider" only if Level), and Premium Information (Premium Method, Frequency, Modal Premium, Collected Premium, Payor info).
- Image 3 (PDF page 5, App Page 3): Signature page. Contains Authorization text, Agreement text, Fraud Warning, and the line "Signed at: __________ City ___ State ___ Date __________" with the signature of the Proposed Insured. This is the authoritative page for signed city, signed state, and applicationSignedDate.

FIELD RULES:
- insuredName: concatenate First Name, MI, Last Name, Suffix from Image 1 with single spaces; drop MI/Suffix if blank.
- insuredDateOfBirth: from the "Date of Birth" field in the Proposed Insured block on Image 1. Return YYYY-MM-DD.
- insuredPhone: from the "Phone No." field on Image 1.
- insuredEmail: from the "E-mail" field on Image 1. If blank, return null.
- insuredState: use ONLY the state from the Home Address row (Street / Apt / City / State / Zip) on Image 1. Do NOT use "State of Birth" (the field labeled "State of Birth") - it is a different value.
- coverageAmount: extract the value from "Amount Applied For $ ________" in the Plan Information section on Image 2. Return a plain number (e.g. 20000, not "$20,000").
- premiumAmount: the "Modal Premium $________" value in the Premium Information section on Image 2, as a plain number.
- premiumFrequency: from the "Frequency of Modal Premium" checkboxes on Image 2. Map "Monthly" -> "monthly", "Annual" -> "annual", "Semi-Annual" -> "semi-annual", "Quarterly" -> "quarterly".
- policyType: ALWAYS return exactly "Whole Life". Both the Level Benefit Product and Graded Benefit Product are Whole Life products - the Level-vs-Graded distinction is captured by other fields downstream, but policyType itself is always "Whole Life".
- insuranceCompany: ALWAYS return exactly "Mutual of Omaha". Do NOT return "United of Omaha", "United of Omaha Life Insurance Company", or any other variant.
- policyOwner: from the Owner block on Image 1. If that block is blank, the instructions above it say "Complete only if Owner/Applicant is different from Proposed Insured" - return null when blank. If a different person is clearly named as Owner, return that name.
- beneficiaries: the primary ICC23L681A application pages (1-3) do NOT include a beneficiary grid. Return an empty array or null for beneficiaries - the beneficiary info is typically captured on a separate form that is not in the images you receive.
- applicationSignedDate: from the "Signed at City / State / Date" line on Image 3. Return YYYY-MM-DD. If the date appears in a full timestamp format like "12/15/2025 at 18:42:11 GMT", return just "2025-12-15".

HARD RULES - ALWAYS RETURN NULL:
- policyNumber: ALWAYS return null. Mutual of Omaha does not assign a policy number at application time. The "AIS BU#######" and UUID-like strings visible on footer/pages are internal session identifiers, NOT policy numbers.
- effectiveDate: ALWAYS return null. This form has no explicit effective/policy date field on the application itself; downstream pipeline logic backfills this from applicationSignedDate.

WARNINGS:
- The application can either be 3 images (typical) or fewer if pages are missing. Always extract the fields that are actually visible; do not invent values.
- Do NOT pull any values from ADB Rider Disclosure pages, Bank Draft pages, overflow pages, or eSignature Data pages - none of those are sent to you under PAGE_MAP [3, 4, 5], and if they ever appear, they do not contain fields we extract.`,
    // PAGE_MAP: [1, 2] -> Image 1 = PDF page 1, Image 2 = PDF page 2
    // Mutual of Omaha standalone Accidental Death Insurance application (form MA5981, 5 pages total).
    // This is NOT a life insurance policy with an AD rider - it is a standalone accidental death product.
    // PDF pages 1-2 are the application proper (Sections A-F). Page 3 is the Bank Draft / Monthly Bank Withdrawal
    // Authorization, page 4 is the Agent/Producer Statement, page 5 is the eSignature Data page. None of pages
    // 3-5 carry policy numbers or effective dates - MOO assigns both post-issuance.
    // If PAGE_MAP changes for this form type, update image references below.
    moo_ma5981: `CARRIER-SPECIFIC GUIDANCE - Mutual of Omaha MA5981 (Standalone Accidental Death Insurance)
You are receiving 2 images from a Mutual of Omaha standalone Accidental Death Insurance application (form MA5981). This is NOT a life insurance policy with an AD rider - it is a dedicated Accidental Death product underwritten by Mutual of Omaha Insurance Company.

IMAGE MAPPING:
- Image 1 (PDF page 1): Main application. Contains SECTION A Primary Insured Information (Legal Name / Legal Residence Street / City / State / Zip / SSN / Gender / Date of Birth / Age / Telephone Number / E-mail / U.S. Citizen / Permanent Resident), SECTION B Insurance Applied For (Accidental Death Insurance Benefit Amount $______, Type of Plan checkboxes: Individual / Family with sub-options, Rider: Return of Premium (ROP), First Premium Payment: Bank Service Plan / Check, Renewal Payment Mode: Monthly BSP / Quarterly DB / Semiannual DB / Annual DB, Modal Premium $______, Amount Collected $______), SECTION C Family Coverage Information (Spouse / Child rows), SECTION D Beneficiary Information (Primary + Contingent with Relationship and DOB), and SECTION E Replacement Information.
- Image 2 (PDF page 2): Signature page. Contains SECTION F Agreement, "Signed at: ______ City / State", the Signature of Primary Insured + Printed Name + Date line, and the Producer Section. This is the authoritative page for signed city, signed state, and applicationSignedDate.

FIELD RULES:
- insuredName: from SECTION A "Primary Insured's Legal Name" on Image 1.
- insuredDateOfBirth: from SECTION A "Date of Birth" on Image 1. Return YYYY-MM-DD.
- insuredPhone: from SECTION A "Telephone Number" on Image 1.
- insuredEmail: from SECTION A "E-mail" on Image 1. If blank, return null.
- insuredState: use ONLY the state from the Legal Residence row (Street / City / State / Zip) in SECTION A on Image 1. Return the 2-letter state abbreviation.
- coverageAmount: extract from SECTION B "Accidental Death Insurance Benefit Amount $ ______" on Image 1. Return a plain number (e.g. 100000, not "$100,000"). Do NOT use the "Amount Collected" value - that is the first payment collected, not the coverage.
- premiumAmount: the "Modal Premium $________" value in SECTION B on Image 1, as a plain number.
- premiumFrequency: derive from SECTION B "Renewal Payment Mode" on Image 1. Map "Monthly Bank Service Plan (BSP)" -> "monthly", "Quarterly Direct Bill" -> "quarterly", "Semiannual Direct Bill" -> "semi-annual", "Annual Direct Bill" -> "annual".
- policyType: ALWAYS return exactly "Accidental". This form is a standalone accidental death product.
- insuranceCompany: ALWAYS return exactly "Mutual of Omaha".
- beneficiaries: from SECTION D on Image 1. Capture Primary Beneficiary (name, relationship, DOB, implicit 100% unless noted otherwise) and Contingent Beneficiary (name, relationship, DOB). Percentages may be written explicitly (e.g. "100%") in a column - capture those when visible. Mark type as "primary" or "contingent".
- policyOwner: this form has no separate Owner block - the Primary Insured is the Owner. ALWAYS return null.
- applicationSignedDate: from the "Signed at City / State / Date" line in SECTION F on Image 2, or from the e-Signature timestamp printed next to "e-Signed by [Insured Name]". Return YYYY-MM-DD. If the date appears in a full timestamp like "11/04/2025 at 19:03:08 GMT", return just "2025-11-04".

HARD RULES - ALWAYS RETURN NULL:
- policyNumber: ALWAYS return null. Mutual of Omaha does not assign a policy number at application time. The UUID-like string visible on pages (e.g. "f3573eed-e521-4b2c-b798-cad45ca7cf23") is an internal session identifier, NOT a policy number. The "M27862" visible on the bank draft sample check is a form/specimen identifier, not a policy number.
- effectiveDate: ALWAYS return null. This form has no explicit effective/policy date field; downstream pipeline logic backfills this from applicationSignedDate.

WARNINGS:
- Do NOT confuse this form with the MOO Living Promise ICC23L681A or Term Life Express ICC22L683A forms. MA5981 has Sections A-F and says "Application for Accidental Death Insurance" in the header.
- Do NOT pull any values from the Bank Withdrawal Authorization page (PDF page 3), Agent/Producer Statement page (PDF page 4), or eSignature Data page (PDF page 5) - none are sent to you under PAGE_MAP [1, 2].`,
};
