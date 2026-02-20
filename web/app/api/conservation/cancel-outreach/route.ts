import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/conservation/cancel-outreach
 *
 * Cancels a scheduled auto-outreach during the grace period.
 * The agent can then handle it personally or re-trigger later.
 *
 * Body: { alertId: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    const { alertId } = await req.json();
    if (!alertId) {
      return NextResponse.json({ error: 'Missing required field: alertId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const alertRef = db
      .collection('agents')
      .doc(agentId)
      .collection('conservationAlerts')
      .doc(alertId);

    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const alertData = alertSnap.data()!;

    if (alertData.status !== 'outreach_scheduled') {
      return NextResponse.json(
        { error: 'Outreach can only be canceled while status is outreach_scheduled' },
        { status: 422 },
      );
    }

    const scheduledAt = alertData.scheduledOutreachAt as string | null;
    if (scheduledAt && new Date(scheduledAt).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'Grace period has already expired. Outreach may have been sent.' },
        { status: 422 },
      );
    }

    await alertRef.update({
      status: 'new',
      scheduledOutreachAt: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error canceling conservation outreach:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to cancel outreach' },
      { status: 500 },
    );
  }
}
