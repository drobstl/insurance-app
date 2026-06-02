import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import {
  getLicenseSignedUrl,
  isValidStateCode,
  type StateCode,
} from '../../../../../lib/agent-licenses';
import {
  composeMessage,
  formatDayOfWeek,
  formatTimeOfDay,
} from '../../../../../lib/booking-confirmation';
import { deriveLeadCode } from '../../../../../lib/lead-code-derive';
import { canAccessLeads } from '../../../../../lib/tier-gating';
import { timeZoneForState } from '../../../../../lib/state-timezone';

// Canonical app smart-download link (mirrors web/lib/welcome-sms-body.ts).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const APP_DOWNLOAD_URL = `${APP_URL}/app`;

/**
 * POST /api/appointments/[apptId]/send-confirmation-email
 *
 * Email delivery path for booking confirmations / reminders. Agents
 * who run video meetings prefer to email rather than text; this
 * endpoint sends the same composed message + the same attachments
 * (business card, state-matched license) from AgentForLife's verified
 * domain, on behalf of the agent, with replies routed to the agent's
 * own inbox.
 *
 * Unlike the text path (which fires from the agent's phone via the
 * native Messages composer), email is fully server-side — we can
 * actually attach the PDF/image and we control the send. After a
 * successful send we stamp the same `sentConfirmationAt` /
 * `sentReminderAt` + `lead.attachmentsSent` records the text path
 * stamps, so dedup + "already sent" UX stay consistent across channels.
 *
 * Body: `{ kind?: 'confirmation' | 'reminder', message?: string }`.
 *   - `message` is the (possibly agent-edited) body from the drawer.
 *     When omitted we compose server-side with the same template +
 *     app-access gate the text path uses.
 *
 * Auth: Bearer ID token; the appointment must belong to the caller.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ apptId: string }> },
) {
  try {
    const { apptId } = await context.params;
    if (!apptId) return NextResponse.json({ error: 'Missing apptId' }, { status: 400 });

    // Auth
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const kindParam: 'confirmation' | 'reminder' =
      body?.kind === 'reminder' ? 'reminder' : 'confirmation';
    const providedMessage = typeof body?.message === 'string' ? body.message : '';

    const db = getAdminFirestore();

    // Appointment lookup, scoped to this agent (404 on cross-agent).
    const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc(apptId);
    const apptSnap = await apptRef.get();
    if (!apptSnap.exists) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    const appt = apptSnap.data() || {};

    const leadId = typeof appt.leadId === 'string' ? appt.leadId : '';
    if (!leadId) {
      return NextResponse.json({ error: 'Appointment has no associated lead' }, { status: 400 });
    }
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const lead = leadSnap.data() || {};

    const agentSnap = await db.collection('agents').doc(agentId).get();
    const agent = agentSnap.exists ? agentSnap.data() || {} : {};

    // ── Resolve fields (mirrors the text-path bundle endpoint) ──
    const leadName: string = typeof lead.name === 'string' ? lead.name : '';
    const leadEmail: string = typeof lead.email === 'string' ? lead.email.trim() : '';
    if (!leadEmail) {
      return NextResponse.json(
        { error: 'Lead has no email on file', code: 'no_email' },
        { status: 400 },
      );
    }
    const leadPhone: string = typeof lead.phone === 'string' ? lead.phone :
                              typeof lead.phoneNumber === 'string' ? lead.phoneNumber : '';
    const leadAddressState =
      typeof lead.address?.state === 'string' ? lead.address.state :
      typeof lead.state === 'string' ? lead.state : '';
    const pickedState = leadAddressState ? leadAddressState.toUpperCase() : '';

    const agentName: string =
      typeof agent.name === 'string' ? agent.name :
      typeof agent.fullName === 'string' ? agent.fullName :
      typeof agent.displayName === 'string' ? agent.displayName : '';

    const scheduledAtRaw = appt.scheduledAt;
    let scheduledAtMs = 0;
    if (scheduledAtRaw instanceof Timestamp) {
      scheduledAtMs = scheduledAtRaw.toMillis();
    } else if (typeof scheduledAtRaw === 'number') {
      scheduledAtMs = scheduledAtRaw;
    } else if (typeof scheduledAtRaw?.toMillis === 'function') {
      scheduledAtMs = scheduledAtRaw.toMillis();
    }
    const scheduledAtTimeZone: string | undefined =
      typeof appt.scheduledAtTimeZone === 'string' ? appt.scheduledAtTimeZone : undefined;
    const meetingUrl: string | undefined =
      typeof appt.meetingUrl === 'string' ? appt.meetingUrl : undefined;

    // ── App-access gate (same rule as the text path) ──
    const agentEmail =
      typeof decoded.email === 'string' ? decoded.email :
      typeof agent.email === 'string' ? agent.email : null;
    const tier = typeof agent.membershipTier === 'string' ? agent.membershipTier : undefined;
    const teRaw = agent.trialEndsAt;
    const trialEndsAtMs: number | null =
      teRaw instanceof Timestamp ? teRaw.toMillis() :
      typeof teRaw === 'number' ? teRaw :
      (teRaw && typeof teRaw.toMillis === 'function') ? teRaw.toMillis() :
      (teRaw && typeof teRaw.seconds === 'number') ? teRaw.seconds * 1000 :
      null;
    const proOk = canAccessLeads(tier, agentEmail, trialEndsAtMs);
    const optedInAppAccess = agent.includeAppAccessInConfirmations !== false;
    const introUrl = typeof agent.leadContent?.intro?.url === 'string' ? agent.leadContent.intro.url : '';
    const hasIntroVideo = introUrl.trim().length > 0;
    const leadCode =
      typeof lead.leadCode === 'string' && lead.leadCode.trim()
        ? lead.leadCode.trim()
        : deriveLeadCode(leadPhone) || '';
    const appAccess =
      proOk && optedInAppAccess && hasIntroVideo && leadCode
        ? { downloadUrl: APP_DOWNLOAD_URL, code: leadCode }
        : null;

    // Body: prefer the (edited) message from the drawer; otherwise
    // compose with the same template + gate the text path uses.
    const message = providedMessage || composeMessage({
      leadFirstName: leadName,
      agentFirstName: agentName,
      scheduledAt: new Date(scheduledAtMs),
      timeZone: scheduledAtTimeZone,
      leadStateCode: pickedState || undefined,
      meetingUrl,
      kind: kindParam,
      appAccess,
    });

    // Subject — render the time in the lead's local zone, same source
    // precedence as the body.
    const resolvedTz = timeZoneForState(pickedState || undefined) || scheduledAtTimeZone;
    const apptDate = new Date(scheduledAtMs);
    const day = formatDayOfWeek(apptDate, resolvedTz);
    const time = formatTimeOfDay(apptDate, resolvedTz);
    const subject =
      kindParam === 'reminder'
        ? `Reminder: our appointment today at ${time}`
        : `Confirming our appointment — ${day} at ${time}`;

    // ── Attachments (same dedup as the text path) ──
    const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];

    const businessCardBase64 =
      typeof agent.businessCardBase64 === 'string' ? agent.businessCardBase64 : '';
    const businessCardAlreadySent = Boolean(lead?.attachmentsSent?.businessCardAt);
    let attachedBusinessCard = false;
    if (businessCardBase64 && !businessCardAlreadySent) {
      try {
        const cleaned = businessCardBase64.replace(/^data:.+;base64,/, '');
        attachments.push({
          filename: 'business-card.jpg',
          content: Buffer.from(cleaned, 'base64'),
          contentType: 'image/jpeg',
        });
        attachedBusinessCard = true;
      } catch (err) {
        console.warn('business card decode failed (non-fatal):', err);
      }
    }

    let attachedLicenseState = '';
    if (pickedState && isValidStateCode(pickedState)) {
      const licenseAlreadySent = Boolean(lead?.attachmentsSent?.licensesByState?.[pickedState]);
      if (!licenseAlreadySent) {
        const licenseResult = await getLicenseSignedUrl(agentId, pickedState as StateCode);
        if (licenseResult?.url) {
          try {
            const fileRes = await fetch(licenseResult.url);
            if (fileRes.ok) {
              const contentType = licenseResult.contentType || 'application/pdf';
              const ext =
                contentType === 'image/jpeg' ? 'jpg' :
                contentType === 'image/png' ? 'png' : 'pdf';
              attachments.push({
                filename: `${pickedState}-license.${ext}`,
                content: Buffer.from(await fileRes.arrayBuffer()),
                contentType,
              });
              attachedLicenseState = pickedState;
            }
          } catch (err) {
            console.warn('license fetch failed (non-fatal):', err);
          }
        }
      }
    }

    // ── Send via Resend (verified domain, on behalf of the agent) ──
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('send-confirmation-email: RESEND_API_KEY not set');
      return NextResponse.json({ error: 'Email is not configured' }, { status: 500 });
    }
    const resend = new Resend(apiKey);
    const fromName = agentName ? `${agentName} via AgentForLife™` : 'AgentForLife™';
    try {
      const { error: sendError } = await resend.emails.send({
        from: `${fromName} <support@agentforlife.app>`,
        to: leadEmail,
        ...(agentEmail ? { replyTo: agentEmail } : {}),
        subject,
        text: message,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (sendError) {
        console.error('send-confirmation-email Resend error:', sendError);
        return NextResponse.json({ error: 'Email send failed' }, { status: 502 });
      }
    } catch (err) {
      console.error('send-confirmation-email send threw:', err);
      return NextResponse.json({ error: 'Email send failed' }, { status: 502 });
    }

    // ── Stamp sent (mirrors confirmation-sent / reminder-sent) ──
    const stampField = kindParam === 'reminder' ? 'sentReminderAt' : 'sentConfirmationAt';
    await apptRef.update({ [stampField]: FieldValue.serverTimestamp() }).catch((err) => {
      console.warn('appointment sent-stamp failed (non-fatal):', err);
    });
    if (attachedBusinessCard || attachedLicenseState) {
      const leadUpdates: Record<string, unknown> = {};
      const nowIso = new Date().toISOString();
      if (attachedBusinessCard) leadUpdates['attachmentsSent.businessCardAt'] = nowIso;
      if (attachedLicenseState) {
        leadUpdates[`attachmentsSent.licensesByState.${attachedLicenseState}`] = nowIso;
      }
      await leadRef.update(leadUpdates).catch((err) => {
        console.warn('lead attachmentsSent update failed (non-fatal):', err);
      });
    }

    return NextResponse.json({
      ok: true,
      channel: 'email',
      to: leadEmail,
      attached: { businessCard: attachedBusinessCard, licenseState: attachedLicenseState },
    });
  } catch (error) {
    console.error('send-confirmation-email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
