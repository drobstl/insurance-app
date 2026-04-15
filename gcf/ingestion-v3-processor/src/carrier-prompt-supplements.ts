export const CARRIER_PROMPT_SUPPLEMENTS: Record<string, string> = {
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

  // PAGE_MAP: [1, 2, 5, 21] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 5, Image 4 = page 21
  // If PAGE_MAP changes for this form type, update image references below.
  americo_icc18_5160_iul: `CARRIER-SPECIFIC GUIDANCE - Americo ICC18 5160 IUL (Indexed Universal Life)
You are receiving 4 images.

Image 1: Insured information (Section 1) and product details (Section 2).
Image 2: Beneficiaries (Section 4) and policy owner (Section 5).
Image 3: Signature and signed date (Section 9).
Image 4: Bank Draft Authorization - extract the policy/application number from this page.

WARNINGS:
- State: use ONLY the state from the mailing address (field 5). Do NOT use field 13 (Place of Birth) - it is a different value.
- If Section 5 (Owner) is blank or matches the insured, return policyOwner as null.
- If the signed date on Image 3 is blank, return applicationSignedDate as null. Do not pull dates from other pages.`,

  // PAGE_MAP: [1, 2, 4] -> Image 1 = page 1, Image 2 = page 2, Image 3 = page 4
  // If PAGE_MAP changes for this form type, update image references below.
  americo_icc24_5426: `CARRIER-SPECIFIC GUIDANCE - Americo ICC24 5426 (Whole Life / Eagle Select)
You are receiving 3 images.

Image 1: Insured information (Section A), policy owner (Section B), beneficiaries (Section C), and product details (Section D).
Image 2: Signature and signed date (Section G).
Image 3: Bank Draft Authorization - extract the policy/application number from this page (expect format like "AF55019").

WARNINGS:
- State: use ONLY the state from the address in Section A (field 5a). Do NOT use field 8 (Place of Birth) - it is a different value.
- If Section B (Owner) indicates the insured is the owner, return policyOwner as null.`,
};
