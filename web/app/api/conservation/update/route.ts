import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

type ResolvableStatus = 'saved' | 'lost';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

/**
 * PATCH /api/conservation/update
 *
 * Updates a conservation alert's status and optionally syncs the policy status.
 *
 * Body: { alertId: string, status: 'saved' | 'lost', notes?: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const agentId = decodedToken.uid;

    const { alertId, status, notes } = await req.json();

    if (!alertId) {
      return NextResponse.json({ error: 'Missing required field: alertId' }, { status: 400 });
    }

    const validStatuses: ResolvableStatus[] = ['saved', 'lost'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Status must be "saved" or "lost"' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    const alertRef = db
      .collection('agents')
      .doc(agentId)
      .collection('conservationAlerts')
      .doc(alertId);

    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const alertData = alertSnap.data()!;

    if (alertData.status === 'saved' || alertData.status === 'lost') {
      return NextResponse.json(
        { error: 'Alert is already resolved' },
        { status: 422 },
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status,
      resolvedAt: now,
    };

    if (notes !== undefined) {
      updates.notes = notes;
    }

    await alertRef.update(updates);

    // Sync policy status if the alert is matched to a policy
    const clientId = alertData.clientId as string | null;
    const policyId = alertData.policyId as string | null;

    if (clientId && policyId) {
      const policyRef = db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .doc(clientId)
        .collection('policies')
        .doc(policyId);

      if (status === 'saved') {
        await policyRef.update({ status: 'Active' });
      }
    }

    // Send celebration to both agent and client when a policy is saved
    if (status === 'saved') {
      const agentDoc = await db.collection('agents').doc(agentId).get();
      const agentData = agentDoc.data();
      const agentEmail = agentData?.email as string | undefined;
      const agentName = (agentData?.name as string) || 'Agent';
      const agentFirstName = agentName.split(' ')[0];
      const clientName = (alertData.clientName as string) || 'Client';
      const clientFirstName = clientName.split(' ')[0];
      const carrier = (alertData.carrier as string) || 'the carrier';
      const policyType = (alertData.policyType as string) || 'insurance';
      const premiumAmount = alertData.premiumAmount as number | null;
      const createdAt = alertData.createdAt;

      let daysToSave = '';
      if (createdAt && typeof createdAt.toDate === 'function') {
        const days = Math.ceil((Date.now() - createdAt.toDate().getTime()) / (1000 * 60 * 60 * 24));
        daysToSave = ` in just ${days} day${days !== 1 ? 's' : ''}`;
      }

      // --- Agent celebration email ---
      try {
        if (agentEmail) {
          const premiumLine = premiumAmount
            ? `\n\nThat's $${premiumAmount}/month in premiums preserved -- and the commission that comes with it.`
            : '';

          const resend = getResend();
          await resend.emails.send({
            from: 'AgentForLife™ <support@agentforlife.app>',
            to: agentEmail,
            subject: `Policy Saved: ${clientName} -- ${carrier}`,
            text: `Great news, ${agentFirstName}!\n\n${clientName}'s ${policyType} policy with ${carrier} has been saved${daysToSave}.${premiumLine}\n\nKeep up the great work.\n\n-- AgentForLife`,
          });
        }
      } catch (emailError) {
        console.error('Failed to send agent celebration email (non-blocking):', emailError);
      }

      // --- Client celebration (SMS / push / email) ---
      try {
        const clientMessage = `Great news, ${clientFirstName}! Your ${policyType} policy with ${carrier} is all set and your coverage is secure. Thanks for taking care of it -- if you ever need anything, don't hesitate to reach out. - ${agentFirstName}`;

        let clientCelebrationSent = false;

        // SMS via Linq if we have a chatId or valid phone
        if (clientId) {
          const clientDoc = await db
            .collection('agents')
            .doc(agentId)
            .collection('clients')
            .doc(clientId)
            .get();

          if (clientDoc.exists) {
            const clientData = clientDoc.data()!;
            const clientPhone = normalizePhone((clientData.phone as string) || '');
            const clientEmailAddr = (clientData.email as string) || '';
            const pushToken = clientData.pushToken as string | undefined;
            const existingChatId = (alertData.chatId as string) || null;

            // Try SMS
            if (isValidE164(clientPhone)) {
              try {
                await sendOrCreateChat({
                  to: clientPhone,
                  chatId: existingChatId,
                  text: clientMessage,
                });
                clientCelebrationSent = true;
              } catch (e) {
                console.error('Client celebration SMS failed (non-blocking):', e);
              }
            }

            // Push notification
            if (pushToken) {
              try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({
                    to: pushToken,
                    title: `Your ${policyType} policy is secure!`,
                    body: clientMessage,
                    sound: 'default',
                    badge: 1,
                    priority: 'high',
                    data: { type: 'conservation_saved', agentId },
                  }),
                });
                clientCelebrationSent = true;
              } catch (e) {
                console.error('Client celebration push failed (non-blocking):', e);
              }
            }

            // Email fallback if no SMS or push was sent
            if (!clientCelebrationSent && clientEmailAddr) {
              try {
                const resend = getResend();
                await resend.emails.send({
                  from: `${agentName} via AgentForLife <support@agentforlife.app>`,
                  to: clientEmailAddr,
                  subject: `Great news about your ${policyType} policy!`,
                  text: clientMessage,
                });
              } catch (e) {
                console.error('Client celebration email failed (non-blocking):', e);
              }
            }
          }
        }
      } catch (clientCelebrationError) {
        console.error('Failed to send client celebration (non-blocking):', clientCelebrationError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating conservation alert:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to update conservation alert' },
      { status: 500 },
    );
  }
}
