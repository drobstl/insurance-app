import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { createManualConservationAlert } from '../../../../lib/conservation-core';
import type { ConservationReason } from '../../../../lib/conservation-types';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const agentId = decoded.uid;

    const { clientId, policyId, reason } = await req.json();

    if (!clientId || !policyId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, policyId, reason' },
        { status: 400 },
      );
    }

    const validReasons: ConservationReason[] = ['lapsed_payment', 'cancellation'];
    if (!validReasons.includes(reason)) {
      return NextResponse.json(
        { error: 'Invalid reason. Must be lapsed_payment or cancellation.' },
        { status: 400 },
      );
    }

    const result = await createManualConservationAlert(agentId, {
      clientId,
      policyId,
      reason,
    });

    return NextResponse.json({
      success: true,
      alertId: result.alertId,
      alert: result.alert,
      matched: result.matched,
    });
  } catch (error) {
    console.error('Flag at risk error:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof Error && (error.message === 'Client not found' || error.message === 'Policy not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to create conservation alert' },
      { status: 500 },
    );
  }
}
