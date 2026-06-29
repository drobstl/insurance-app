import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import {
  PUSH_PERMISSION_REVOKED_FIELD,
  PHONE_RECONNECT_ALERT_FIELD,
} from './push-permission-lifecycle';

/**
 * Agent "your phone disconnected" alert.
 *
 * The agent's magic moment (a lead books → their phone buzzes → tap-to-send
 * the confirmation + prep-page link) depends on their phone staying paired.
 * A token can silently die — reinstall, new phone, OS update, notifications
 * turned off — and the push lifecycle only learns of it reactively, when an
 * agent push bounces with `DeviceNotRegistered` (which clears the token and
 * stamps `pushPermissionRevokedAt`). Until now nothing TOLD the agent; they
 * were left to notice the dashboard prompts come back. And of course we can't
 * tell them by push — that's the channel that just broke.
 *
 * This reaches them by email with a one-tap reconnect link.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const PAIR_URL = `${APP_URL}/dashboard/pair-phone`;

interface NotifyArgs {
  agentRef: FirebaseFirestore.DocumentReference;
  /**
   * The agent doc data read by the caller before the token was invalidated.
   * Only `email` + `name` are used, and neither is touched by the token
   * delete, so the stale snapshot is fine for the message body. The
   * once-per-drop guard below re-reads the doc transactionally.
   */
  agentData: FirebaseFirestore.DocumentData;
}

/**
 * Fire a one-time "reconnect your phone" email the moment an agent's own
 * device push token is invalidated.
 *
 * Once-per-drop: a transactional `phoneReconnectAlertSentAt` stamp gates the
 * send, so concurrent pushes (booking-create + the 1-hour cron) can't
 * double-email, and an agent who has already re-registered (the register
 * route clears both the revoke + this stamp) is never alerted. The stamp is
 * set BEFORE the send, so a Resend failure won't retry-spam — the dashboard
 * banner/button still surface the reconnect door as a fallback.
 */
export async function notifyAgentPhoneDisconnected({ agentRef, agentData }: NotifyArgs): Promise<void> {
  const email = typeof agentData.email === 'string' ? agentData.email.trim() : '';
  const apiKey = process.env.RESEND_API_KEY;
  if (!email || !apiKey) return;

  let shouldSend = false;
  try {
    await agentRef.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(agentRef);
      const d = snap.data() || {};
      // `pushPermissionRevokedAt` confirms the token is still dead right now
      // (not re-registered between the bounce and here); the alert stamp
      // confirms we haven't already emailed for this drop.
      if (d[PUSH_PERMISSION_REVOKED_FIELD] && !d[PHONE_RECONNECT_ALERT_FIELD]) {
        tx.update(agentRef, { [PHONE_RECONNECT_ALERT_FIELD]: FieldValue.serverTimestamp() });
        shouldSend = true;
      }
    });
  } catch (err) {
    console.error('[phone-alert] guard txn failed', {
      agentId: agentRef.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (!shouldSend) return;

  const firstName = typeof agentData.name === 'string' ? agentData.name.trim().split(/\s+/)[0] : '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'AgentForLife™ <support@agentforlife.app>',
      to: email,
      subject: 'Your phone disconnected from AgentForLife',
      text: [
        greeting,
        '',
        'Your phone stopped receiving booking alerts from AgentForLife. This usually happens after reinstalling the app, switching phones, or turning notifications off.',
        '',
        "While it's disconnected, booked leads won't pop up on your phone to send their confirmation and prep-page link.",
        '',
        'Reconnect in about a minute:',
        PAIR_URL,
        '',
        '— AgentForLife',
      ].join('\n'),
      html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">
  <p>${greeting}</p>
  <p>Your phone stopped receiving booking alerts from AgentForLife. This usually happens after reinstalling the app, switching phones, or turning notifications off.</p>
  <p>While it's disconnected, booked leads won't pop up on your phone to send their confirmation and prep-page link.</p>
  <p style="margin:24px 0"><a href="${PAIR_URL}" style="display:inline-block;background:#44bbaa;color:#ffffff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600">Reconnect my phone</a></p>
  <p style="color:#707070;font-size:13px">Or paste this link into your browser:<br>${PAIR_URL}</p>
  <p>— AgentForLife</p>
</div>`,
    });
    console.log('[phone-alert] reconnect email sent', { agentId: agentRef.id });
  } catch (err) {
    console.error('[phone-alert] reconnect email failed', {
      agentId: agentRef.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
