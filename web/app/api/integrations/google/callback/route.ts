import { NextRequest, NextResponse } from 'next/server';
import { consumeGoogleOAuthState, getGoogleDriveIntegration, upsertGoogleDriveTokens } from '../../../../../lib/google-drive-store';
import { exchangeGoogleCodeForTokens } from '../../../../../lib/google-oauth';

function callbackRedirect(req: NextRequest, params: Record<string, string>): URL {
  const base = new URL(req.url);
  const target = new URL('/dashboard', base.origin);
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }
  return target;
}

function getCallbackUrl(req: NextRequest): string {
  const url = new URL(req.url);
  return `${url.origin}/api/integrations/google/callback`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return NextResponse.redirect(
      callbackRedirect(req, {
        google_drive: 'error',
        reason: oauthError,
      }),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      callbackRedirect(req, {
        google_drive: 'error',
        reason: 'missing_code_or_state',
      }),
    );
  }

  try {
    const consumed = await consumeGoogleOAuthState(state);
    if (!consumed?.agentId) {
      return NextResponse.redirect(
        callbackRedirect(req, {
          google_drive: 'error',
          reason: 'invalid_or_expired_state',
        }),
      );
    }

    const prior = await getGoogleDriveIntegration(consumed.agentId);
    const exchanged = await exchangeGoogleCodeForTokens({
      code,
      redirectUri: getCallbackUrl(req),
    });

    await upsertGoogleDriveTokens(consumed.agentId, {
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken || prior?.refreshToken,
      expiryDateMs: exchanged.expiryDateMs,
      scope: exchanged.scope,
      tokenType: exchanged.tokenType,
    });

    return NextResponse.redirect(
      callbackRedirect(req, {
        google_drive: 'success',
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'oauth_callback_failed';
    return NextResponse.redirect(
      callbackRedirect(req, {
        google_drive: 'error',
        reason,
      }),
    );
  }
}
