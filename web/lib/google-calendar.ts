import 'server-only';

import {
  GOOGLE_DRIVE_RECONNECT_USER_MESSAGE,
  isGoogleInvalidGrantError,
  refreshGoogleAccessToken,
} from './google-oauth';
import {
  clearGoogleCalendarIntegration,
  getGoogleCalendarIntegration,
  updateGoogleCalendarTokens,
} from './google-calendar-store';

const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60_000;

export class GoogleCalendarNotConnectedError extends Error {
  constructor() {
    super('Google Calendar is not connected for this agent.');
    this.name = 'GoogleCalendarNotConnectedError';
  }
}

export class GoogleCalendarReconnectRequiredError extends Error {
  constructor() {
    super(GOOGLE_DRIVE_RECONNECT_USER_MESSAGE.replace(/Google Drive/g, 'Google Calendar'));
    this.name = 'GoogleCalendarReconnectRequiredError';
  }
}

/**
 * Resolve a valid Google Calendar access token for an agent.
 *
 * Mirrors the Drive `resolveGoogleAccessToken` helper in
 * web/app/api/integrations/google/import/route.ts: serves the cached
 * access token when valid, refreshes when stale, clears + throws when
 * the refresh token is itself revoked (invalid_grant).
 *
 * Throws GoogleCalendarNotConnectedError when no integration record
 * exists (so callers can decide to silently skip the sync rather than
 * fail the underlying write).
 */
export async function resolveGoogleCalendarAccessToken(
  agentId: string,
  redirectUri: string,
): Promise<{ accessToken: string; calendarId: string }> {
  const integration = await getGoogleCalendarIntegration(agentId);
  if (!integration?.connected) {
    throw new GoogleCalendarNotConnectedError();
  }

  const calendarId = integration.calendarId || 'primary';
  const now = Date.now();
  const hasValidAccessToken =
    !!integration.accessToken &&
    typeof integration.expiryDateMs === 'number' &&
    integration.expiryDateMs > now + ACCESS_TOKEN_SAFETY_WINDOW_MS;

  if (hasValidAccessToken && integration.accessToken) {
    return { accessToken: integration.accessToken, calendarId };
  }

  if (!integration.refreshToken) {
    throw new GoogleCalendarReconnectRequiredError();
  }

  let refreshed;
  try {
    refreshed = await refreshGoogleAccessToken({
      refreshToken: integration.refreshToken,
      redirectUri,
    });
  } catch (refreshErr) {
    if (isGoogleInvalidGrantError(refreshErr)) {
      await clearGoogleCalendarIntegration(agentId);
      throw new GoogleCalendarReconnectRequiredError();
    }
    throw refreshErr;
  }

  const nextAccessToken = refreshed.accessToken || integration.accessToken;
  const nextRefreshToken = refreshed.refreshToken || integration.refreshToken;
  if (!nextAccessToken) {
    throw new GoogleCalendarReconnectRequiredError();
  }

  await updateGoogleCalendarTokens(agentId, {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    expiryDateMs: refreshed.expiryDateMs,
    tokenType: refreshed.tokenType,
    scope: refreshed.scope,
  });

  return { accessToken: nextAccessToken, calendarId };
}

interface CalendarEventInput {
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  /**
   * IANA TZ name (e.g. "America/Chicago"). When set, Google Calendar
   * anchors the event to this zone so it renders consistently
   * regardless of the viewer's calendar TZ. When omitted, the event
   * uses the calendar's default TZ.
   */
  timeZone?: string;
  /**
   * Attendees to invite. Google emails each one a calendar invite
   * with RSVP. Pass the lead here when the agent wants the lead to
   * get a real calendar invite (vs SMS-only).
   */
  attendees?: Array<{ email: string; displayName?: string }>;
  /**
   * When true, asks Google to create a unique Google Meet link on
   * the event (`conferenceData.createRequest`). The created link
   * shows up as `hangoutLink` in the response.
   */
  addGoogleMeet?: boolean;
}

interface CalendarEventResponse {
  id: string;
  htmlLink?: string;
  /** Google Meet URL when `addGoogleMeet=true` was requested. */
  hangoutLink?: string;
}

function calendarApiBase(calendarId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

function buildEventBody(input: CalendarEventInput): Record<string, unknown> {
  const start: Record<string, unknown> = { dateTime: input.startIso };
  const end: Record<string, unknown> = { dateTime: input.endIso };
  if (input.timeZone) {
    start.timeZone = input.timeZone;
    end.timeZone = input.timeZone;
  }
  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description,
    start,
    end,
  };
  if (input.attendees && input.attendees.length > 0) {
    body.attendees = input.attendees.map((a) => ({
      email: a.email,
      ...(a.displayName ? { displayName: a.displayName } : {}),
    }));
  }
  if (input.addGoogleMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `afl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  return body;
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function createCalendarEvent(args: {
  accessToken: string;
  calendarId: string;
  event: CalendarEventInput;
}): Promise<CalendarEventResponse> {
  const params = new URLSearchParams();
  // Required for Google to honor conferenceData.createRequest.
  if (args.event.addGoogleMeet) params.set('conferenceDataVersion', '1');
  // Required for Google to send invite emails to attendees.
  if (args.event.attendees && args.event.attendees.length > 0) {
    params.set('sendUpdates', 'all');
  }
  const qs = params.toString();
  const url = qs ? `${calendarApiBase(args.calendarId)}?${qs}` : calendarApiBase(args.calendarId);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventBody(args.event)),
  });
  if (!res.ok) {
    throw new Error(`createCalendarEvent failed: ${await readError(res)}`);
  }
  const data = (await res.json()) as { id?: string; htmlLink?: string; hangoutLink?: string };
  if (!data.id) {
    throw new Error('createCalendarEvent returned no event id');
  }
  return { id: data.id, htmlLink: data.htmlLink, hangoutLink: data.hangoutLink };
}

export async function patchCalendarEvent(args: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: Partial<CalendarEventInput>;
}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (args.event.title !== undefined) body.summary = args.event.title;
  if (args.event.description !== undefined) body.description = args.event.description;
  if (args.event.startIso !== undefined) {
    body.start = args.event.timeZone
      ? { dateTime: args.event.startIso, timeZone: args.event.timeZone }
      : { dateTime: args.event.startIso };
  }
  if (args.event.endIso !== undefined) {
    body.end = args.event.timeZone
      ? { dateTime: args.event.endIso, timeZone: args.event.timeZone }
      : { dateTime: args.event.endIso };
  }

  // `sendUpdates=all` ensures attendees get notified on reschedules.
  // Harmless when the event has no attendees.
  const url = `${calendarApiBase(args.calendarId)}/${encodeURIComponent(args.eventId)}?sendUpdates=all`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`patchCalendarEvent failed: ${await readError(res)}`);
  }
}

export async function deleteCalendarEvent(args: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  // sendUpdates=all so attendees get a cancellation email if any.
  const url = `${calendarApiBase(args.calendarId)}/${encodeURIComponent(args.eventId)}?sendUpdates=all`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  if (res.ok || res.status === 404 || res.status === 410) {
    return;
  }
  throw new Error(`deleteCalendarEvent failed: ${await readError(res)}`);
}
