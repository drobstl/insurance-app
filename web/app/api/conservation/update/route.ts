import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

type ResolvableStatus = 'saved' | 'lost';

/**
 * PATCH /api/conservation/update
 *
 * Updates a conservation alert's status and optionally syncs the policy status.
 *
 * Body: { alertId: string, status: 'saved' | 'lost', notes?: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    const { alertId, status, notes } = await req.json();

    if (!alertId) {
      return NextResponse.json({ error: 'Missing required field: alertId' }, { status: 400 });
    }

    const validStatuses: ResolvableStatus[] = ['saved', 'lost'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Status must be "saved" or "lost"' },
        { status: 400 },
      );
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

    if (alertData.status === 'saved' || alertData.status === 'lost') {
      return NextResponse.json(
        { error: 'Alert is already resolved' },
        { status: 422 },
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status,
      resolvedAt: now,
    };

    if (notes !== undefined) {
      updates.notes = notes;
    }

    await alertRef.update(updates);

    // Sync policy status if the alert is matched to a policy
    const clientId = alertData.clientId as string | null;
    const policyId = alertData.policyId as string | null;

    if (clientId && policyId) {
      const policyRef = db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .doc(clientId)
        .collection('policies')
        .doc(policyId);

      if (status === 'saved') {
        await policyRef.update({ status: 'Active' });
      }
      // For 'lost', policy stays Lapsed
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating conservation alert:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to update conservation alert' },
      { status: 500 },
    );
  }
}
