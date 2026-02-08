import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../../lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { applicationId, reason } = await req.json();

    if (!applicationId) {
      return NextResponse.json(
        { error: 'Missing applicationId' },
        { status: 400 }
      );
    }

    const firestore = getAdminFirestore();
    await firestore
      .collection('foundingMemberApplications')
      .doc(applicationId)
      .update({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason || null,
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error rejecting application:', error);
    return NextResponse.json(
      { error: 'Failed to reject application' },
      { status: 500 }
    );
  }
}
