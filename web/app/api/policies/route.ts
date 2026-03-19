import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../lib/firebase-admin';

function countPolicySignals(policy: Record<string, unknown>): number {
  let signals = 0;
  const textSignalFields = ['policyType', 'policyNumber', 'insuranceCompany'];
  for (const key of textSignalFields) {
    const value = policy[key];
    if (typeof value === 'string' && value.trim().length > 0) signals++;
  }

  const numericSignalFields = ['coverageAmount', 'premiumAmount'];
  for (const key of numericSignalFields) {
    const value = policy[key];
    const num = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
    if (!Number.isNaN(num) && num > 0) signals++;
  }

  return signals;
}

const getAuthUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;

  const token = match[1];
  return getAdminAuth().verifyIdToken(token);
};

function policiesCol(uid: string, clientId: string) {
  return getAdminFirestore()
    .collection('agents')
    .doc(uid)
    .collection('clients')
    .doc(clientId)
    .collection('policies');
}

function serializeTimestamp(ts: FirebaseFirestore.Timestamp | null | undefined) {
  return ts ? { seconds: ts.seconds, nanoseconds: ts.nanoseconds } : null;
}

// ─── GET: list policies for a client ─────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = request.nextUrl.searchParams.get('clientId');
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const snap = await policiesCol(authUser.uid, clientId)
      .orderBy('createdAt', 'desc')
      .get();

    const policies = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, createdAt: serializeTimestamp(data.createdAt) };
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('Error fetching policies:', error);
    return NextResponse.json({ error: 'Failed to fetch policies' }, { status: 500 });
  }
}

// ─── POST: create a policy ───────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, ...policyData } = body;
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const ingestionQualityGate = policyData.ingestionQualityGate === true;
    delete policyData.ingestionQualityGate;

    // Strip undefined values that Firestore rejects
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(policyData)) {
      if (value !== undefined) cleanData[key] = value;
    }

    const signals = countPolicySignals(cleanData);
    if (signals === 0) {
      return NextResponse.json(
        { error: 'Policy requires at least one key field (type, number, company, coverage, or premium).' },
        { status: 400 },
      );
    }
    if (ingestionQualityGate && signals < 2) {
      return NextResponse.json(
        { error: 'Extracted policy data quality too low. Review and complete fields before saving.' },
        { status: 400 },
      );
    }

    const docRef = await policiesCol(authUser.uid, clientId).add({
      ...cleanData,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating policy:', msg, error);
    return NextResponse.json({ error: 'Failed to create policy', detail: msg }, { status: 500 });
  }
}

// ─── PUT: update a policy ────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, policyId, ...updates } = await request.json();
    if (!clientId || !policyId) {
      return NextResponse.json({ error: 'clientId and policyId are required' }, { status: 400 });
    }

    await policiesCol(authUser.uid, clientId).doc(policyId).update(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating policy:', error);
    return NextResponse.json({ error: 'Failed to update policy' }, { status: 500 });
  }
}

// ─── DELETE: delete one or all policies for a client ─────────

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, policyId } = await request.json();
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const col = policiesCol(authUser.uid, clientId);

    if (policyId) {
      await col.doc(policyId).delete();
    } else {
      const snap = await col.get();
      const batch = getAdminFirestore().batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting policy:', error);
    return NextResponse.json({ error: 'Failed to delete policy' }, { status: 500 });
  }
}
