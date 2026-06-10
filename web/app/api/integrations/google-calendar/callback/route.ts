import { NextRequest, NextResponse } from 'next/server';
import { consumeGoogleOAuthState } from '../../../../../lib/google-drive-store';
import {
  getGoogleCalendarIntegration,
  upsertGoogleCalendarTokens,
} from '../../../../../lib/google-calendar-store';
import { exchangeGoogleCodeForTokens } from '../../../../../lib/google-oauth';
import {
  buildGoogleCallbackUrl,
  GOOGLE_CALENDAR_CALLBACK_PATH,
  resolveCanonicalOrigin,
} from '../../../../../lib/oauth-redirect';

function callbackRedirect(req: NextRequest, returnTo: string | undefined, params: Record<string, string>): URL {
  const target = new URL(returnTo || '/dashboard', resolveCanonicalOrigin(req.url));
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }
  return target;
}

function readGoogleEmailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof payload.email === 'string' ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(
      callbackRedirect(req, undefined, {
        google_calendar: 'error',
        reason: oauthError,
      }),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      callbackRedirect(req, undefined, {
        google_calendar: 'error',
        reason: 'missing_code_or_state',
      }),
    );
  }

  try {
    const consumed = await consumeGoogleOAuthState(state);
    if (!consumed?.agentId) {
      return NextResponse.redirect(
        callbackRedirect(req, undefined, {
          google_calendar: 'error',
          reason: 'invalid_or_expired_state',
        }),
      );
    }

    const prior = await getGoogleCalendarIntegration(consumed.agentId);
    const exchanged = await exchangeGoogleCodeForTokens({
      code,
      redirectUri: buildGoogleCallbackUrl(req.url, GOOGLE_CALENDAR_CALLBACK_PATH),
    });
    const googleEmail = readGoogleEmailFromIdToken(exchanged.idToken);

    await upsertGoogleCalendarTokens(consumed.agentId, {
      googleEmail,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken || prior?.refreshToken,
      expiryDateMs: exchanged.expiryDateMs,
      scope: exchanged.scope,
      tokenType: exchanged.tokenType,
      calendarId: prior?.calendarId,
    });

    return NextResponse.redirect(
      callbackRedirect(req, consumed.returnTo, {
        google_calendar: 'success',
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'oauth_callback_failed';
    return NextResponse.redirect(
      callbackRedirect(req, undefined, {
        google_calendar: 'error',
        reason,
      }),
    );
  }
}
