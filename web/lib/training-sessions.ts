/**
 * Weekly training session schedule + helpers for the dashboard
 * NextTrainingSessionCard. Source of truth for #4 from Rob's May 24
 * call (`CONTEXT.md` > Backlog > Weekly training session
 * infrastructure).
 *
 * Two recurring sessions per week, hosted by Daniel:
 *   - Tuesday 11am Central
 *   - Thursday 7pm Central
 *
 * The meeting URL is a single recurring link (Zoom or Google Meet
 * persistent room) configured via the `NEXT_PUBLIC_TRAINING_SESSION_URL`
 * env var. If unset, the card hides itself — local-dev and preview
 * environments don't show a broken Join button.
 *
 * Scheduling math runs in JS using `Intl.DateTimeFormat` for the
 * timezone-aware day/hour formatting. No external date lib because the
 * project doesn't carry one. The two functions agents actually call
 * (`getNextTrainingSession`, `isSessionLive`) are both pure of `now`
 * — caller passes the reference time, easier to test.
 */

export interface TrainingSlot {
  /** JS Date.getDay() convention: 0=Sun, 1=Mon, ..., 6=Sat. */
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** 0–23 wall-clock hour in the IANA zone below. */
  hour: number;
  /** 0–59 wall-clock minute in the IANA zone below. */
  minute: number;
  /** IANA timezone for the wall-clock interpretation. */
  timeZoneIana: string;
  /** Short label rendered next to the time on the card ("CT"). */
  timeZoneShort: string;
  /** Human-friendly day label ("Tuesday"). */
  dayLabel: string;
  /** Human-friendly time label ("11:00 am"). */
  timeLabel: string;
}

export const TRAINING_SCHEDULE: readonly TrainingSlot[] = [
  {
    dayOfWeek: 2,
    hour: 11,
    minute: 0,
    timeZoneIana: 'America/Chicago',
    timeZoneShort: 'CT',
    dayLabel: 'Tuesday',
    timeLabel: '11:00 am',
  },
  {
    dayOfWeek: 4,
    hour: 19,
    minute: 0,
    timeZoneIana: 'America/Chicago',
    timeZoneShort: 'CT',
    dayLabel: 'Thursday',
    timeLabel: '7:00 pm',
  },
];

/** Pitch line locked May 24, 2026 (Rob's call, item #4). */
export const TRAINING_PITCH_LINE = 'Learn new features. Master the system. Capture ROI.';

/** Session duration heuristic for "live now" detection + add-to-cal end time. */
export const TRAINING_SESSION_DURATION_MINUTES = 60;

/** Window before a session's start that counts as "live now" so the
 *  Join button stays prominent for early-arrivers. */
export const TRAINING_SESSION_LIVE_WINDOW_PRE_MINUTES = 10;

export interface TrainingSession {
  /** The slot this session is an instance of. */
  slot: TrainingSlot;
  /** Start instant. */
  startAt: Date;
  /** End instant (start + TRAINING_SESSION_DURATION_MINUTES). */
  endAt: Date;
}

/**
 * Find the offset (in minutes) between UTC and the wall-clock time
 * the given IANA timezone shows for an instant. Positive = zone is
 * east of UTC; negative = zone is west.
 *
 * Used to translate a wall-clock-in-tz into a UTC instant: take an
 * "as-if-UTC" instant for the wall-clock, query its offset in the
 * target zone, then shift.
 */
function timezoneOffsetMinutesAt(instant: Date, timeZoneIana: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneIana,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => {
    const p = parts.find((p) => p.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };
  const hour = get('hour');
  // Intl returns "24" for midnight in some Node builds — normalize.
  const normalizedHour = hour === 24 ? 0 : hour;
  const wallMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    normalizedHour,
    get('minute'),
    get('second'),
  );
  return (wallMs - instant.getTime()) / (60 * 1000);
}

/**
 * Compute the next occurrence (after `now`) of a given slot's
 * wall-clock time in its timezone. Handles DST correctly because the
 * offset lookup happens at the candidate instant, not at `now`.
 */
