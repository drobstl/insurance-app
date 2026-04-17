import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../lib/firebase-admin';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const db = getAdminFirestore();

  const snap = await db
    .collection('agents')
    .where('bookingSlug', '==', slug.toLowerCase())
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: 'Booking link not found' }, { status: 404 });
  }

  const agentData = snap.docs[0].data() as Record<string, unknown>;
  const schedulingUrl = (agentData.schedulingUrl as string) || '';
  if (!schedulingUrl.startsWith('http://') && !schedulingUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'Booking link is not configured' }, { status: 422 });
  }

  const redirectUrl = new URL(schedulingUrl);
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    if (!redirectUrl.searchParams.has(key)) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(redirectUrl.toString(), 302);
}
