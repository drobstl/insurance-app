export const CARRIER_PROMPT_SUPPLEMENTS: Record<string, string> = {
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
};
