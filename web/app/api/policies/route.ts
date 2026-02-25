import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../lib/firebase-admin';

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

    const { clientId, ...policyData } = await request.json();
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const docRef = await policiesCol(authUser.uid, clientId).add({
      ...policyData,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error) {
    console.error('Error creating policy:', error);
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 });
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
