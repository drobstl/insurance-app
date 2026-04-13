import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import {
  clearGoogleDriveIntegration,
  getGoogleDriveIntegration,
  updateGoogleDriveTokens,
} from '../../../../../lib/google-drive-store';
import {
  GOOGLE_DRIVE_RECONNECT_USER_MESSAGE,
  isGoogleInvalidGrantError,
  refreshGoogleAccessToken,
} from '../../../../../lib/google-oauth';

interface TokenRouteResponse {
  success: boolean;
  accessToken?: string;
  expiresAtMs?: number;
  error?: string;
}

const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60_000;

function getCallbackUrl(req: NextRequest): string {
  const url = new URL(req.url);
  return `${url.origin}/api/integrations/google/callback`;
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

export async function GET(req: NextRequest): Promise<NextResponse<TokenRouteResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const integration = await getGoogleDriveIntegration(agentId);
    if (!integration?.connected) {
      return NextResponse.json(
        { success: false, error: 'Google Drive is not connected.' },
        { status: 404 },
      );
    }

    const now = Date.now();
    const hasValidAccessToken =
      !!integration.accessToken &&
      typeof integration.expiryDateMs === 'number' &&
      integration.expiryDateMs > now + ACCESS_TOKEN_SAFETY_WINDOW_MS;

    if (hasValidAccessToken) {
      return NextResponse.json({
        success: true,
        accessToken: integration.accessToken,
        expiresAtMs: integration.expiryDateMs,
      });
    }

    if (!integration.refreshToken) {
      return NextResponse.json(
        { success: false, error: 'Google token expired and no refresh token is available. Reconnect required.' },
        { status: 401 },
      );
    }

    let refreshed;
    try {
      refreshed = await refreshGoogleAccessToken({
        refreshToken: integration.refreshToken,
        redirectUri: getCallbackUrl(req),
      });
    } catch (refreshErr) {
      if (isGoogleInvalidGrantError(refreshErr)) {
        await clearGoogleDriveIntegration(agentId);
        return NextResponse.json(
          { success: false, error: GOOGLE_DRIVE_RECONNECT_USER_MESSAGE },
          { status: 401 },
        );
      }
      throw refreshErr;
    }

    const nextAccessToken = refreshed.accessToken || integration.accessToken;
    const nextRefreshToken = refreshed.refreshToken || integration.refreshToken;
    if (!nextAccessToken) {
      return NextResponse.json(
        { success: false, error: 'Unable to refresh Google access token.' },
        { status: 401 },
      );
    }

    await updateGoogleDriveTokens(agentId, {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      expiryDateMs: refreshed.expiryDateMs,
      tokenType: refreshed.tokenType,
      scope: refreshed.scope,
    });

    return NextResponse.json({
      success: true,
      accessToken: nextAccessToken,
      expiresAtMs: refreshed.expiryDateMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Google Drive token.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