function nextOccurrence(slot: TrainingSlot, now: Date): Date {
  // We scan up to 14 days forward — enough to find one occurrence of
  // any weekday no matter what `now` is, with margin for the live
  // window check below.
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidateRoughly = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);

    // What weekday is `candidateRoughly` in the slot's timezone? We
    // check there because the slot's dayOfWeek is wall-clock-Chicago,
    // and a UTC instant near midnight may resolve to a different day
    // in Chicago than in UTC.
    const weekdayDtf = new Intl.DateTimeFormat('en-US', {
      timeZone: slot.timeZoneIana,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = weekdayDtf.formatToParts(candidateRoughly);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const targetWeekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][slot.dayOfWeek];
    if (weekday !== targetWeekday) continue;

    // Found the right weekday in the slot's zone. Now build an instant
    // that corresponds to slot.hour:slot.minute on that local date.
    const year = parts.find((p) => p.type === 'year')!.value;
    const month = parts.find((p) => p.type === 'month')!.value;
    const day = parts.find((p) => p.type === 'day')!.value;
    const wallAsIfUtc = Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      slot.hour,
      slot.minute,
      0,
    );
    const asIfUtcInstant = new Date(wallAsIfUtc);
    // Shift by the zone's offset to get the actual UTC instant whose
    // wall-clock IN that zone equals slot.hour:slot.minute on that date.
    const offsetMinutes = timezoneOffsetMinutesAt(asIfUtcInstant, slot.timeZoneIana);
    const actualInstant = new Date(asIfUtcInstant.getTime() - offsetMinutes * 60 * 1000);

    // Only return if the session start (minus the live-window pre)
    // is still in the future. A session that started 5 minutes ago
    // still counts as "next" (caller's isSessionLive check will mark
    // it live), but one that started 90 minutes ago is past and we
    // should move on to next week's slot.
    const liveWindowStart = actualInstant.getTime() - TRAINING_SESSION_LIVE_WINDOW_PRE_MINUTES * 60 * 1000;
    if (liveWindowStart > now.getTime()) {
      return actualInstant;
    }
    const liveWindowEnd = actualInstant.getTime() + TRAINING_SESSION_DURATION_MINUTES * 60 * 1000;
    if (now.getTime() < liveWindowEnd) {
      // Session is live RIGHT NOW. Return it so the card can render
      // the Join button prominently.
      return actualInstant;
    }
    // Session ended already; keep scanning forward.
  }
  // 14 days exhausted without finding a future occurrence — should be
  // unreachable for any well-formed slot. Defensive fallback to one
  // week from now at the slot time so the card never crashes.
  const fallback = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  fallback.setUTCHours(slot.hour, slot.minute, 0, 0);
  return fallback;
}

/**
 * Get the next upcoming or in-progress training session across all
 * slots in TRAINING_SCHEDULE. Returns the earliest one.
 */
export function getNextTrainingSession(now: Date = new Date()): TrainingSession {
  let best: TrainingSession | null = null;
  for (const slot of TRAINING_SCHEDULE) {
    const startAt = nextOccurrence(slot, now);
    const endAt = new Date(startAt.getTime() + TRAINING_SESSION_DURATION_MINUTES * 60 * 1000);
    const candidate: TrainingSession = { slot, startAt, endAt };
    if (!best || candidate.startAt < best.startAt) {
      best = candidate;
    }
  }
  // TRAINING_SCHEDULE is non-empty so `best` is always set, but TS
  // doesn't know that.
  return best!;
}

/**
 * True iff `now` falls within the live window of `session`:
 * `[startAt - PRE_MINUTES, endAt]`.
 */
export function isSessionLive(session: TrainingSession, now: Date = new Date()): boolean {
  const liveStartMs = session.startAt.getTime() - TRAINING_SESSION_LIVE_WINDOW_PRE_MINUTES * 60 * 1000;
  const liveEndMs = session.endAt.getTime();
  const nowMs = now.getTime();
  return nowMs >= liveStartMs && nowMs <= liveEndMs;
}

/** Format an instant as a YYYYMMDDTHHmmssZ string (basic ISO no
 *  punctuation) for ICS and Google Calendar URL params. */
function formatIcsTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Build a Google Calendar "add event" URL that pre-fills the next
 * session with weekly recurrence. Agent clicks → lands on Google
 * Calendar with all fields populated → confirms the save.
 */
export function buildGoogleCalendarAddUrl(
  session: TrainingSession,
  meetingUrl: string,
): string {
  // Google's day codes: SU MO TU WE TH FR SA. JS Date.getDay() → that.
  const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const byday = dayCodes[session.slot.dayOfWeek];
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'AFL Training Session',
    dates: `${formatIcsTimestamp(session.startAt)}/${formatIcsTimestamp(session.endAt)}`,
    details: `${TRAINING_PITCH_LINE}\n\nJoin: ${meetingUrl}`,
    location: meetingUrl,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Build an ICS file body (RFC 5545) for the recurring session. Apple
 * Calendar, Outlook desktop, and most clients handle this. Caller can
 * serve it as a data URL or download it.
 */
export function buildIcsContent(
  session: TrainingSession,
  meetingUrl: string,
): string {
  const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const byday = dayCodes[session.slot.dayOfWeek];
  const uid = `afl-training-${session.slot.dayOfWeek}-${session.slot.hour}-${session.slot.minute}@agentforlife.app`;
  const dtstamp = formatIcsTimestamp(new Date());
  const dtstart = formatIcsTimestamp(session.startAt);
  const dtend = formatIcsTimestamp(session.endAt);
  // Description field uses literal `\n` per ICS spec — clients render
  // these as line breaks.
  const description = `${TRAINING_PITCH_LINE}\\n\\nJoin: ${meetingUrl}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AgentForLife//Training Sessions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    'SUMMARY:AFL Training Session',
    `DESCRIPTION:${description}`,
    `LOCATION:${meetingUrl}`,
    `URL:${meetingUrl}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:AFL Training Session starts in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Build a `data:text/calendar` URL the browser can download from a
 *  link. Used so we don't have to add a server endpoint for the ICS
 *  file. */
export function buildIcsDataUrl(session: TrainingSession, meetingUrl: string): string {
  const ics = buildIcsContent(session, meetingUrl);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

/**
 * Friendly "in X" relative phrasing for the card subtitle. Examples:
 *   "in 3 hours", "in 2 days", "live now — join the call".
 */
export function describeRelativeToNow(session: TrainingSession, now: Date = new Date()): string {
  if (isSessionLive(session, now)) {
    return 'live now — join the call';
  }
  const diffMs = session.startAt.getTime() - now.getTime();
  if (diffMs <= 0) return 'live now — join the call';
  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
