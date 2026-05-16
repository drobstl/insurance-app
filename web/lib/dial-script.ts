/**
 * Dial script template + token replacement.
 *
 * The agent sees this overlay during a live call (triggered by tapping
 * Call on a lead). Token placeholders like `{agentfirstname}` and
 * `{leadage}` are filled with per-lead context so the agent reads a
 * personalized script without typing the lead's info themselves.
 *
 * Per-agent override lives at `agents/{agentId}.dialScript`; falls back
 * to DEFAULT_DIAL_SCRIPT below. Edited via Settings → Profile.
 *
 * Daniel's partial — replace with the full script when ready.
 */

export const DEFAULT_DIAL_SCRIPT = `Hi, this is {agentfirstname} giving you a quick call back. You called into my office the other day because you got one of those postcards in the mail, and I'm just the person assigned to get that information out to you.

I see your age listed as {leadage}...

[rest of script — paste your full script in Settings → Profile to replace this default]

---

If they're confused or object, say:

"When you called in, I was asking you those questions about tobacco use and your mortgage amount. I'm just the person assigned to get that information over to you."

Then go back to the main script above.`;

/**
 * Context the script can reference. All fields optional — missing
 * values render as the bracketed token (e.g. "{leadage}") so the agent
 * sees what's missing at a glance.
 */
export interface DialScriptContext {
  agentFirstName?: string;
  leadFirstName?: string;
  leadFullName?: string;
  leadAge?: number | null;
  leadCity?: string;
  leadState?: string;
  leadPhone?: string;
  tobaccoUse?: 'Y' | 'N' | null;
  mortgageAmount?: number | null;
  spouseName?: string;
}

function firstWord(s: string | undefined): string {
  if (!s) return '';
  return s.trim().split(/\s+/)[0] || '';
}

function formatUsd(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return `$${Math.round(n).toLocaleString()}`;
}

function formatTobacco(v: 'Y' | 'N' | null | undefined): string {
  if (v === 'Y') return 'Yes';
  if (v === 'N') return 'No';
  return 'Unknown';
}

/**
 * Replace `{tokens}` in the template. Unknown tokens are preserved
 * verbatim so the agent sees them as gaps to fill in.
 */
export function renderDialScript(template: string, ctx: DialScriptContext): string {
  const map: Record<string, string> = {
    agentfirstname: firstWord(ctx.agentFirstName),
    leadfirstname: firstWord(ctx.leadFirstName),
    leadname: firstWord(ctx.leadFirstName),  // alias
    leadfullname: (ctx.leadFullName || '').trim(),
    leadage: ctx.leadAge != null ? String(ctx.leadAge) : '',
    leadcity: ctx.leadCity || '',
    leadstate: ctx.leadState || '',
    leadphone: ctx.leadPhone || '',
    tobaccouse: formatTobacco(ctx.tobaccoUse),
    mortgageamount: formatUsd(ctx.mortgageAmount),
    spousename: (ctx.spouseName || '').trim(),
  };
  return template.replace(/\{([a-z][a-z0-9_]*)\}/gi, (raw, name: string) => {
    const key = name.toLowerCase();
    const val = map[key];
    return val !== undefined && val !== '' ? val : `{${name}}`;
  });
}

export const SCRIPT_TOKEN_HINTS: Array<{ token: string; description: string }> = [
  { token: '{agentfirstname}', description: 'Your first name' },
  { token: '{leadfirstname}', description: 'Lead first name (also: {leadname})' },
  { token: '{leadfullname}', description: 'Lead full name' },
  { token: '{leadage}', description: 'Lead age (computed from DOB or ageYears)' },
  { token: '{leadcity}', description: 'Lead city' },
  { token: '{leadstate}', description: 'Lead state (USPS code)' },
  { token: '{leadphone}', description: 'Lead phone' },
  { token: '{tobaccouse}', description: '"Yes" / "No" / "Unknown"' },
  { token: '{mortgageamount}', description: 'Formatted as USD' },
  { token: '{spousename}', description: 'Spouse name (when on file)' },
];
