import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { name, email, clientCount, biggestDifference } = await req.json();

    if (!name || !email || !clientCount || !biggestDifference) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const firestore = getAdminFirestore();
    await firestore.collection('foundingMemberApplications').add({
      name,
      email,
      clientCount,
      biggestDifference,
      timestamp: new Date(),
      status: 'pending',
    });

    // Send notification email to admin (fire-and-forget)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app'}/api/admin/applications/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantName: name, applicantEmail: email }),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error submitting founding member application:', error);
    return NextResponse.json(
      { error: 'Failed to submit application' },
      { status: 500 }
    );
  }
}
