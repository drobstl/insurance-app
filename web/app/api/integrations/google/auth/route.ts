import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { buildGoogleConsentUrl } from '../../../../../lib/google-oauth';
import { buildGoogleOAuthState, createGoogleOAuthState } from '../../../../../lib/google-drive-store';

interface AuthRouteResponse {
  success: boolean;
  authUrl?: string;
  error?: string;
}

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

export async function POST(req: NextRequest): Promise<NextResponse<AuthRouteResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const stateId = randomUUID();
    await createGoogleOAuthState(agentId, stateId);

    const state = buildGoogleOAuthState(agentId, stateId);
    const authUrl = buildGoogleConsentUrl({
      redirectUri: getCallbackUrl(req),
      state,
    });

    return NextResponse.json({ success: true, authUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start Google OAuth.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
