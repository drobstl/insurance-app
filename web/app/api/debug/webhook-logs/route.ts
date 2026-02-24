import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getAdminFirestore();
  const snap = await db.collection('_debug_webhook').orderBy('ts', 'desc').limit(20).get();
  const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ logs });
}

export async function DELETE() {
  const db = getAdminFirestore();
  const snap = await db.collection('_debug_webhook').get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return NextResponse.json({ deleted: snap.size });
}
