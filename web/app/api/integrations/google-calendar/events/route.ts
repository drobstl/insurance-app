import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import {
  GoogleCalendarNotConnectedError,
  resolveGoogleCalendarAccessToken,
} from '../../../../../lib/google-calendar';
import { buildGoogleCallbackUrl, GOOGLE_CALENDAR_CALLBACK_PATH } from '../../../../../lib/oauth-redirect';

/**
 * GET /api/integrations/google-calendar/events?date=YYYY-MM-DD&tz=America/Chicago
 *
 * Returns the agent's Google Calendar events for the given day,
 * anchored to the given IANA timezone. Used by the AppointmentPicker
 * to render a day-strip with busy blocks + detect conflicts before
 * the agent saves a booking.
 *
 * Falls back gracefully when Calendar isn't connected — returns
 * `{ connected: false, events: [] }` rather than 4xx so the picker
 * just hides the strip.
 */

interface EventBlock {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  /** True for all-day events; the strip can render these as a banner. */
  allDay: boolean;
}

interface EventsResponse {
  connected: boolean;
  events: EventBlock[];
  error?: string;
}

async function requireAgentId(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.split('Bearer ')[1];
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

function dayBoundsIso(dateStr: string, tz: string): { timeMin: string; timeMax: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  // Build start-of-day and end-of-day Date objects in the agent's TZ
  // by composing the wall-clock string and letting the Calendar API
  // interpret via `timeZone`. We need ISO strings with offsets here.
  // Strategy: construct a UTC-naive Date for the local midnight, then
  // adjust by the TZ offset at that moment.
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Local midnight in browser TZ — we don't care here because we'll
    // pass `timeZone` to the Calendar API, but timeMin/timeMax must be
    // RFC3339 with offset. Use Intl to derive the offset for tz at that date.
    const fakeUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const tzOffsetMs = tzOffsetAt(fakeUtc, tz);
    const startUtcMs = fakeUtc.getTime() - tzOffsetMs;
    const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
    return {
      timeMin: new Date(startUtcMs).toISOString(),
      timeMax: new Date(endUtcMs).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Return the offset (in ms) such that:
 *   localWallClock(date, tz) ≈ utc(date) + offsetMs
 * Used to convert a naive "midnight in TZ" to the UTC instant.
 */
function tzOffsetAt(date: Date, tz: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export async function GET(req: NextRequest): Promise<NextResponse<EventsResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || '';
    const tz = (url.searchParams.get('tz') || 'UTC').slice(0, 80);

    const bounds = dayBoundsIso(date, tz);
    if (!bounds) {
      return NextResponse.json({ connected: false, events: [], error: 'Invalid date' }, { status: 400 });
    }

    let accessToken: string;
    let calendarId: string;
    try {
      const callbackUrl = buildGoogleCallbackUrl(req.url, GOOGLE_CALENDAR_CALLBACK_PATH);
      const resolved = await resolveGoogleCalendarAccessToken(agentId, callbackUrl);
      accessToken = resolved.accessToken;
      calendarId = resolved.calendarId;
    } catch (err) {
      if (err instanceof GoogleCalendarNotConnectedError) {
        return NextResponse.json({ connected: false, events: [] });
      }
      throw err;
    }

    const params = new URLSearchParams({
      timeMin: bounds.timeMin,
      timeMax: bounds.timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: tz,
      maxResults: '50',
    });
    const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const reason = await res.text().catch(() => `HTTP ${res.status}`);
      return NextResponse.json(
        { connected: true, events: [], error: `Calendar fetch failed: ${reason.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { items?: Array<{
      id?: string;
      summary?: string;
      status?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }> };
    const items = data.items ?? [];

    const events: EventBlock[] = items
      .filter((e) => e.status !== 'cancelled')
      .map<EventBlock | null>((e) => {
        const startDT = e.start?.dateTime;
        const endDT = e.end?.dateTime;
        const startDate = e.start?.date;
        const endDate = e.end?.date;
        if (startDT && endDT) {
          return {
            id: e.id || '',
            title: e.summary || '(no title)',
            startIso: startDT,
            endIso: endDT,
            allDay: false,
          };
        }
        if (startDate && endDate) {
          return {
            id: e.id || '',
            title: e.summary || '(no title)',
            startIso: new Date(startDate).toISOString(),
            endIso: new Date(endDate).toISOString(),
            allDay: true,
          };
        }
        return null;
      })
      .filter((e): e is EventBlock => e !== null);

    return NextResponse.json({ connected: true, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch calendar events.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ connected: false, events: [], error: message }, { status });
  }
}
