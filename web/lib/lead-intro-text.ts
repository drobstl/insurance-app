import { renderDialScript, type DialScriptContext } from './dial-script';

/**
 * Lead intro text — the optional "teed up" SMS an agent fires off when
 * a new lead lands, before the first call. Same spirit as the booking
 * confirmation: pre-composed, editable, sent from the agent's own phone
 * (so it comes from their cell number, not a server).
 *
 * The template is per-agent customizable (Settings → Messages,
 * stored at `agents/{agentId}.introTextTemplate`) and falls back to
 * DEFAULT_INTRO_TEXT below. Token substitution + conditional blocks are
 * handled by the shared dial-script engine, so the vocabulary matches
 * the dial script the agent already edits ({leadfirstname},
 * {agentfirstname}, {agentnpn}, {mortgageamount}, …). The friendlier
 * alias {statelicensenumber} resolves to the agent's license number for
 * the lead's state (same value as {agentlicense}).
 *
 * The default wraps the credential clause in a conditional so it drops
 * cleanly when the agent has no license on file for that lead's state —
 * an outbound SMS should never read "state licensed #{statelicensenumber}".
 */
export const DEFAULT_INTRO_TEXT =
  `Hi {leadfirstname}, this is your assigned caseworker {agentfirstname}` +
  `{#statelicensenumber}, state licensed #{statelicensenumber}{/statelicensenumber}. ` +
  `I'm starting on your personalized Mortgage Protection information — is now a good time to talk?`;

/**
 * Compose the intro SMS body: fill tokens + resolve `{#…}`/`{^…}` blocks
 * via the shared engine, then — unlike the on-screen dial script — strip
 * any token that survived empty. The call overlay keeps a literal
 * `{token}` so the agent SEES the gap; an outbound text must not, so a
 * stray `{mortgageamount}` (lead with no mortgage on file) is removed and
 * the punctuation/whitespace it leaves behind is tidied.
 */
export function renderIntroText(template: string, ctx: DialScriptContext): string {
  const filled = renderDialScript((template && template.trim()) || DEFAULT_INTRO_TEXT, ctx);
  return filled
    .replace(/\{[a-z][a-z0-9_]*\}/gi, '')      // drop any unresolved token
    .replace(/[ \t]{2,}/g, ' ')                 // collapse double spaces
    .replace(/\s+([,.!?])/g, '$1')              // tidy " ," → ","
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tokens surfaced as hints under the template editor in Settings. */
export const INTRO_TOKEN_HINTS: Array<{ token: string; description: string }> = [
  { token: '{leadfirstname}', description: 'Lead first name' },
  { token: '{agentfirstname}', description: 'Your first name' },
  { token: '{statelicensenumber}', description: "Your license # in the lead's state" },
  { token: '{agentnpn}', description: 'Your NPN (set it in Profile)' },
  { token: '{agencyname}', description: 'Your agency / office name' },
  { token: '{mortgageamount}', description: "Lead's mortgage balance (USD)" },
];

/**
 * Conditional block the default relies on. `{#name}…{/name}` shows when the
 * token is non-empty, `{^name}…{/name}` when it's empty — so agents editing
 * their template can keep the credential line optional.
 */
export const INTRO_CONDITION_HINTS: Array<{ token: string; description: string }> = [
  {
    token: '{#statelicensenumber}…{/statelicensenumber}',
    description: "Shown only when you have a license on file for the lead's state ({^…} = when you don't)",
  },
];
