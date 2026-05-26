import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findClientByCode } from '../../../../lib/client-code-lookup';
import { findBeneficiaryByCode } from '../../../../lib/beneficiary-code-lookup';
import { findLeadByCode } from '../../../../lib/lead-code-lookup';
import { isLeadCode } from '../../../../lib/lead-code-derive';

/**
 * Resolve the Linq line phone number the mobile Activate screen will
 * compose to. Per-agent override (`agents/{agentId}.linqPhoneNumber`)
 * wins over the platform-level env var `LINQ_PHONE_NUMBER` (forward-
 * compat for multi-line Phase 4). Returns empty string if neither is
 * available — the mobile app then falls back to the legacy "no
 * Activate prompt, route directly to profile" behavior so login is
 * never blocked by missing config.
 */
function resolveLinqLinePhone(agentData: Record<string, unknown>): string {
  const perAgent = typeof agentData.linqPhoneNumber === 'string' ? agentData.linqPhoneNumber.trim() : '';
  if (perAgent) return perAgent;
  return (process.env.LINQ_PHONE_NUMBER || '').trim();
}

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;

/**
 * POST /api/mobile/lookup-client-code
 *
 * Public endpoint for the mobile app. Looks up a client by client code using
 * the `clientCodes` index (O(1)) with fallback scan. Returns client + agent
 * data so the app can sign in without reading Firestore directly.
 *
 * Rate-limited to 10 requests/minute per IP.
 *
 * Body: { clientCode: string }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`lookup:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientCode = typeof body?.clientCode === 'string' ? body.clientCode : '';

    if (!clientCode.trim()) {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }

    const normalizedCode = clientCode.trim().toUpperCase();

    // Lead codes come in two shapes:
    //   - Derived (default): 10 digits = MMDDYY + last 4 of phone
    //   - Random fallback: `L` + 7 alphanumerics (when derived collides)
    // Both live in `agents/{agentId}/leads/{leadId}` and are indexed at
    // `leadCodes/{CODE}`. Short-circuit the dispatch by code shape so
    // we don't pay for client/beneficiary index reads on a code that
    // can't possibly belong to those collections.
    //
    // The lead path returns its OWN response shape (no policies, no
    // welcomeFlow fields, no Linq line — just lead identity + agent
    // metadata + accessType: 'lead'). The mobile router branches on
    // accessType to land lead users on /lead-home instead of /agent-profile.
    if (isLeadCode(normalizedCode)) {
      const leadMatch = await findLeadByCode(normalizedCode);
      if (!leadMatch) {
        return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
      }

      const db = getAdminFirestore();
      const leadSnap = await leadMatch.leadRef.get();
      const leadData = leadSnap.data() ?? {};

      // Lead-was-converted redirect. If this lead has been converted to a
      // client (`/api/leads/[leadId]/convert` stamped `convertedToClientId`),
      // transparently swap the response to the client's identity +
      // `accessType: 'client'`. This is the load-bearing piece behind the
      // "no force-quit and reopen" close-of-sale UX: the mobile lead-home
      // listener detects the convert in real time and re-runs this lookup,
      // which now returns client data; the app then navigates the prospect
      // to /activate where the notification prompt fires for the first
      // time. Same redirect covers the cold-start case where a converted
      // lead opens the app for the first time — they land on the client
      // experience directly without needing a new code.
      if (typeof leadData.convertedToClientId === 'string' && leadData.convertedToClientId) {
        const convertedClientId = leadData.convertedToClientId;
        const clientRef = db
          .collection('agents')
          .doc(leadMatch.agentId)
          .collection('clients')
          .doc(convertedClientId);
        const [clientSnap, agentSnap] = await Promise.all([
          clientRef.get(),
          db.collection('agents').doc(leadMatch.agentId).get(),
        ]);

        if (clientSnap.exists) {
          const clientData = clientSnap.data() ?? {};
          const agentData = agentSnap.data() ?? {};

          // Same field normalization as the client branch below. Keep in
          // sync if either side changes.
          const clientActivatedAtRaw = clientData.clientActivatedAt;
          const clientActivatedAt =
            typeof clientActivatedAtRaw === 'object' && clientActivatedAtRaw !== null && 'toDate' in clientActivatedAtRaw
              ? (clientActivatedAtRaw as { toDate: () => Date }).toDate().toISOString()
              : (typeof clientActivatedAtRaw === 'string' ? clientActivatedAtRaw : null);
          const thumbsUpRaw = clientData.welcomeThumbsUpReceivedAt;
          const welcomeThumbsUpReceivedAt =
            typeof thumbsUpRaw === 'object' && thumbsUpRaw !== null && 'toDate' in thumbsUpRaw
              ? (thumbsUpRaw as { toDate: () => Date }).toDate().toISOString()
              : (typeof thumbsUpRaw === 'string' ? thumbsUpRaw : null);
          const linqLinePhone = resolveLinqLinePhone(agentData);

          return NextResponse.json({
            agentId: leadMatch.agentId,
            clientId: convertedClientId,
            clientData: {
              name: clientData.name ?? '',
              email: clientData.email ?? '',
              phone: clientData.phone ?? '',
              // Preserve the original L-code as the session key so the
              // mobile app keeps using the same identifier across the
              // convert. Server-side `convertedToClientCode` stamps the
              // NEW C-code on the lead doc for dashboard cross-reference,
              // but the prospect never needs to know about it.
              clientCode: normalizedCode,
              clientActivatedAt,
              welcomeThumbsUpReceivedAt,
            },
            agentData: {
              name: agentData.name ?? 'Your Agent',
              email: agentData.email ?? '',
              phoneNumber: agentData.phoneNumber ?? '',
              agencyName: agentData.agencyName ?? '',
              referralMessage: agentData.referralMessage ?? '',
              photoBase64: agentData.photoBase64 ?? '',
              agencyLogoBase64: agentData.agencyLogoBase64 ?? '',
              businessCardBase64: agentData.businessCardBase64 ?? '',
            },
            linqLinePhone,
            accessType: 'client' as const,
          });
        }

        // Lead has convertedToClientId stamped but the client doc is missing
        // — log loudly and fall through to the lead response as a safety
        // net so the prospect at least lands on /lead-home and isn't left
        // staring at an error.
        console.error('[lookup-client-code] lead has convertedToClientId but client doc is missing; falling back to lead response', {
          agentId: leadMatch.agentId,
          leadId: leadMatch.leadId,
          convertedToClientId: convertedClientId,
        });
      }

      const agentSnap = await db.collection('agents').doc(leadMatch.agentId).get();
      const agentData = agentSnap.data() ?? {};

      // Stamp appDownloadedAt on first successful lookup. Fire-and-forget;
      // dashboard surfaces this so the agent knows the lead is in the app
      // before the appointment.
      if (!leadData.appDownloadedAt) {
        leadMatch.leadRef
          .update({ appDownloadedAt: new Date().toISOString() })
          .catch(() => {});
      }

      return NextResponse.json({
        agentId: leadMatch.agentId,
        // We deliberately reuse the `clientId` field name in the response so
        // the mobile session shape (agentId / clientId / clientCode) doesn't
        // need a parallel `leadId` channel. Inside the lead doc itself the
        // ID is the lead's doc ID. The mobile app treats this as an opaque
        // session key — it never displays it.
        clientId: leadMatch.leadId,
        clientData: {
          name: leadData.name ?? '',
          phone: leadData.phone ?? '',
          email: leadData.email ?? '',
          clientCode: normalizedCode,
        },
        agentData: {
          name: agentData.name ?? 'Your Agent',
          email: agentData.email ?? '',
          phoneNumber: agentData.phoneNumber ?? '',
          agencyName: agentData.agencyName ?? '',
          referralMessage: agentData.referralMessage ?? '',
          photoBase64: agentData.photoBase64 ?? '',
          agencyLogoBase64: agentData.agencyLogoBase64 ?? '',
          businessCardBase64: agentData.businessCardBase64 ?? '',
        },
        // Leads do NOT participate in the welcome-flow Linq pairing, so
        // no Linq line is returned. Activate-screen short-circuit is
        // handled mobile-side by checking the code prefix on /login.
        linqLinePhone: '',
        accessType: 'lead' as const,
      });
    }

    const clientMatch = await findClientByCode(normalizedCode);
    const beneficiaryMatch = clientMatch ? null : await findBeneficiaryByCode(normalizedCode);
    if (!clientMatch && !beneficiaryMatch) {
      return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
    }

    const db = getAdminFirestore();
    const match = clientMatch || beneficiaryMatch;
    if (!match) {
      return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
    }
    const clientRef = db
      .collection('agents')
      .doc(match.agentId)
      .collection('clients')
      .doc(match.clientId);
    const [clientSnap, agentSnap] = await Promise.all([
      clientRef.get(),
      db.collection('agents').doc(match.agentId).get(),
    ]);

    const clientData = clientSnap.data() ?? {};
    const agentData = agentSnap.data() ?? {};

    // Phase 1 Track B — surface clientActivatedAt + welcomeThumbsUpReceivedAt
    // so the mobile app can route unactivated clients through the new
    // Activate screen (mobile/app/activate.tsx) before landing on the
    // agent profile. Beneficiaries don't follow the welcome flow today;
    // they keep landing on the profile directly.
    const clientActivatedAtRaw = clientData.clientActivatedAt;
    const clientActivatedAt =
      typeof clientActivatedAtRaw === 'object' && clientActivatedAtRaw !== null && 'toDate' in clientActivatedAtRaw
        ? (clientActivatedAtRaw as { toDate: () => Date }).toDate().toISOString()
        : (typeof clientActivatedAtRaw === 'string' ? clientActivatedAtRaw : null);
    const thumbsUpRaw = clientData.welcomeThumbsUpReceivedAt;
    const welcomeThumbsUpReceivedAt =
      typeof thumbsUpRaw === 'object' && thumbsUpRaw !== null && 'toDate' in thumbsUpRaw
        ? (thumbsUpRaw as { toDate: () => Date }).toDate().toISOString()
        : (typeof thumbsUpRaw === 'string' ? thumbsUpRaw : null);
    const linqLinePhone = resolveLinqLinePhone(agentData);

    return NextResponse.json({
      agentId: match.agentId,
      clientId: match.clientId,
      clientData: {
        name: beneficiaryMatch ? beneficiaryMatch.beneficiary.name : (clientData.name ?? ''),
        email: beneficiaryMatch ? (beneficiaryMatch.beneficiary.email ?? '') : (clientData.email ?? ''),
        phone: beneficiaryMatch ? (beneficiaryMatch.beneficiary.phone ?? '') : (clientData.phone ?? ''),
        clientCode: normalizedCode,
        // Phase 1 Track B activation funnel fields. Null when never set.
        clientActivatedAt,
        welcomeThumbsUpReceivedAt,
      },
      agentData: {
        name: agentData.name ?? 'Your Agent',
        email: agentData.email ?? '',
        phoneNumber: agentData.phoneNumber ?? '',
        agencyName: agentData.agencyName ?? '',
        referralMessage: agentData.referralMessage ?? '',
        photoBase64: agentData.photoBase64 ?? '',
        agencyLogoBase64: agentData.agencyLogoBase64 ?? '',
        businessCardBase64: agentData.businessCardBase64 ?? '',
      },
      // Platform-level Linq line (per-agent override possible — see
      // resolveLinqLinePhone). Empty string if neither is configured;
      // mobile falls back to skipping the Activate screen so login is
      // never blocked by a missing env var.
      linqLinePhone,
      accessType: beneficiaryMatch ? 'beneficiary' : 'client',
      beneficiaryData: beneficiaryMatch
        ? {
            policyId: beneficiaryMatch.policyId,
            role: beneficiaryMatch.beneficiary.type,
            relationship: beneficiaryMatch.beneficiary.relationship ?? null,
            dateOfBirth: beneficiaryMatch.beneficiary.dateOfBirth ?? null,
            address: beneficiaryMatch.beneficiary.address ?? null,
            insuredName: clientData.name ?? '',
          }
        : null,
    });
  } catch (error) {
    console.error('lookup-client-code error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
