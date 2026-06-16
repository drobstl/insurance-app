/**
 * Dial script template — token replacement + conditional blocks.
 *
 * The agent sees this overlay during a live call (triggered by tapping
 * Call on a lead). Two mechanisms keep one script adaptive:
 *
 *  - Tokens: `{leadage}`, `{agentnpn}`, … are filled with per-lead /
 *    per-agent context so the agent reads personalized lines without
 *    typing anything. Missing tokens render as the bracketed name so the
 *    agent sees the gap.
 *  - Conditional blocks: `{#flag}…{/flag}` is kept only when the flag is
 *    ON; `{^flag}…{/flag}` only when it's OFF. Flags cover the lead
 *    (coborrower, smoker/nonsmoker) and the agent's own settings (video
 *    vs phone appointments, whether they share app access). A flag that
 *    isn't an explicit boolean falls back to "is this token non-empty?",
 *    so `{#spousename}…{/spousename}` works too. Blocks may nest.
 *
 * Per-agent override lives at `agents/{agentId}.dialScript`; falls back
 * to DEFAULT_DIAL_SCRIPT below. Edited via Settings → Profile.
 */

export const DEFAULT_DIAL_SCRIPT = `Hey {leadfirstname}? … {leadfirstname}, this is {agentfirstname}{#agencyname}, I'm over at {agencyname}{/agencyname} — just giving you a quick call back. Looks like yesterday or today you called into our office about that postcard you got in the mail on protecting your mortgage.

(Yeah…)

I'm just the field underwriter assigned to get this over to you. Let me quickly verify a couple things that came through so I can get to work on it for you.

── VERIFY (keep it moving, stay even) ──
• It says you're {leadage}.{#nonsmoker} And it's got you down as a non-smoker — still the case?{/nonsmoker}{#smoker} It also has you as a tobacco user — have you used any tobacco or nicotine in the past year? And what kind?{/smoker}{^smoker}{^nonsmoker} Do you currently use any tobacco or nicotine?{/nonsmoker}{/smoker}
• The home's about {mortgageamount} — correct? And how much are you paying on that each month?
• Real quick — verify your height and weight for me?
{#coborrower}• It's got a co-borrower listed with you — who's that, a spouse or someone else at home? … What's their name?{#spousename} (on file: {spousename}){/spousename} … About your age too? … Non-smoker as well?
   (if both non-smokers) I take it you two don't plan on starting anytime soon either, right? (LOL){/coborrower}{^coborrower}• Looks like it's just you on this one — that right, or is there a spouse / someone else living with you? (if someone: grab their name + age){/coborrower}

── LOCK DOWN THE APPOINTMENT ──
Great, {leadfirstname} — we do everything virtually, nobody's coming out to your house. {#video}We'll hop on a quick video chat so you can see and hear me while I walk you through your options.{/video}{^video}It's just a simple phone call.{/video} I was mainly calling to find a time — when do you normally get off work? (PAUSE) Won't take more than 20 minutes.

I've got today and tomorrow open — any preference on the day? Perfect, I've got (2–3 time slots) — which works best{#coborrower} for you and {spousename}{/coborrower}?

{#coborrower}It's important the three of us meet together — you confirm my identity, I confirm yours. So does (chosen time) work for both you and {spousename}?{/coborrower}{^coborrower}Let's lock it in — does (chosen time) work? That way we sit down together, you confirm my identity and I confirm yours.{/coborrower}
{#video}Perfect — what's a good email to send the meeting link to?{/video}

── HEALTH ──
Healthwise, anything going on — any medications you take? And before I do the homework on this: anything like diabetes, cancer, COPD, heart issues, stroke? (if yes: when diagnosed + note it){#coborrower} And anything on {spousename}?{/coborrower}

── TRANSITION → WRITE IT DOWN ──
Got it — I've got everything I need to do the homework on this for you. So real quick, you got something to write with? Grab a pen, take your time.
Have them jot down:
  • My name — {agentfullname}
  • "Mortgage protection"
{#agentnpn}  • My NPN — {agentnpn}{/agentnpn}{^agentnpn}{#agentlicense}  • My license # — {agentlicense}{/agentlicense}{^agentlicense}  • My license # / NPN (read yours){/agentlicense}{/agentnpn}
   ↳ so they can verify you at the state Dept. of Insurance site
  • The day + time of the appointment

(MI leads only — skip for CI/Digital) Most importantly, {leadfirstname} — when you sent this in, what was the main concern? What were you looking for this to do for your family? Who are we protecting? … And who'd you put as your beneficiary? (repeat the name back with the concern)
{#app}
── SET THEM UP IN THE APP ──
One last thing — when we hang up I'll text you a link to our app. If you can download it and answer about five quick yes-or-no questions in there before we talk, it helps me come ready with the best coverage at the best price for you. Two minutes, tops.
{/app}
── CLOSE ──
That makes perfect sense — I look forward to chatting (day/time). They do ask me to let you know that a missed appointment can hurt my ability to help another family — so if an emergency comes up, just let me know and I'll give that time to another family and get you rescheduled. I appreciate you{#coborrower} both{/coborrower}!{#agentphone} I'll text you from {agentphone} when we hang up so you've got my number.{/agentphone}

── DURING THE LOCKDOWN ──
Use their name{#coborrower} (and {spousename}'s){/coborrower} 4–5 times. Stay even — never slip into rush mode.
• "You said (time) works{#coborrower} for both you and {spousename}{/coborrower}, right?"
• "I'll text you when we hang up{#coborrower}, and I'll see you and {spousename}{/coborrower} (day) at (time)."
{#video}• "Joining from a phone or a computer?" Have them wait while you send the email and confirm they got it: "I mess up spelling sometimes — want to make sure I got it right."{/video}

════════ OBJECTION HANDLING ════════
"Not a good time / I'm at work."
→ Oh absolutely — wasn't calling to go over any details, and I'll definitely call you back. I just want to quickly verify what you sent in so I can get started. So it says here… (→ back to VERIFY)

If they cut in again ("I gotta go") → go straight into the lock down:
→ Of course, {leadfirstname} — let me check my schedule for when we can reconnect… I've got tomorrow at 2, does 2 work? … {#video}Great, we do everything by video chat — what's a good email for the link?{/video}{^video}Great, we'll do a quick phone call then.{/video}

Also works:
→ I only have a quick minute myself, and I want to make good use of your time when we actually talk — so let me just verify what you sent in. You're {leadage}{#nonsmoker}, a non-smoker{/nonsmoker}?

TONE: don't change tonality or cadence. Stay level throughout — especially on the lock down.

════════ ALREADY PROTECTED? (advanced-market reset) ════════
If they're not interested in mortgage protection or seem already set up:
→ Sounds like you've got some great things in place — you've done the work to put your family in a strong position. Honestly, it sounds like I might not be the right person for you. For someone stable like you, the person to talk to is (SME name), who leads our advanced-market team. Depending on eligibility and fit, they protect the home a different way — help you pay it off in half the time or less without changing your monthly budget, and grow your money where it's tax-advantaged and protected from market loss. Would it be a bad idea to grab 10 minutes on their calendar just to feel it out? I've got access — I'm seeing (X) and (Y) open tomorrow.`;

