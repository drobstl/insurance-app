import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { getGoogleDriveIntegration } from '../../../../../lib/google-drive-store';

interface StatusRouteResponse {
  success: boolean;
  connected: boolean;
  data?: {
    connectedAt?: string;
    updatedAt?: string;
    scope?: string;
    hasRefreshToken: boolean;
  };
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

export async function GET(req: NextRequest): Promise<NextResponse<StatusRouteResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const integration = await getGoogleDriveIntegration(agentId);
    if (!integration?.connected) {
      return NextResponse.json({ success: true, connected: false });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      data: {
        connectedAt: integration.connectedAt,
        updatedAt: integration.updatedAt,
        scope: integration.scope,
        hasRefreshToken: !!integration.refreshToken,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read Google Drive status.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, connected: false, error: message }, { status });
  }
}
