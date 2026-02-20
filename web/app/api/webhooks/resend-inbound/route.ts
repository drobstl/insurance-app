import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { createConservationAlert } from '../../../../lib/conservation-core';

export const dynamic = 'force-dynamic';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

/**
 * POST /api/webhooks/resend-inbound
 *
 * Resend inbound email webhook. Receives forwarded carrier emails
 * sent to AI@conserve.agentforlife.app, identifies the agent by sender
 * email, and creates a conservation alert.
 *
 * Payload structure (Resend email.received event):
 * {
 *   type: "email.received",
 *   data: {
 *     from: "agent@example.com",
 *     to: ["AI@conserve.agentforlife.app"],
 *     subject: "Fwd: Conservation Opportunity - ...",
 *     text: "...",
 *     html: "..."
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify this is an email.received event
    if (body.type !== 'email.received') {
      return NextResponse.json({ received: true, skipped: 'not email.received' });
    }

    const emailData = body.data;
    if (!emailData) {
      return NextResponse.json({ error: 'No email data' }, { status: 400 });
    }

    // Extract sender email -- this should be the agent who forwarded the email
    const senderEmail = extractEmail(emailData.from);
    if (!senderEmail) {
      console.warn('Resend inbound: could not extract sender email from:', emailData.from);
      return NextResponse.json({ received: true, skipped: 'no sender email' });
    }

    // Look up the agent by email
    const db = getAdminFirestore();
    const agentsSnap = await db
      .collection('agents')
      .where('email', '==', senderEmail)
      .limit(1)
      .get();

    if (agentsSnap.empty) {
      console.warn('Resend inbound: no agent found for email:', senderEmail);
      return NextResponse.json({ received: true, skipped: 'agent not found' });
    }

    const agentDoc = agentsSnap.docs[0];
    const agentId = agentDoc.id;
    const agentName = (agentDoc.data().name as string) || 'Agent';

    // Extract the email body text (prefer plain text, fall back to subject)
    const rawText = emailData.text || emailData.html || emailData.subject || '';
    if (!rawText || rawText.trim().length < 10) {
      console.warn('Resend inbound: email body too short from:', senderEmail);
      return NextResponse.json({ received: true, skipped: 'body too short' });
    }

    // Create the conservation alert using shared core logic
    const result = await createConservationAlert(agentId, rawText.trim(), 'email_forward');

    // Send confirmation email back to the agent
    try {
      const resend = getResend();
      const alert = result.alert;
      const priorityLabel = alert.isChargebackRisk ? 'HIGH PRIORITY -- chargeback risk' : 'Low priority';
      const matchNote = result.matched
        ? `We matched this to ${alert.clientName}'s ${alert.policyType || 'policy'}${alert.policyAge !== null ? ` (written ${Math.round(alert.policyAge / 30)} months ago)` : ''}.`
        : `We couldn't auto-match this to a client in your book. You can match it manually on the dashboard.`;

      const outreachNote = alert.status === 'outreach_scheduled'
        ? `Outreach is scheduled to send automatically in 2 hours. You can cancel from your dashboard if you want to handle it personally.`
        : `This is logged on your dashboard.`;

      await resend.emails.send({
        from: 'AgentForLife <support@agentforlife.app>',
        to: senderEmail,
        subject: `Conservation Alert Received: ${alert.clientName} -- ${priorityLabel}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;color:#2D3748;line-height:1.6;">
            <h2 style="color:#0D4D4D;margin-bottom:8px;">Conservation Alert Received</h2>
            <p>Hi ${agentName.split(' ')[0]},</p>
            <p>We processed your forwarded conservation notification.</p>
            <div style="background:#F7FAFC;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:4px 0;"><strong>Client:</strong> ${alert.clientName}</p>
              <p style="margin:4px 0;"><strong>Policy:</strong> ${alert.policyNumber} (${alert.carrier})</p>
              <p style="margin:4px 0;"><strong>Reason:</strong> ${alert.reason === 'lapsed_payment' ? 'Lapsed Payment' : alert.reason === 'cancellation' ? 'Cancellation' : 'Other'}</p>
              <p style="margin:4px 0;"><strong>Priority:</strong>
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;${
                  alert.isChargebackRisk
                    ? 'background:#FEE2E2;color:#991B1B;'
                    : 'background:#E5E7EB;color:#4B5563;'
                }">${priorityLabel}</span>
              </p>
            </div>
            <p>${matchNote}</p>
            <p>${outreachNote}</p>
            <p style="margin-top:24px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app'}/dashboard" style="display:inline-block;padding:12px 24px;background:#3DD6C3;color:#0D4D4D;text-decoration:none;border-radius:8px;font-weight:600;">
                Open Dashboard →
              </a>
            </p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    return NextResponse.json({
      received: true,
      alertId: result.alertId,
      matched: result.matched,
    });
  } catch (error) {
    console.error('Resend inbound webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

/**
 * Extract a clean email address from a string that may contain
 * a display name, e.g. "John Smith <john@example.com>" -> "john@example.com"
 */
function extractEmail(from: string | undefined): string | null {
  if (!from) return null;

  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();

  if (from.includes('@')) return from.trim().toLowerCase();

  return null;
}
