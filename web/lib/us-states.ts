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

/**
 * Full display names keyed by USPS code. Used so lead search can match a
 * typed-out state name ("Texas") against a lead whose `address.state` is
 * stored as the 2-letter code ("TX"). Keep in lock-step with
 * `US_STATE_CODES` above.
 */
export const US_STATE_NAMES: Record<UsStateCode, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

const US_STATE_NAME_TO_CODE = new Map<string, UsStateCode>(
  (US_STATE_CODES as readonly UsStateCode[]).map((code) => [
    US_STATE_NAMES[code].toLowerCase(),
    code,
  ]),
);

/**
 * Resolve a full state name (or a 2-letter code) to its USPS code,
 * case-insensitively. Returns `null` when it isn't a known state.
 * `'texas'` → `'TX'`, `'tx'` → `'TX'`, `'nowhere'` → `null`.
 */
export function stateCodeFromName(raw: string | null | undefined): UsStateCode | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (US_STATE_CODE_SET.has(upper)) return upper as UsStateCode;
  return US_STATE_NAME_TO_CODE.get(v.toLowerCase()) ?? null;
}
