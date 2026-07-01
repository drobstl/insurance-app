import 'server-only';

import {
  GoogleCalendarNotConnectedError,
  GoogleCalendarReconnectRequiredError,
  listEvents,
  resolveGoogleCalendarAccessToken,
} from './google-calendar';

/**
 * Agent availability for AI-driven direct booking.
 *
 * Deliberately simple and predictable (easy to sanity-check in a live test):
 * a few fixed local time-of-day slots on the next business days, minus any
 * Google Calendar conflicts. This is NOT a full free/busy optimizer — it just
 * gives the referral AI a handful of concrete, real, open times to offer.
 */

export interface Slot {
  /** Stable id the AI passes back to book this exact slot. */
  id: string;
  startIso: string;
  endIso: string;
  /** Human label in the agent's timezone, e.g. "Thursday, 2:00 PM". */
  label: string;
}

// Candidate local start hours (24h) offered each business day.
const CANDIDATE_HOURS = [10, 14, 16];
const DEFAULT_TZ = 'America/Chicago';
const LOOKAHEAD_DAYS = 12;
const MIN_LEAD_MS = 60 * 60 * 1000; // don't offer a slot less than 1h out

/** Wall-clock parts of `date` as observed in `tz`. */
function localParts(date: Date, tz: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

/** Minutes `tz` is ahead of UTC at the given instant. */
function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return (asUtc - date.getTime()) / 60000;
}

/** ISO instant for a given wall-clock time in `tz`. */
function zonedIso(y: number, m: number, d: number, hour: number, minute: number, tz: string): string {
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute);
  // Correct by the tz offset at (approximately) that instant.
  const offset = tzOffsetMinutes(tz, new Date(utcGuess));
  return new Date(utcGuess - offset * 60000).toISOString();
}

function labelFor(startIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startIso));
}

/**
 * Compute the next open appointment slots for an agent.
 * When the agent's Google Calendar is connected, busy blocks are filtered out;
 * otherwise the candidate slots are returned unfiltered (agent-owned risk).
 */
export async function getAvailableSlots(args: {
  agentId: string;
  /** OAuth callback URL (for token refresh) — build from the request origin. */
  callbackUrl: string;
  timeZone?: string;
  durationMinutes?: number;
  count?: number;
  now?: Date;
}): Promise<Slot[]> {
  const tz = args.timeZone && args.timeZone.trim() ? args.timeZone.trim() : DEFAULT_TZ;
  const duration = args.durationMinutes ?? 30;
  const count = args.count ?? 3;
  const now = args.now ?? new Date();

  // Pull calendar busy blocks (best-effort — skip filtering if not connected).
  let busy: Array<{ startMs: number; endMs: number }> = [];
  try {
    const { accessToken, calendarId } = await resolveGoogleCalendarAccessToken(args.agentId, args.callbackUrl);
    const events = await listEvents({
      accessToken,
      calendarId,
      timeMinIso: now.toISOString(),
      timeMaxIso: new Date(now.getTime() + (LOOKAHEAD_DAYS + 1) * 86400000).toISOString(),
    });
    busy = events.map((e) => ({ startMs: new Date(e.startIso).getTime(), endMs: new Date(e.endIso).getTime() }));
  } catch (err) {
    if (err instanceof GoogleCalendarNotConnectedError || err instanceof GoogleCalendarReconnectRequiredError) {
      // No connected calendar — offer unfiltered candidate slots.
    } else {
      // Transient/unknown: don't block booking on availability read failure.
      console.warn('[availability] calendar read failed, offering unfiltered slots:', err);
    }
  }

  const conflicts = (startMs: number, endMs: number) =>
    busy.some((b) => startMs < b.endMs && endMs > b.startMs);

  const slots: Slot[] = [];
  const today = localParts(now, tz);
  const anchor = Date.UTC(today.y, today.m - 1, today.d);

  for (let i = 1; i <= LOOKAHEAD_DAYS && slots.length < count; i++) {
    const day = new Date(anchor + i * 86400000);
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const weekday = day.getUTCDay(); // 0 Sun … 6 Sat
    if (weekday === 0 || weekday === 6) continue; // business days only

    for (const hour of CANDIDATE_HOURS) {
      if (slots.length >= count) break;
      const startIso = zonedIso(y, m, d, hour, 0, tz);
      const startMs = new Date(startIso).getTime();
      if (startMs < now.getTime() + MIN_LEAD_MS) continue;
      const endMs = startMs + duration * 60000;
      if (conflicts(startMs, endMs)) continue;
      slots.push({
        id: `slot_${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}_${String(hour).padStart(2, '0')}`,
        startIso,
        endIso: new Date(endMs).toISOString(),
        label: labelFor(startIso, tz),
      });
    }
  }

  return slots;
}
