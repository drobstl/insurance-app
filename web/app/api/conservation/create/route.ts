import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { createConservationAlert } from '../../../../lib/conservation-core';

/**
 * POST /api/conservation/create
 *
 * Dashboard paste intake: accepts raw carrier text, runs AI extraction,
 * auto-matches client/policy, computes priority, and schedules outreach.
 *
 * Body: { rawText: string }
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

    const { rawText } = await req.json();
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: rawText' },
        { status: 400 },
      );
    }

    const result = await createConservationAlert(agentId, rawText.trim(), 'paste');

    return NextResponse.json({
      success: true,
      alertId: result.alertId,
      matched: result.matched,
      alert: {
        clientName: result.alert.clientName,
        policyNumber: result.alert.policyNumber,
        carrier: result.alert.carrier,
        reason: result.alert.reason,
        priority: result.alert.priority,
        isChargebackRisk: result.alert.isChargebackRisk,
        policyAge: result.alert.policyAge,
        policyType: result.alert.policyType,
        status: result.alert.status,
        scheduledOutreachAt: result.alert.scheduledOutreachAt,
        initialMessage: result.alert.initialMessage,
        aiInsight: result.alert.aiInsight,
      },
    });
  } catch (error) {
    console.error('Error creating conservation alert:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to create conservation alert' },
      { status: 500 },
    );
  }
}
