import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    const db = getAdminFirestore();
    const sevenDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    const [clientsSnap, referralsSnap, conservationSnap] = await Promise.all([
      db.collection('agents').doc(agentId).collection('clients').get(),
      db
        .collection('agents')
        .doc(agentId)
        .collection('referrals')
        .where('createdAt', '>=', sevenDaysAgo)
        .get(),
      db
        .collection('agents')
        .doc(agentId)
        .collection('conservationAlerts')
        .where('createdAt', '>=', sevenDaysAgo)
        .get(),
    ]);

    let birthday = 0;
    let holiday = 0;
    let anniversary = 0;

    const notifQueries = clientsSnap.docs.map((clientDoc) =>
      db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .doc(clientDoc.id)
        .collection('notifications')
        .where('sentAt', '>=', sevenDaysAgo)
        .get(),
    );

    const notifSnaps = await Promise.all(notifQueries);
    for (const snap of notifSnaps) {
      for (const doc of snap.docs) {
        const type = doc.data().type as string;
        if (type === 'birthday') birthday++;
        else if (type === 'holiday') holiday++;
        else if (type === 'anniversary') anniversary++;
      }
    }

    return NextResponse.json({
      birthday,
      holiday,
      anniversary,
      retention: conservationSnap.size,
      referral: referralsSnap.size,
    });
  } catch (error) {
    console.error('Weekly activity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
