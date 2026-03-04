import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { generateInitialOutreach, type PolicyReviewOutreachContext } from '../../../../lib/policy-review-ai';
import { sendOrCreateChat } from '../../../../lib/linq';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

/**
 * Daily cron: scans all agents' policies for 1-year anniversaries.
 *
 * Job A — Day -3: Send agent an email digest of upcoming anniversaries.
 * Job B — Day +1: Create policy review campaigns and send AI-generated
 *         initial outreach via iMessage + push notification.
 *
 * Skips ROP and Graded policies (rewrites restart the clock).
 * Skips clients with policyReviewOptOut: true.
 */

const SKIP_POLICY_PATTERNS = ['rop', 'return of premium', 'graded'];

function shouldSkipPolicyType(policyType: string | undefined): boolean {
  if (!policyType) return false;
  const lower = policyType.toLowerCase();
  return SKIP_POLICY_PATTERNS.some((p) => lower.includes(p));
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

interface AnniversaryPolicy {
  clientId: string;
  clientName: string;
  clientFirstName: string;
  clientPhone: string | null;
  clientPushToken: string | null;
  policyId: string;
  policyType: string;
  policyNumber: string;
  carrier: string;
  premiumAmount: number | null;
  coverageAmount: number | null;
  effectiveDate: string;
  anniversaryDate: string;
  daysUntil: number;
  policyPath: string;
}

export async function GET(req: NextRequest) {
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

    let totalAgentEmails = 0;
    let totalCampaignsCreated = 0;
    let totalSkipped = 0;

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const agentData = agentDoc.data();
      const agentEmail = agentData.email as string | undefined;
      const agentName = (agentData.name as string) || 'Agent';
      const agentFirstName = agentName.split(' ')[0];
      if (!agentEmail) continue;

      const policyReviewAIEnabled = (agentData.policyReviewAIEnabled as boolean) !== false;
      const messageStyle = ((agentData.anniversaryMessageStyle as string) || 'check_in') as 'lower_price' | 'check_in' | 'custom';
      const schedulingUrl = (agentData.schedulingUrl as string) || null;
      const customTemplate = (agentData.anniversaryMessageCustom as string) || '';
      const customTitle = (agentData.anniversaryMessageCustomTitle as string) || '';

      const clientsSnap = await db
        .collection('agents').doc(agentDoc.id)
        .collection('clients').get();

      const headsUpHits: AnniversaryPolicy[] = [];
      const outreachHits: AnniversaryPolicy[] = [];

      for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data();
        const clientName = (clientData.name as string) || 'Unknown Client';
        const clientFirstName = clientName.split(' ')[0];
        const clientPhone = (clientData.phone as string) || null;
        const clientPushToken = (clientData.pushToken as string) || null;
        const clientOptedOut = (clientData.policyReviewOptOut as boolean) === true;

        if (clientOptedOut) continue;

        const policiesSnap = await db
          .collection('agents').doc(agentDoc.id)
          .collection('clients').doc(clientDoc.id)
          .collection('policies').get();

        for (const policyDoc of policiesSnap.docs) {
          const p = policyDoc.data();

          if (shouldSkipPolicyType(p.policyType as string)) {
            totalSkipped++;
            continue;
          }

          let effectiveDate: Date | null = null;
          const eDateStr = p.effectiveDate as string | undefined;
          if (eDateStr) {
            const parsed = new Date(eDateStr + 'T00:00:00');
            if (!isNaN(parsed.getTime())) effectiveDate = parsed;
          }
          if (!effectiveDate) {
            const createdAt = p.createdAt;
            if (!createdAt || !createdAt.toDate) continue;
            effectiveDate = createdAt.toDate() as Date;
          }

          const anniversary = new Date(effectiveDate);
          anniversary.setFullYear(anniversary.getFullYear() + 1);

          const msUntil = anniversary.getTime() - now.getTime();
          const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));

          const hit: AnniversaryPolicy = {
            clientId: clientDoc.id,
            clientName,
            clientFirstName,
            clientPhone,
            clientPushToken,
            policyId: policyDoc.id,
            policyType: p.policyType || 'Policy',
            policyNumber: p.policyNumber || '—',
            carrier: p.insuranceCompany || '',
            premiumAmount: (p.premiumAmount as number) || null,
            coverageAmount: (p.coverageAmount as number) || null,
            effectiveDate: effectiveDate.toISOString(),
            anniversaryDate: anniversary.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            daysUntil,
            policyPath: `agents/${agentDoc.id}/clients/${clientDoc.id}/policies/${policyDoc.id}`,
          };

          // Day -3: Agent heads-up (3 days before anniversary)
          if (daysUntil >= 2 && daysUntil <= 4 && !p.policyReviewAgentNotifiedAt) {
            headsUpHits.push(hit);
          }

          // Day +1: Client outreach (1 day after anniversary, i.e. daysUntil between -2 and 0)
          if (daysUntil >= -2 && daysUntil <= 0 && !p.policyReviewNotifiedAt) {
            outreachHits.push(hit);
          }
        }
      }

      // ─── Job A: Day -3 Agent Email ───
      if (headsUpHits.length > 0) {
        headsUpHits.sort((a, b) => a.daysUntil - b.daysUntil);

        const rows = headsUpHits.map((h) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;">${h.clientName}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${h.policyType}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${h.carrier}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">
              <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;background:#FEF3C7;color:#92400E;">${h.daysUntil} days</span>
            </td>
          </tr>`
        ).join('');

        await resend.emails.send({
          from: 'AgentForLife Notifications <support@agentforlife.app>',
          to: agentEmail,
          subject: `Upcoming Policy Reviews: ${headsUpHits.length} ${headsUpHits.length === 1 ? 'anniversary' : 'anniversaries'} in 3 days`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;color:#2D3748;line-height:1.6;">
              <h2 style="color:#0D4D4D;margin-bottom:8px;">Policy Review Heads-Up</h2>
              <p style="font-size:15px;color:#4A5568;">
                Hi ${agentFirstName}, these policies are approaching their 1-year anniversary. ${policyReviewAIEnabled ? 'Your AI will send outreach to each client the day after their anniversary.' : 'Review them and reach out when the anniversary hits.'}
              </p>
              <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
                <thead><tr style="background:#F7FAFC;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;text-transform:uppercase;">Client</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;text-transform:uppercase;">Policy</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;text-transform:uppercase;">Carrier</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;text-transform:uppercase;">Anniversary</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
              <p style="margin-top:24px;">
                <a href="${appUrl}/dashboard/policy-reviews" style="display:inline-block;padding:12px 24px;background:#3DD6C3;color:#0D4D4D;text-decoration:none;border-radius:8px;font-weight:600;">Open Policy Reviews →</a>
              </p>
            </div>
          `,
        });

        totalAgentEmails++;

        const batch = db.batch();
        for (const hit of headsUpHits) {
          batch.update(db.doc(hit.policyPath), { policyReviewAgentNotifiedAt: now.toISOString() });
        }
        await batch.commit();
      }

      // ─── Job B: Day +1 Client Outreach ───
      if (outreachHits.length > 0 && policyReviewAIEnabled) {
        const isCustom = messageStyle === 'custom' && customTemplate.trim();

        for (const hit of outreachHits) {
          try {
            let outreachMessage: string;
            let pushTitleForHit: string;

            if (isCustom) {
              const policyLabel = `your ${hit.policyType} policy`;
              const schedulingNote = schedulingUrl ? ` Tap here to grab a time on my calendar: ${schedulingUrl}` : '';
              outreachMessage = customTemplate
                .replace(/\{\{firstName\}\}/g, hit.clientFirstName)
                .replace(/\{\{policyLabel\}\}/g, policyLabel)
                .replace(/\{\{agentName\}\}/g, agentName)
                .replace(/\{\{schedulingNote\}\}/g, schedulingNote.trim());
              pushTitleForHit = customTitle.trim() || 'Policy Review';
            } else {
              const outreachCtx: PolicyReviewOutreachContext = {
                agentName,
                agentFirstName,
                clientName: hit.clientName,
                clientFirstName: hit.clientFirstName,
                policyType: hit.policyType,
                carrier: hit.carrier,
                premiumAmount: hit.premiumAmount,
                coverageAmount: hit.coverageAmount,
                schedulingUrl,
                messageStyle: messageStyle === 'custom' ? 'check_in' : messageStyle,
              };

              const aiMessage = await generateInitialOutreach(outreachCtx);
              if (!aiMessage) continue;
              outreachMessage = aiMessage;
              pushTitleForHit = messageStyle === 'lower_price' ? 'Rate Review' : 'Policy Check-In';
            }

            let chatId: string | null = null;
            const phone = hit.clientPhone ? normalizePhone(hit.clientPhone) : null;

            if (phone && isValidE164(phone)) {
              const idempotencyKey = `policy-review-${hit.policyId}-initial`;
              const result = await sendOrCreateChat({ to: phone, text: outreachMessage, idempotencyKey });
              chatId = result.chatId;
            }

            // Send push notification
            if (hit.clientPushToken) {
              try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                  body: JSON.stringify({
                    to: hit.clientPushToken,
                    title: pushTitleForHit,
                    body: outreachMessage,
                    sound: 'default',
                    badge: 1,
                    priority: 'high',
                    data: { type: 'policy-review', agentId: agentDoc.id, clientId: hit.clientId },
                  }),
                });
              } catch (pushErr) {
                console.error(`Push failed for client ${hit.clientId}:`, pushErr);
              }
            }

            // Write notification record
            await db
              .collection('agents').doc(agentDoc.id)
              .collection('clients').doc(hit.clientId)
              .collection('notifications')
              .add({
                type: 'anniversary',
                title: pushTitleForHit,
                body: outreachMessage,
                sentAt: FieldValue.serverTimestamp(),
                readAt: null,
                status: 'sent',
              });

            // Create policy review campaign doc
            await db
              .collection('agents').doc(agentDoc.id)
              .collection('policyReviews')
              .add({
                clientId: hit.clientId,
                clientName: hit.clientName,
                clientFirstName: hit.clientFirstName,
                clientPhone: hit.clientPhone,
                policyId: hit.policyId,
                policyType: hit.policyType,
                carrier: hit.carrier,
                premiumAmount: hit.premiumAmount,
                coverageAmount: hit.coverageAmount,
                effectiveDate: hit.effectiveDate,
                anniversaryDate: hit.anniversaryDate,
                messageStyle,
                status: 'outreach-sent',
                conversation: [{
                  role: isCustom ? 'agent-manual' : 'agent-ai',
                  body: outreachMessage,
                  timestamp: new Date().toISOString(),
                }],
                chatId,
                dripCount: 0,
                lastDripAt: FieldValue.serverTimestamp(),
                aiEnabled: !isCustom,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });

            // Mark policy as notified
            await db.doc(hit.policyPath).update({ policyReviewNotifiedAt: now.toISOString() });

            totalCampaignsCreated++;
          } catch (err) {
            console.error(`Policy review outreach failed for ${hit.clientName}:`, err);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      agentEmailsSent: totalAgentEmails,
      campaignsCreated: totalCampaignsCreated,
      policiesSkipped: totalSkipped,
    });
  } catch (error) {
    console.error('Policy review cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
