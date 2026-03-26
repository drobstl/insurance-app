import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { clearGoogleDriveIntegration } from '../../../../../lib/google-drive-store';

interface DisconnectRouteResponse {
  success: boolean;
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

export async function POST(req: NextRequest): Promise<NextResponse<DisconnectRouteResponse>> {
  try {
    const agentId = await requireAgentId(req);
    await clearGoogleDriveIntegration(agentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect Google Drive.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
