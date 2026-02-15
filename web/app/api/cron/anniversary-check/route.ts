import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * Daily cron job: scans all agents' policies for upcoming 1-year anniversaries.
 *
 * 1. Sends a digest email to each agent via Resend (existing behaviour).
 * 2. Sends a push notification to each affected client via the Expo Push API
 *    and writes a record to the notifications subcollection (Phase 4A).
 *
 * Guards against duplicate sends:
 *   - Agent email: `anniversaryAgentNotifiedAt` on each policy doc
 *   - Client push: `anniversaryClientNotifiedAt` on each policy doc
 */

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

interface AnniversaryHit {
  clientName: string;
  clientId: string;
  policyId: string;
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  daysUntil: number;
  anniversaryDate: string;
  /** Full Firestore path for writing back notifiedAt */
  policyPath: string;
  /** Expo push token for the client (may be undefined) */
  pushToken?: string;
  /** Whether the client has already been push-notified for this policy */
  clientAlreadyNotified: boolean;
}

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized invocations
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const now = new Date();
    const resend = getResend();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app';

    // 1. Iterate all agents
    const agentsSnap = await db.collection('agents').get();
    let totalEmails = 0;
    let totalPoliciesFlagged = 0;
    let totalPushSent = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentEmail = agentData.email as string | undefined;
      const agentName = (agentData.name as string) || 'Agent';
      if (!agentEmail) continue;

      // 2. For each agent, iterate their clients
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .get();

      const hits: AnniversaryHit[] = [];

      for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data();
        const clientName = (clientData.name as string) || 'Unknown Client';
        const clientPushToken = clientData.pushToken as string | undefined;

        // 3. Check each policy
        const policiesSnap = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('clients')
          .doc(clientDoc.id)
          .collection('policies')
          .get();

        for (const policyDoc of policiesSnap.docs) {
          const p = policyDoc.data();

          // Skip if agent has already been notified for this anniversary window
          if (p.anniversaryAgentNotifiedAt) continue;

          // Compute anniversary
          const createdAt = p.createdAt;
          if (!createdAt || !createdAt.toDate) continue;

          const created: Date = createdAt.toDate();
          const anniversary = new Date(created);
          anniversary.setFullYear(anniversary.getFullYear() + 1);

          const msUntil = anniversary.getTime() - now.getTime();
          const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));

          // Alert window: 0–30 days before the 1-year mark
          if (daysUntil >= 0 && daysUntil <= 30) {
            hits.push({
              clientName,
              clientId: clientDoc.id,
              policyId: policyDoc.id,
              policyType: p.policyType || 'Policy',
              policyNumber: p.policyNumber || '—',
              insuranceCompany: p.insuranceCompany || '',
              daysUntil,
              anniversaryDate: anniversary.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
              policyPath: `agents/${agentDoc.id}/clients/${clientDoc.id}/policies/${policyDoc.id}`,
              pushToken: clientPushToken,
              clientAlreadyNotified: !!p.anniversaryClientNotifiedAt,
            });
          }
        }
      }

      if (hits.length === 0) continue;

      // 4. Send digest email to agent
      hits.sort((a, b) => a.daysUntil - b.daysUntil);

      const policyRows = hits
        .map(
          (h) =>
            `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;">${h.clientName}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${h.policyType} #${h.policyNumber}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${h.insuranceCompany}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;${
                  h.daysUntil <= 7
                    ? 'background:#FEE2E2;color:#991B1B;'
                    : 'background:#FEF3C7;color:#92400E;'
                }">${h.daysUntil === 0 ? 'Today' : h.daysUntil === 1 ? 'Tomorrow' : `${h.daysUntil} days`}</span>
              </td>
            </tr>`
        )
        .join('');

      await resend.emails.send({
        from: 'AgentForLife Notifications <support@agentforlife.app>',
        to: agentEmail,
        subject: `Policy Anniversary Alert: ${hits.length} ${hits.length === 1 ? 'policy' : 'policies'} approaching 1 year`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;color:#2D3748;line-height:1.6;">
            <h2 style="color:#0D4D4D;margin-bottom:8px;">Policy Anniversary Alert</h2>
            <p style="font-size:15px;color:#4A5568;">
              Hi ${agentName}, the following ${hits.length === 1 ? 'policy is' : 'policies are'} approaching ${hits.length === 1 ? 'its' : 'their'} 1-year anniversary.
              This is a great time to reach out and discuss whether a policy rewrite makes sense.
            </p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
              <thead>
                <tr style="background:#F7FAFC;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;text-transform:uppercase;">Client</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;text-transform:uppercase;">Policy</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;text-transform:uppercase;">Carrier</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;text-transform:uppercase;">Anniversary</th>
                </tr>
              </thead>
              <tbody>${policyRows}</tbody>
            </table>
            <p style="margin-top:24px;">
              <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 24px;background:#3DD6C3;color:#0D4D4D;text-decoration:none;border-radius:8px;font-weight:600;">
                Open Dashboard →
              </a>
            </p>
          </div>
        `,
      });

      totalEmails++;
      totalPoliciesFlagged += hits.length;

      // 5. Send push notifications to clients (Phase 4A)
      // Group hits by clientId so each client gets one notification
      // even if they have multiple policies approaching anniversary.
      const clientHitsMap = new Map<string, AnniversaryHit[]>();
      for (const hit of hits) {
        if (!hit.pushToken || hit.clientAlreadyNotified) continue;
        const existing = clientHitsMap.get(hit.clientId) || [];
        existing.push(hit);
        clientHitsMap.set(hit.clientId, existing);
      }

      for (const [, clientHits] of clientHitsMap) {
        const hit = clientHits[0]; // Representative hit for push token / name
        const policyLabel =
          clientHits.length === 1
            ? `your ${clientHits[0].policyType} policy`
            : `${clientHits.length} of your policies`;

        const pushTitle = 'Policy Check-In';
        const firstName = hit.clientName.split(' ')[0];
        const pushBody = `Hi ${firstName}, it's been almost a year since we set up ${policyLabel}. A lot can change in a year — I'd love to make sure your coverage still fits your life. I'm here whenever you'd like to chat. — ${agentName}`;

        try {
          const expoResponse = await fetch(
            'https://exp.host/--/api/v2/push/send',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate',
              },
              body: JSON.stringify({
                to: hit.pushToken,
                title: pushTitle,
                body: pushBody,
                sound: 'default',
                data: {
                  type: 'anniversary',
                  agentId: agentDoc.id,
                  clientId: hit.clientId,
                },
              }),
            }
          );

          const expoResult = await expoResponse.json();
          const pushStatus =
            expoResult?.data?.status === 'ok' ? 'sent' : 'failed';

          if (pushStatus === 'failed') {
            console.error(
              `Expo push error for client ${hit.clientId}:`,
              expoResult?.data?.message || expoResult
            );
          }

          // Write notification record to Firestore
          const notifRef = db
            .collection('agents')
            .doc(agentDoc.id)
            .collection('clients')
            .doc(hit.clientId)
            .collection('notifications');

          await notifRef.add({
            type: 'anniversary',
            title: pushTitle,
            body: pushBody,
            sentAt: FieldValue.serverTimestamp(),
            readAt: null,
            status: pushStatus,
          });

          if (pushStatus === 'sent') totalPushSent++;
        } catch (pushError) {
          console.error(
            `Failed to send push for client ${hit.clientId}:`,
            pushError
          );
        }
      }

      // 6. Mark policies as notified (agent email + client push)
      const batch = db.batch();
      for (const hit of hits) {
        const ref = db.doc(hit.policyPath);
        const updates: Record<string, string> = {
          anniversaryAgentNotifiedAt: now.toISOString(),
        };
        // Only set client notified if the client actually had a push token
        if (hit.pushToken && !hit.clientAlreadyNotified) {
          updates.anniversaryClientNotifiedAt = now.toISOString();
        }
        batch.update(ref, updates);
      }
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      emailsSent: totalEmails,
      policiesFlagged: totalPoliciesFlagged,
      pushNotificationsSent: totalPushSent,
    });
  } catch (error) {
    console.error('Anniversary check cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
