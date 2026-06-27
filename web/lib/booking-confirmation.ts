import { timeZoneForState } from './state-timezone';

/**
 * Booking-confirmation message composition.
 *
 * Locked template per Daniel's spec:
 *   "Hi {leadFirstName}. Just a reminder of our appointment for
 *   {dateDayOfWeek} at {time} to discuss Mortgage Protection options.
 *
 *   Looking forward to speaking with you. - {agentFirstName}"
 *
 * The agent will send this via their own phone (one-tap SMS via the
 * Web Share API or a `sms:` deep link), with the agent's business
 * card and the state-matched license PDF attached. The Linq pooled
 * line is intentionally NOT used here — confirmations + reminders
 * would burn through the new-conversation cap and the send/reply
 * ratio (see CONTEXT.md > Channel Rules).
 *
 * Both the confirmation flow (Chunk 4e) and the 1hr-reminder flow
 * (Chunk 4f) reuse this same composer with different intro phrasing.
 */

export interface CompositionInput {
  leadFirstName: string;
  agentFirstName: string;
  scheduledAt: Date;
  /** 'confirmation' on initial send right after booking; 'reminder' for the 1hr-before send. */
  kind: 'confirmation' | 'reminder';
  /**
   * IANA TZ name (e.g. "America/Chicago") captured at booking time.
   * Acts as a fallback only — if `leadStateCode` resolves to a TZ
   * (preferred), that wins. When absent, the SMS body renders in the
   * sender's browser TZ with no label.
   */
  timeZone?: string;
  /**
   * USPS state code from the lead's address. When set, the SMS body
   * renders the appointment time in this state's dominant TZ — so the
   * LEAD reads it in their local time, not the agent's. This is the
   * preferred TZ source; `timeZone` above is the fallback.
   */
  leadStateCode?: string;
  /**
   * Per-appointment meeting URL (Zoom, Google Meet, etc.). When set,
   * appended to the message body as a "Join here:" line. Absent for
   * phone appointments.
   */
  meetingUrl?: string;
  /**
   * App-access hand-off for booked leads. When set (and kind is
   * 'confirmation'), appends a short "download my app + log in with
   * code" block so the lead lands on the agent's branded prep page
   * before the meeting.
   *
   * Callers are responsible for the gate: only pass this when the
   * agent is Pro+, has opted in (`includeAppAccessInConfirmations`),
   * has a real intro video recorded, and a login code resolved for
   * the lead. When null/omitted the body is unchanged.
   */
  appAccess?: { downloadUrl: string; code: string } | null;
}

/**
 * Day-of-week string with friendly weekday + short date. Examples:
 *   "Thursday, Nov 21"
 *   "tomorrow at 2:00pm" — separate composer, see formatTimeOfDay
 *
 * We use the agent's local timezone (the dashboard runs in their
 * browser locale; the appointment Timestamp is UTC but Date methods
 * render in local TZ, which matches how the agent set the time in
 * the picker).
 */
export function formatDayOfWeek(d: Date, timeZone?: string): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatTimeOfDay(d: Date, timeZone?: string): string {
  const base = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).toLowerCase().replace(' ', '');  // "2:00pm" not "2:00 PM"
  if (!timeZone) return base;
  const label = shortTimeZoneLabel(d, timeZone);
  return label ? `${base} ${label}` : base;
}

/**
 * Pull the short timezone abbreviation (e.g. "CT", "ET", "PST") from
 * Intl. We append this to the SMS time so a lead in a different zone
 * isn't guessing whether "2:00pm" is their local time or the agent's.
 */
export function shortTimeZoneLabel(d: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(d);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    return tz;
  } catch {
    return '';
  }
}

export function firstName(fullName: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

export function composeMessage(input: CompositionInput): string {
  // Prefer the lead's state-derived TZ — the lead is reading this SMS,
  // so it should render in their local time. Fall back to the booking
  // TZ (agent's anchor), and finally to the sender's browser TZ.
  const resolvedTz = timeZoneForState(input.leadStateCode) || input.timeZone;
  const lead = firstName(input.leadFirstName) || 'there';
  const agent = firstName(input.agentFirstName) || 'your agent';
  const day = formatDayOfWeek(input.scheduledAt, resolvedTz);
  const time = formatTimeOfDay(input.scheduledAt, resolvedTz);

  const joinLine = input.meetingUrl ? `\n\nJoin here: ${input.meetingUrl}` : '';

  // App-access block — confirmation only. Repeating the link on the
  // 1hr reminder would just clutter, so the prep-page nudge rides the
  // initial confirmation. The caller-side gate decides whether
  // appAccess is populated at all.
  const appBlock =
    input.kind === 'confirmation' && input.appAccess
      ? `\n\nWant a head start before we meet? Download my app: ${input.appAccess.downloadUrl} ` +
        `and log in with code ${input.appAccess.code}. You'll get a quick intro from me ` +
        `and a few short questions — they help me line up the right coverage at the best rate before we even talk.`
      : '';

  if (input.kind === 'reminder') {
    return (
      `Hi ${lead}, quick reminder of our appointment today at ${time} ` +
      `to discuss Mortgage Protection options.` +
      joinLine +
      `\n\nLooking forward to it. - ${agent}`
    );
  }
  // 'confirmation' — initial send right after booking.
  return (
    `Hi ${lead}. Just a reminder of our appointment for ${day} at ${time} ` +
    `to discuss Mortgage Protection options.` +
    joinLine +
    appBlock +
    `\n\nLooking forward to speaking with you. - ${agent}`
  );
}
