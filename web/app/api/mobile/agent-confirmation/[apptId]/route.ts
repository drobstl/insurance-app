import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import {
  getLicenseSignedUrl,
  isValidStateCode,
  type StateCode,
} from '../../../../../lib/agent-licenses';
import { composeMessage } from '../../../../../lib/booking-confirmation';
import { deriveLeadCode } from '../../../../../lib/lead-code-derive';
import { canAccessLeads } from '../../../../../lib/tier-gating';

// Canonical app smart-download link (mirrors web/lib/welcome-sms-body.ts).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const APP_DOWNLOAD_URL = `${APP_URL}/app`;

/**
 * GET /api/mobile/agent-confirmation/[apptId]
 *
 * Phone-side data bundle for sending a booking confirmation. Called
 * from /send/[apptId] in the mobile app right before it invokes the
 * native Messages composer.
 *
 * Returns everything the phone needs in one shot so it can:
 *   1. Build the recipient + body for `sms:` / expo-sms.
 *   2. Download the business card image + state-matched license PDF
 *      to local cache.
 *   3. Skip attachments the lead already has (dedup).
 *
 * Auth: standard Bearer Firebase ID token. The appointment must
 * belong to the calling agent — we 404 otherwise so a leaked deep
 * link doesn't grant access to someone else's data.
 *
 * Query params:
 *   - kind: 'confirmation' (default) or 'reminder'. Changes the
 *     message template + which endpoint the phone calls to stamp the
 *     send timestamp.
 */
export async function GET(
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

    // Pull ?kind=
    const url = new URL(req.url);
    const kindParam = url.searchParams.get('kind') === 'reminder' ? 'reminder' : 'confirmation';

    const db = getAdminFirestore();

    // Appointment lookup, scoped to this agent. If it doesn't belong
    // to them, treat it as not-found — we don't want to leak whether
    // an appt exists under a different agent.
    const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc(apptId);
    const apptSnap = await apptRef.get();
    if (!apptSnap.exists) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    const appt = apptSnap.data() || {};

    // Lead lookup
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

    // Agent profile
    const agentSnap = await db.collection('agents').doc(agentId).get();
    if (!agentSnap.exists) {
      return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 });
    }
    const agent = agentSnap.data() || {};

    // Resolve fields
    const leadName: string = typeof lead.name === 'string' ? lead.name : '';
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

    // scheduledAt: stored as Firestore Timestamp; we serialize to ms.
    const scheduledAtRaw = appt.scheduledAt;
    let scheduledAtMs: number = 0;
    if (scheduledAtRaw instanceof Timestamp) {
      scheduledAtMs = scheduledAtRaw.toMillis();
    } else if (typeof scheduledAtRaw === 'number') {
      scheduledAtMs = scheduledAtRaw;
    } else if (typeof scheduledAtRaw?.toMillis === 'function') {
      scheduledAtMs = scheduledAtRaw.toMillis();
    }

    const scheduledAtTimeZone: string | null =
      typeof appt.scheduledAtTimeZone === 'string' ? appt.scheduledAtTimeZone : null;
    const meetingUrl: string | null =
      typeof appt.meetingUrl === 'string' ? appt.meetingUrl : null;

    // App-access hand-off gate. Only inject the download link + login
    // code when the agent is Pro+ (lead-home is a Pro surface), has
    // opted in, has actually recorded an intro video (so the prep page
    // isn't empty), and we can resolve a login code for this lead.
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
    // Default ON per Daniel — only an explicit `false` opts out.
    const optedInAppAccess = agent.includeAppAccessInConfirmations !== false;
    const introUrl = typeof agent.leadContent?.intro?.url === 'string' ? agent.leadContent.intro.url : '';
    const hasIntroVideo = introUrl.trim().length > 0;
    // Authoritative login code is the stored leadCode (handles the
    // random `L…` fallback); derive from phone only when absent.
    const leadCode =
      typeof lead.leadCode === 'string' && lead.leadCode.trim()
        ? lead.leadCode.trim()
        : deriveLeadCode(leadPhone) || '';
    const appAccess =
      proOk && optedInAppAccess && hasIntroVideo && leadCode
        ? { downloadUrl: APP_DOWNLOAD_URL, code: leadCode }
        : null;

    // Compose the SMS body server-side using the same template the
    // dashboard drawer uses. Phone receives the final string.
    const message = composeMessage({
      leadFirstName: leadName,
      agentFirstName: agentName,
      scheduledAt: new Date(scheduledAtMs),
      timeZone: scheduledAtTimeZone || undefined,
      leadStateCode: pickedState || undefined,
      meetingUrl: meetingUrl || undefined,
      kind: kindParam,
      appAccess,
    });

    // ── Attachments ──

    // Business card: stored as base64 on agentProfile. Skip if already
    // sent to this lead (dedup against lead.attachmentsSent.businessCardAt).
    const businessCardBase64 =
      typeof agent.businessCardBase64 === 'string' ? agent.businessCardBase64 : '';
    const businessCardAlreadySent = Boolean(lead?.attachmentsSent?.businessCardAt);

    // License: signed URL, scoped to picked state. Skip if not licensed
    // in that state, or if already sent to this lead in that state.
    let licenseSignedUrl: string | null = null;
    let licenseMimeType: string | null = null;
    let licenseAlreadySent = false;
    if (pickedState && isValidStateCode(pickedState)) {
      const sent = lead?.attachmentsSent?.licensesByState || {};
      licenseAlreadySent = Boolean(sent[pickedState]);
      if (!licenseAlreadySent) {
        const licenseResult = await getLicenseSignedUrl(agentId, pickedState as StateCode);
        if (licenseResult) {
          licenseSignedUrl = licenseResult.url;
          licenseMimeType = licenseResult.contentType || 'application/pdf';
        }
      }
    }

    return NextResponse.json({
      appointmentId: apptId,
      kind: kindParam,
      leadFirstName: leadName.split(/\s+/)[0] || '',
      leadPhone,
      leadEmail: typeof lead.email === 'string' ? lead.email : '',
      leadStateCode: pickedState,
      // Agent's saved delivery default; phone can override per-send.
      channel: agent.confirmationChannel === 'email' ? 'email' : 'text',
      agentFirstName: agentName.split(/\s+/)[0] || '',
      scheduledAtMs,
      scheduledAtTimeZone,
      meetingUrl,
      message,
      attachments: {
        businessCard: businessCardBase64
          ? {
              base64: businessCardBase64,
              mimeType: 'image/jpeg',
              alreadySent: businessCardAlreadySent,
            }
          : null,
        license: licenseSignedUrl
          ? {
              signedUrl: licenseSignedUrl,
              mimeType: licenseMimeType || 'application/pdf',
              alreadySent: licenseAlreadySent,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('agent-confirmation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
