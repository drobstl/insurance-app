import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

export async function GET(req: NextRequest) {
  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    await adminAuth.verifyIdToken(token);

    // Fetch all applications, ordered by timestamp descending
    const firestore = getAdminFirestore();
    const snapshot = await firestore
      .collection('foundingMemberApplications')
      .orderBy('timestamp', 'desc')
      .get();

    const applications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        email: data.email || '',
        clientCount: data.clientCount || '',
        biggestDifference: data.biggestDifference || '',
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
        status: data.status || 'pending',
        rejectionReason: data.rejectionReason || undefined,
      };
    });

    return NextResponse.json({ applications });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}
