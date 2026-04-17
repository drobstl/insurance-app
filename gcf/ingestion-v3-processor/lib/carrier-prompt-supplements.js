"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARRIER_PROMPT_SUPPLEMENTS = void 0;
exports.CARRIER_PROMPT_SUPPLEMENTS = {
    // PAGE_MAP: [1, 2, 5] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 5
    // If PAGE_MAP changes for this form type, update image references below.
    americo_icc18_5160: `CARRIER-SPECIFIC GUIDANCE - Americo ICC18 5160 (Term / CBO)
You are receiving 3 images.

Image 1: Insured information (Section 1) and product details (Section 2).
Image 2: Beneficiaries (Section 4) and policy owner (Section 5).
Image 3: Signature and signed date (Section 9).

WARNINGS:
- State: use ONLY the state from the mailing address (field 5). Do NOT use field 13 (Place of Birth) - it is a different value.
- This form has NO policy number field. Return policyNumber as null.
- If Section 5 (Owner) is blank or matches the insured, return policyOwner as null.`,
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
};
