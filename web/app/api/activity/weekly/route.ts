import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

interface ActivityItem {
  id: string;
  type: 'birthday' | 'holiday' | 'anniversary' | 'retention' | 'referral' | 'policy-review';
  summary: string;
  timestamp: string;
}

const HOLIDAY_LABELS: Record<string, string> = {
  christmas: 'Christmas',
  newyear: "New Year's",
  valentines: "Valentine's Day",
  july4th: '4th of July',
  thanksgiving: 'Thanksgiving',
};

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

    const agentRef = db.collection('agents').doc(agentId);

    const [clientsSnap, referralsSnap, reviewsSnap] = await Promise.all([
      agentRef.collection('clients').get(),
      agentRef.collection('referrals').get(),
      agentRef.collection('policyReviews').get(),
    ]);

    const clientNameMap = new Map<string, string>();
    for (const c of clientsSnap.docs) {
      clientNameMap.set(c.id, (c.data().name as string) || 'Client');
    }

    const items: ActivityItem[] = [];

    // ── Notifications (birthday, holiday, anniversary, conservation) ──
    const notifQueries = clientsSnap.docs.map((clientDoc) =>
      agentRef
        .collection('clients')
        .doc(clientDoc.id)
        .collection('notifications')
        .where('sentAt', '>=', sevenDaysAgo)
        .get()
        .then((snap) => ({ clientId: clientDoc.id, snap })),
    );

    const notifResults = await Promise.all(notifQueries);
    for (const { clientId, snap } of notifResults) {
      const name = clientNameMap.get(clientId) || 'Client';
      for (const notifDoc of snap.docs) {
        const d = notifDoc.data();
        const sentAt = d.sentAt as Timestamp | undefined;
        if (!sentAt) continue;
        const ts = sentAt.toDate().toISOString();
        const notifType = d.type as string;

        if (notifType === 'birthday') {
          items.push({
            id: notifDoc.id,
            type: 'birthday',
            summary: `Sent birthday message to ${name}`,
            timestamp: ts,
          });
        } else if (notifType === 'holiday') {
          const holidayKey = (d.holiday as string) || '';
          const holidayLabel = HOLIDAY_LABELS[holidayKey] || 'holiday';
          items.push({
            id: notifDoc.id,
            type: 'holiday',
            summary: `Sent ${holidayLabel} card to ${name}`,
            timestamp: ts,
          });
        } else if (notifType === 'anniversary') {
          items.push({
            id: notifDoc.id,
            type: 'anniversary',
            summary: `Sent anniversary reminder to ${name}`,
            timestamp: ts,
          });
        } else if (notifType === 'conservation') {
          items.push({
            id: notifDoc.id,
            type: 'retention',
            summary: `Retention outreach to ${name}`,
            timestamp: ts,
          });
        }
      }
    }

    // ── Referrals ────────────────────────────────────────────────────
    for (const refDoc of referralsSnap.docs) {
      const d = refDoc.data();
      const createdAt = d.createdAt as Timestamp | undefined;
      const lastDripAt = d.lastDripAt as Timestamp | undefined;

      const recentTimestamp = lastDripAt && lastDripAt.toMillis() >= sevenDaysAgo.toMillis()
        ? lastDripAt
        : createdAt && createdAt.toMillis() >= sevenDaysAgo.toMillis()
          ? createdAt
          : null;

      if (!recentTimestamp) continue;

      const referralName = (d.referralName as string) || 'prospect';
      const dripCount = (d.dripCount as number) || 0;
      const summary = dripCount > 0
        ? `Followed up on referral ${referralName}`
        : `Referral outreach to ${referralName}`;

      items.push({
        id: refDoc.id,
        type: 'referral',
        summary,
        timestamp: recentTimestamp.toDate().toISOString(),
      });
    }

    // ── Policy Reviews ───────────────────────────────────────────────
    for (const revDoc of reviewsSnap.docs) {
      const d = revDoc.data();
      const createdAt = d.createdAt as Timestamp | undefined;
      const lastDripAt = d.lastDripAt as Timestamp | undefined;

      const recentTimestamp = lastDripAt && lastDripAt.toMillis() >= sevenDaysAgo.toMillis()
        ? lastDripAt
        : createdAt && createdAt.toMillis() >= sevenDaysAgo.toMillis()
          ? createdAt
          : null;

      if (!recentTimestamp) continue;

      const clientName = (d.clientName as string) || 'client';
      const policyType = (d.policyType as string) || '';
      const dripCount = (d.dripCount as number) || 0;
      const summary = dripCount > 0
        ? `Followed up on ${clientName}'s${policyType ? ` ${policyType}` : ''} review`
        : `Sent policy review to ${clientName}`;

      items.push({
        id: revDoc.id,
        type: 'policy-review',
        summary,
        timestamp: recentTimestamp.toDate().toISOString(),
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ items: items.slice(0, 6) });
  } catch (error) {
    console.error('Weekly activity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
