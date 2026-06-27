/**
 * Canonical US state / territory codes — client-safe.
 *
 * The authoritative list also lives in `agent-licenses.ts`, but that
 * module is `server-only` (it touches Firestore Admin), so it can't be
 * imported into client components. Client surfaces that tag a lead
 * with a state or pick a state-matched license — the lead-profile
 * editor (`LeadDetailPanel`) and the booking-confirmation drawer
 * (`SendConfirmationDrawer`) — import from here instead.
 *
 * Keep this list in lock-step with `US_STATE_CODES` in
 * `agent-licenses.ts`: the lead's `address.state` is the key the
 * per-state license registry (`agents/{id}.licenses[stateCode]`) is
 * looked up by, so a code valid on the client but unknown to the
 * server would silently fail to match a license.
 */

export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
  'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
  'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR',
] as const;

export type UsStateCode = typeof US_STATE_CODES[number];

const US_STATE_CODE_SET = new Set<string>(US_STATE_CODES);

/** True when `s` is a known 2-letter USPS code. Pass an uppercased value. */
export function isUsStateCode(s: string): s is UsStateCode {
  return US_STATE_CODE_SET.has(s);
}

/**
 * Coerce free-form input to a valid 2-letter code, or `''` when it
 * isn't one. Trims + uppercases first, so `' tx '` → `'TX'` and an
 * empty / unrecognized value → `''` (callers treat `''` as "no state").
 */
export function normalizeUsStateCode(raw: string | null | undefined): string {
  const v = (raw || '').trim().toUpperCase();
  return US_STATE_CODE_SET.has(v) ? v : '';
}
