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
 * Simple and predictable: business-hours slots on the next business days, minus
 * Google Calendar conflicts. Supports three needs of the referral AI:
 *   - getAvailableSlots(): the soonest few times to proactively offer.
 *   - findSlots({ fromIso }):  more times, or times near a specific request.
 *   - resolveTime({ iso }):    validate + re-check a specific time before booking.
 */

export interface Slot {
  id: string;
  startIso: string;
  endIso: string;
  label: string; // e.g. "Thursday, 2:00 PM" in the agent's tz
}

const DEFAULT_TZ = 'America/Chicago';
const WORK_START = 9; // 9am
const WORK_END = 17; // 5pm (last start < 17)
const OFFER_HOURS = [10, 14, 16]; // sparse hours for the proactive offer
const GRANULAR_HOURS = [9, 10, 11, 13, 14, 15, 16]; // fuller menu for find/around
const LOOKAHEAD_DAYS = 14;
const MIN_LEAD_MS = 60 * 60 * 1000;

// ── tz helpers ──────────────────────────────────────────────────────────────
function localParts(date: Date, tz: string): { y: number; m: number; d: number; hour: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const wdIdx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day), hour, weekday: wdIdx[map.weekday] ?? 0 };
}

function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return (asUtc - date.getTime()) / 60000;
}

function zonedIso(y: number, m: number, d: number, hour: number, minute: number, tz: string): string {
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute);
  const offset = tzOffsetMinutes(tz, new Date(utcGuess));
  return new Date(utcGuess - offset * 60000).toISOString();
}

function labelFor(startIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(startIso));
}

// ── busy blocks ─────────────────────────────────────────────────────────────
type Busy = Array<{ startMs: number; endMs: number }>;

async function fetchBusy(agentId: string, callbackUrl: string, fromIso: string, toIso: string): Promise<Busy> {
  try {
    const { accessToken, calendarId } = await resolveGoogleCalendarAccessToken(agentId, callbackUrl);
    const events = await listEvents({ accessToken, calendarId, timeMinIso: fromIso, timeMaxIso: toIso });
    return events.map((e) => ({ startMs: new Date(e.startIso).getTime(), endMs: new Date(e.endIso).getTime() }));
  } catch (err) {
    if (err instanceof GoogleCalendarNotConnectedError || err instanceof GoogleCalendarReconnectRequiredError) return [];
    console.warn('[availability] busy read failed, treating as free:', err);
    return [];
  }
}

function conflicts(busy: Busy, startMs: number, endMs: number): boolean {
  return busy.some((b) => startMs < b.endMs && endMs > b.startMs);
}

