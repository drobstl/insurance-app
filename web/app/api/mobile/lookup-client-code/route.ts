import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findClientByCode } from '../../../../lib/client-code-lookup';
import { findBeneficiaryByCode } from '../../../../lib/beneficiary-code-lookup';

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
