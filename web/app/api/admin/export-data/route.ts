import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * GET /api/admin/export-data?agentId=xxx
 *
 * Exports ALL data for the given agent as a JSON download:
 *   - Agent profile
 *   - Clients (with nested policies and notifications)
 *   - Referrals
 *   - Conservation alerts
 *   - Policy reviews
 *   - Stats
 *
 * Caller must be an admin (Bearer token + NEXT_PUBLIC_ADMIN_EMAILS).
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);

    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const agentId = req.nextUrl.searchParams.get('agentId')?.trim();
    if (!agentId) {
      return NextResponse.json({ error: 'Missing agentId query parameter' }, { status: 400 });
    }

    const firestore = getAdminFirestore();
    const agentRef = firestore.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();

    if (!agentDoc.exists) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const serializeDoc = (doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> & { id: string } => ({
      id: doc.id,
      ...doc.data(),
    });

    const serializeCollection = async (ref: FirebaseFirestore.CollectionReference) => {
      const snap = await ref.get();
      return snap.docs.map(serializeDoc);
    };

    // Agent profile
    const agentProfile = serializeDoc(agentDoc);

    // Clients with nested policies and notifications
    const clientsSnap = await agentRef.collection('clients').get();
    const clients = [];
    for (const clientDoc of clientsSnap.docs) {
      const clientData = serializeDoc(clientDoc);

      const policies = await serializeCollection(
        clientDoc.ref.collection('policies')
      );
      const notifications = await serializeCollection(
        clientDoc.ref.collection('notifications')
      );

      clients.push({
        ...clientData,
        policies,
        notifications,
      });
    }

    // Agent-level subcollections
    const referrals = await serializeCollection(agentRef.collection('referrals'));
    const conservationAlerts = await serializeCollection(agentRef.collection('conservationAlerts'));
    const policyReviews = await serializeCollection(agentRef.collection('policyReviews'));

    // Stats
    const statsDoc = await agentRef.collection('stats').doc('aggregates').get();
    const stats = statsDoc.exists ? serializeDoc(statsDoc) : null;

    const exportData = {
      exportedAt: new Date().toISOString(),
      agentId,
      agent: agentProfile,
      clients,
      referrals,
      conservationAlerts,
      policyReviews,
      stats,
    };

    const agentName = (agentProfile.name as string || agentId).replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `agentforlife-export-${agentName}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export data error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export data' },
      { status: 500 }
    );
  }
}
