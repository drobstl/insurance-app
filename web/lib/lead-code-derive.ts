/**
 * Derived-lead-code helpers.
 *
 * Lead-code scheme (Daniel's call): the lead's own phone number,
 * normalized to 10 digits. Universal across all lead sources (manual
 * entry, Mail-In, Call-In, Digital — every form has a phone) and
 * maximally memorable (the lead knows it cold).
 *
 * Earlier version used MMDDYY + last4 phone. Switched to phone-only
 * because most extracted lead forms (Call-In, Digital) list age but
 * not DOB, which forced a random `L…` fallback ~70% of the time and
 * broke the "no code to memorize" UX. Phone is on every form.
 *
 * Trade-off: collisions exist (two leads sharing a phone — typically
 * a household with one shared landline). At create time we check the
 * `leadCodes` index globally — if there's already a doc at that code,
 * the caller falls back to a random `L…` code (see
 * lead-code-generator.ts) and surfaces a heads-up to the agent so
 * they read out the random code instead of "your code is your phone".
 *
 * Format: 10 numeric digits (US/Canada NANP last 10 of E.164).
 * No prefix — the lookup endpoint dispatches by length + composition:
 *   - 10 digits, all numeric → derived lead code (== lead's phone)
 *   - 8 chars, starts with `L` → random-fallback lead code
 *   - 8 chars, starts with `B` → beneficiary code
 *   - 6 chars (alphanumeric) → client code
 */

export const DERIVED_CODE_LENGTH = 10;

/**
 * Derive a lead code from the lead's phone number.
 *
 * Accepts any input format ("(816) 382-1302", "1-816-382-1302",
 * "+18163821302", "8163821302") and returns the last 10 digits.
 *
 * Returns null when the input has fewer than 10 digits.
 */
export function deriveLeadCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Type guard: does this code look like a derived (10-digit numeric)
 * lead code, vs a random `L…` fallback or a client/beneficiary code?
 */
export function isDerivedLeadCode(code: string): boolean {
  return code.length === DERIVED_CODE_LENGTH && /^\d{10}$/.test(code);
}

/**
 * Type guard: any lead code (derived OR random `L…` fallback).
 * The lookup endpoint uses this to short-circuit dispatch before
 * paying for client/beneficiary index reads.
 */
export function isLeadCode(code: string): boolean {
  return isDerivedLeadCode(code) || (code.length === 8 && code.startsWith('L'));
}
