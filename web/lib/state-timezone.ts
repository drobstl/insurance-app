/**
 * USPS state code → IANA timezone (dominant zone).
 *
 * Used by the lead-facing SMS / push templates to render appointment
 * times in the lead's local time rather than the agent's. The agent's
 * own dashboard, calendar event, and day-strip stay in the agent's
 * booking-time TZ — the rendering split happens at the SMS body only
 * (where the lead is the reader).
 *
 * Caveats — states that span two TZs use the dominant zone (by
 * population). Edge-case leads in the minority zone will see a
 * 1-hour mismatch; agent can mention it in person:
 *   FL: Eastern (panhandle is Central)
 *   IN: Eastern (handful of NW + SW counties are Central)
 *   KY: Eastern (Western KY is Central — roughly 1/3 by area)
 *   MI: Eastern (4 UP counties are Central)
 *   TN: Central (Eastern TN is Eastern — about half by area)
 *   TX: Central (El Paso area is Mountain)
 *   KS / NE / ND / SD / OR: Central or Pacific dominant; far-west sliver is Mountain
 *   ID: Mountain (panhandle is Pacific)
 *
 * Returns null for unknown / blank state codes — caller falls back to
 * whatever default it was already using (typically the agent's TZ).
 */

const STATE_TO_TZ: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',           // no DST
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',          // dominant; panhandle CT
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',          // no DST
  ID: 'America/Boise',              // dominant Mountain; panhandle PT
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis', // dominant Eastern
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',          // dominant Eastern
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',           // dominant Eastern
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',           // dominant Central
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  PR: 'America/Puerto_Rico',
  VI: 'America/St_Thomas',
};

/**
 * Look up the dominant IANA timezone for a USPS 2-letter state code.
 * Case-insensitive. Returns null for unknown codes or empty strings —
 * caller decides the fallback.
 */
export function timeZoneForState(stateCode: string | null | undefined): string | null {
  if (!stateCode) return null;
  const key = stateCode.trim().toUpperCase();
  if (!key) return null;
  return STATE_TO_TZ[key] || null;
}
