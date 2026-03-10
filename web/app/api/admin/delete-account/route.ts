import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';
import { getStripe } from '../../../../lib/stripe';

/**
 * POST /api/admin/delete-account
 * Body: { agentId: string }
 *
 * Permanently deletes an agent account and ALL associated data:
 *   - Firestore: agent doc + all subcollections (clients, policies,
 *     notifications, referrals, conservationAlerts, policyReviews, stats)
 *   - Firestore: clientCodes entries referencing this agent
 *   - Firestore: featureIdeaVotes, bugReports, surveyResponses by this agent
 *   - Firebase Auth user
 *   - Stripe subscription (cancels immediately)
 *   - Firebase Storage files (business card, feedback screenshots)
 *
 * Caller must be an admin (Bearer token + NEXT_PUBLIC_ADMIN_EMAILS).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);

    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
    if (!agentId) {
      return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
    }

    const firestore = getAdminFirestore();
    const agentRef = firestore.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();

    if (!agentDoc.exists) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agentData = agentDoc.data()!;
    const deletionLog: string[] = [];

    // 1. Delete all client subcollections (policies, notifications) then client docs
    const clientsSnap = await agentRef.collection('clients').get();
    for (const clientDoc of clientsSnap.docs) {
      const clientRef = clientDoc.ref;

      const policiesSnap = await clientRef.collection('policies').get();
      const policyBatch = firestore.batch();
      policiesSnap.docs.forEach((d) => policyBatch.delete(d.ref));
      await policyBatch.commit();
      deletionLog.push(`Deleted ${policiesSnap.size} policies for client ${clientDoc.id}`);

      const notifsSnap = await clientRef.collection('notifications').get();
      const notifBatch = firestore.batch();
      notifsSnap.docs.forEach((d) => notifBatch.delete(d.ref));
      await notifBatch.commit();
      deletionLog.push(`Deleted ${notifsSnap.size} notifications for client ${clientDoc.id}`);

      await clientRef.delete();
    }
    deletionLog.push(`Deleted ${clientsSnap.size} clients`);

    // 2. Delete agent-level subcollections
    const subcollections = ['referrals', 'conservationAlerts', 'policyReviews'];
    for (const name of subcollections) {
      const snap = await agentRef.collection(name).get();
      const batch = firestore.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletionLog.push(`Deleted ${snap.size} ${name}`);
    }

    // 3. Delete stats/aggregates
    const statsAggDoc = agentRef.collection('stats').doc('aggregates');
    const statsSnap = await statsAggDoc.get();
    if (statsSnap.exists) {
      await statsAggDoc.delete();
      deletionLog.push('Deleted stats/aggregates');
    }

    // 4. Delete clientCodes referencing this agent
    const codesSnap = await firestore
      .collection('clientCodes')
      .where('agentId', '==', agentId)
      .get();
    const codeBatch = firestore.batch();
    codesSnap.docs.forEach((d) => codeBatch.delete(d.ref));
    await codeBatch.commit();
    deletionLog.push(`Deleted ${codesSnap.size} clientCodes`);

    // 5. Delete featureIdeaVotes by this agent
    const votesSnap = await firestore
      .collection('featureIdeaVotes')
      .where('agentUid', '==', agentId)
      .get();
    const votesBatch = firestore.batch();
    votesSnap.docs.forEach((d) => votesBatch.delete(d.ref));
    await votesBatch.commit();
    deletionLog.push(`Deleted ${votesSnap.size} featureIdeaVotes`);

    // 6. Delete bugReports by this agent
    const bugsSnap = await firestore
      .collection('bugReports')
      .where('agentUid', '==', agentId)
      .get();
    const bugsBatch = firestore.batch();
    bugsSnap.docs.forEach((d) => bugsBatch.delete(d.ref));
    await bugsBatch.commit();
    deletionLog.push(`Deleted ${bugsSnap.size} bugReports`);

    // 7. Delete surveyResponses by this agent
    const surveysSnap = await firestore
      .collection('surveyResponses')
      .where('agentUid', '==', agentId)
      .get();
    const surveysBatch = firestore.batch();
    surveysSnap.docs.forEach((d) => surveysBatch.delete(d.ref));
    await surveysBatch.commit();
    deletionLog.push(`Deleted ${surveysSnap.size} surveyResponses`);

    // 8. Cancel Stripe subscription if active
    const stripeCustomerId = agentData.stripeCustomerId as string | undefined;
    if (stripeCustomerId) {
      try {
        const stripe = getStripe();
        const subs = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'active',
        });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
          deletionLog.push(`Cancelled Stripe subscription ${sub.id}`);
        }
      } catch (stripeErr) {
        deletionLog.push(`Stripe cleanup warning: ${stripeErr instanceof Error ? stripeErr.message : 'unknown error'}`);
      }
    }

    // 9. Delete Firebase Storage files
    try {
      const bucket = getAdminStorage().bucket();

      const [businessCard] = await bucket.file(`business-cards/${agentId}.jpg`).exists();
      if (businessCard) {
        await bucket.file(`business-cards/${agentId}.jpg`).delete();
        deletionLog.push('Deleted business card image');
      }

      const [screenshotFiles] = await bucket.getFiles({ prefix: `feedback-screenshots/${agentId}/` });
      for (const file of screenshotFiles) {
        await file.delete();
      }
      if (screenshotFiles.length > 0) {
        deletionLog.push(`Deleted ${screenshotFiles.length} feedback screenshots`);
      }
    } catch (storageErr) {
      deletionLog.push(`Storage cleanup warning: ${storageErr instanceof Error ? storageErr.message : 'unknown error'}`);
    }

    // 10. Delete the agent document itself
    await agentRef.delete();
    deletionLog.push('Deleted agent document');

    // 11. Delete Firebase Auth user
    try {
      await adminAuth.deleteUser(agentId);
      deletionLog.push('Deleted Firebase Auth user');
    } catch (authErr) {
      deletionLog.push(`Auth cleanup warning: ${authErr instanceof Error ? authErr.message : 'unknown error'}`);
    }

    return NextResponse.json({
      ok: true,
      agentId,
      message: 'Account and all associated data permanently deleted.',
      deletionLog,
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: 500 }
    );
  }
}