/**
 * Context the script can reference. All fields optional — missing
 * values render as the bracketed token (e.g. "{leadage}") so the agent
 * sees what's missing at a glance.
 */
export interface DialScriptContext {
  // ── Agent (from profile) ──
  agentFirstName?: string;
  agentFullName?: string;
  agentPhone?: string;
  agentNpn?: string;
  /** License number for the lead's state, when on file. */
  agentLicense?: string;
  agencyName?: string;
  // ── Lead ──
  leadFirstName?: string;
  leadFullName?: string;
  leadAge?: number | null;
  leadCity?: string;
  leadState?: string;
  leadPhone?: string;
  tobaccoUse?: 'Y' | 'N' | null;
  mortgageAmount?: number | null;
  spouseName?: string;
  // ── Conditional inputs ──
  coborrower?: boolean;
  appointmentMode?: 'video' | 'phone';
  /** Agent shares app access with leads (gates the app block). */
  includeApp?: boolean;
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
 * Resolve `{#flag}…{/flag}` (keep when ON) and `{^flag}…{/flag}` (keep
 * when OFF) sections. Nesting is handled by resolving innermost sections
 * first and looping until stable.
 */
function renderSections(template: string, isOn: (name: string) => boolean): string {
  const re = /\{([#^])([a-z][a-z0-9_]*)\}([\s\S]*?)\{\/\2\}/gi;
  let prev = '';
  let out = template;
  // Bounded so a pathological template can't spin forever; real scripts
  // nest only a couple levels deep.
  for (let i = 0; out !== prev && i < 50; i++) {
    prev = out;
    out = out.replace(re, (_m, kind: string, name: string, body: string) => {
      const on = isOn(name.toLowerCase());
      return (kind === '#' ? on : !on) ? body : '';
    });
  }
  return out;
}

/**
 * Replace `{tokens}` and resolve `{#…}/{^…}` blocks in the template.
 * Unknown tokens are preserved verbatim so the agent sees them as gaps.
 */
export function renderDialScript(template: string, ctx: DialScriptContext): string {
  const map: Record<string, string> = {
    agentfirstname: firstWord(ctx.agentFirstName),
    agentfullname: (ctx.agentFullName || '').trim(),
    agentphone: (ctx.agentPhone || '').trim(),
    agentnpn: (ctx.agentNpn || '').trim(),
    agentlicense: (ctx.agentLicense || '').trim(),
    agencyname: (ctx.agencyName || '').trim(),
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
  const flags: Record<string, boolean> = {
    coborrower: ctx.coborrower === true,
    video: ctx.appointmentMode === 'video',
    phone: ctx.appointmentMode !== 'video',
    app: ctx.includeApp === true,
    smoker: ctx.tobaccoUse === 'Y',
    nonsmoker: ctx.tobaccoUse === 'N',
  };
  // Explicit boolean flags win; otherwise a name is "on" when its token
  // resolves to a non-empty value (e.g. {#spousename}).
  const isOn = (name: string): boolean => {
    if (name in flags) return flags[name];
    const v = map[name];
    return typeof v === 'string' && v.trim() !== '';
  };

  let out = renderSections(template, isOn);
  out = out.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_raw, name: string) => {
    const val = map[name.toLowerCase()];
    return val !== undefined && val !== '' ? val : `{${name}}`;
  });
  // Tidy whitespace left where blocks were removed: drop trailing spaces
  // and collapse 3+ blank lines down to one.
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

export const SCRIPT_TOKEN_HINTS: Array<{ token: string; description: string }> = [
  { token: '{agentfirstname}', description: 'Your first name' },
  { token: '{agentfullname}', description: 'Your full name (for the write-down)' },
  { token: '{agentphone}', description: 'Your callback number' },
  { token: '{agentnpn}', description: 'Your NPN (set it in Profile)' },
  { token: '{agentlicense}', description: "Your license # in the lead's state" },
  { token: '{agencyname}', description: 'Your agency / office name' },
  { token: '{leadfirstname}', description: 'Lead first name (also: {leadname})' },
  { token: '{leadfullname}', description: 'Lead full name' },
  { token: '{leadage}', description: 'Lead age (from DOB or ageYears)' },
  { token: '{leadcity}', description: 'Lead city' },
  { token: '{leadstate}', description: 'Lead state (USPS code)' },
  { token: '{leadphone}', description: 'Lead phone' },
  { token: '{tobaccouse}', description: '"Yes" / "No" / "Unknown"' },
  { token: '{mortgageamount}', description: 'Formatted as USD' },
  { token: '{spousename}', description: 'Spouse name (when on file)' },
];

/**
 * Conditional blocks the script supports. `{#name}…{/name}` shows when ON,
 * `{^name}…{/name}` shows when OFF. Surfaced as hints in Settings so agents
 * editing their own script know the switches exist.
 */
export const SCRIPT_CONDITION_HINTS: Array<{ token: string; description: string }> = [
  { token: '{#coborrower}…{/coborrower}', description: 'Lead has a co-borrower ({^coborrower} = none on file)' },
  { token: '{#video}…{/video}', description: 'Your appointments are video ({^video} = phone)' },
  { token: '{#app}…{/app}', description: 'You share app access in confirmations' },
  { token: '{#nonsmoker}…{/nonsmoker}', description: 'Lead is a non-smoker ({#smoker} = tobacco user)' },
];