// ── slot generation ─────────────────────────────────────────────────────────
function buildSlots(opts: { now: Date; tz: string; duration: number; hours: number[]; busy: Busy; fromDate: Date; count: number }): Slot[] {
  const { now, tz, duration, hours, busy, fromDate, count } = opts;
  const slots: Slot[] = [];
  const anchor = localParts(fromDate, tz);
  const anchorUtc = Date.UTC(anchor.y, anchor.m - 1, anchor.d);
  // If the anchor day is today (or past), start from tomorrow; else from the anchor day itself.
  const startOffset = fromDate.getTime() <= now.getTime() ? 1 : 0;

  for (let i = startOffset; i <= LOOKAHEAD_DAYS && slots.length < count; i++) {
    const day = new Date(anchorUtc + i * 86400000);
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue; // business days
    for (const hour of hours) {
      if (slots.length >= count) break;
      const startIso = zonedIso(y, m, d, hour, 0, tz);
      const startMs = new Date(startIso).getTime();
      if (startMs < now.getTime() + MIN_LEAD_MS) continue;
      if (startMs < fromDate.getTime()) continue; // strictly at/after the anchor instant
      const endMs = startMs + duration * 60000;
      if (conflicts(busy, startMs, endMs)) continue;
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

/** The soonest few open slots — for the AI's proactive offer. */
export async function getAvailableSlots(args: {
  agentId: string; callbackUrl: string; timeZone?: string; durationMinutes?: number; count?: number; now?: Date;
}): Promise<Slot[]> {
  const tz = args.timeZone?.trim() || DEFAULT_TZ;
  const duration = args.durationMinutes ?? 30;
  const now = args.now ?? new Date();
  const busy = await fetchBusy(args.agentId, args.callbackUrl, now.toISOString(), new Date(now.getTime() + (LOOKAHEAD_DAYS + 1) * 86400000).toISOString());
  return buildSlots({ now, tz, duration, hours: OFFER_HOURS, busy, fromDate: now, count: args.count ?? 3 });
}

/**
 * More/near times. Pass fromIso to anchor near a specific request ("how about
 * Wednesday?") or after the last offer ("none of those work"). Uses a fuller
 * hourly menu so a specific ask can be honored.
 */
export async function findSlots(args: {
  agentId: string; callbackUrl: string; timeZone?: string; durationMinutes?: number; count?: number; fromIso?: string; now?: Date;
}): Promise<Slot[]> {
  const tz = args.timeZone?.trim() || DEFAULT_TZ;
  const duration = args.durationMinutes ?? 30;
  const now = args.now ?? new Date();
  const parsed = args.fromIso ? new Date(args.fromIso) : now;
  const anchor = isNaN(parsed.getTime()) ? now : parsed;
  const winStart = anchor.getTime() < now.getTime() ? now : anchor;
  const busy = await fetchBusy(args.agentId, args.callbackUrl, winStart.toISOString(), new Date(winStart.getTime() + (LOOKAHEAD_DAYS + 1) * 86400000).toISOString());
  return buildSlots({ now, tz, duration, hours: GRANULAR_HOURS, busy, fromDate: anchor, count: args.count ?? 4 });
}

/**
 * Validate + re-check a specific time before booking. The AI only passes an iso
 * it already got from getAvailableSlots/findSlots, but we re-check conflicts at
 * commit to avoid a race. Returns normalized start/end/label, or a reason +
 * nearby alternatives when it's not bookable.
 */
export async function resolveTime(args: {
  agentId: string; callbackUrl: string; timeZone?: string; durationMinutes?: number; iso: string; now?: Date;
}): Promise<{ ok: boolean; startIso?: string; endIso?: string; label?: string; reason?: string; alternatives: Slot[] }> {
  const tz = args.timeZone?.trim() || DEFAULT_TZ;
  const duration = args.durationMinutes ?? 30;
  const now = args.now ?? new Date();
  const start = new Date(args.iso);
  const alternatives = () =>
    findSlots({ agentId: args.agentId, callbackUrl: args.callbackUrl, timeZone: tz, durationMinutes: duration, fromIso: args.iso, now });

  if (isNaN(start.getTime())) return { ok: false, reason: 'invalid time', alternatives: await alternatives() };
  if (start.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, reason: 'that time is in the past or too soon', alternatives: await alternatives() };
  const lp = localParts(start, tz);
  if (lp.weekday === 0 || lp.weekday === 6) return { ok: false, reason: 'that day is a weekend', alternatives: await alternatives() };
  if (lp.hour < WORK_START || lp.hour >= WORK_END) return { ok: false, reason: 'that time is outside business hours', alternatives: await alternatives() };

  const endMs = start.getTime() + duration * 60000;
  const busy = await fetchBusy(args.agentId, args.callbackUrl, start.toISOString(), new Date(endMs).toISOString());
  if (conflicts(busy, start.getTime(), endMs)) return { ok: false, reason: 'that time just filled up', alternatives: await alternatives() };

  return { ok: true, startIso: start.toISOString(), endIso: new Date(endMs).toISOString(), label: labelFor(start.toISOString(), tz), alternatives: [] };
}
