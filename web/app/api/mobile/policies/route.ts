import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findBeneficiaryByCode } from '../../../../lib/beneficiary-code-lookup';
import { isValidE164, normalizePhone } from '../../../../lib/phone';

/**
 * GET /api/mobile/policies?agentId=...&clientId=...&clientCode=...
 *
 * Public endpoint for the mobile app. Authenticates via clientCode
 * (validated against the client document) instead of Firebase Auth.
 * Rate-limited to 20 requests/minute per IP.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(`policies:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agentId');
    const clientId = searchParams.get('clientId');
    const clientCode = searchParams.get('clientCode');

    if (!agentId || !clientId || !clientCode) {
      return NextResponse.json(
        { error: 'agentId, clientId, and clientCode are required' },
        { status: 400 },
      );
    }

    const firestore = getAdminFirestore();

    const clientDoc = await firestore
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const normalizedCode = clientCode.trim().toUpperCase();
    const storedCode = clientDoc.data()?.clientCode;
    const isClientCode = !!storedCode && storedCode === normalizedCode;
    const beneficiaryMatch = isClientCode ? null : await findBeneficiaryByCode(normalizedCode);
    const isBeneficiaryCode = !!beneficiaryMatch
      && beneficiaryMatch.agentId === agentId
      && beneficiaryMatch.clientId === clientId;
    if (!isClientCode && !isBeneficiaryCode) {
      return NextResponse.json({ error: 'Invalid client code' }, { status: 403 });
    }

    const snap = await firestore
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('policies')
      .orderBy('createdAt', 'desc')
      .get();

    // Multi-policy coalescing for beneficiaries (May 10, 2026):
    // when a beneficiary enters one access code, surface every
    // policy under this policyholder where they appear as a
    // beneficiary — matched by phone (preferred) or by name. The
    // entered access code only resolves to one (policy,
    // beneficiary) pair, but coalescing lets a beneficiary on
    // multiple policies see their full role across the
    // policyholder's book without entering each code separately.
    const beneficiaryNameLower = isBeneficiaryCode
      ? (typeof beneficiaryMatch.beneficiary.name === 'string'
          ? beneficiaryMatch.beneficiary.name.trim().toLowerCase()
          : '')
      : '';
    const beneficiaryPhoneE164 = isBeneficiaryCode
      ? (typeof beneficiaryMatch.beneficiary.phone === 'string'
          ? (() => {
              const n = normalizePhone(beneficiaryMatch.beneficiary.phone);
              return isValidE164(n) ? n : '';
            })()
          : '')
      : '';

    const policies = snap.docs
      .map((d) => {
      const data = d.data();
      if (isBeneficiaryCode) {
        const beneficiaries = Array.isArray(data.beneficiaries) ? data.beneficiaries : [];
        const filteredBeneficiaries = beneficiaries.filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          const e = entry as Record<string, unknown>;
          // Match 1: same access code (the original code path).
          const accessCode = e.accessCode;
          if (typeof accessCode === 'string' && accessCode.trim().toUpperCase() === normalizedCode) {
            return true;
          }
          // Match 2: same phone (coalescing).
          if (beneficiaryPhoneE164) {
            const p = typeof e.phone === 'string' ? normalizePhone(e.phone) : '';
            if (isValidE164(p) && p === beneficiaryPhoneE164) return true;
          }
          // Match 3: same name (last-resort coalescing for
          // beneficiaries without phone — keeps the door open
          // for older records). Phone match takes priority above.
          if (beneficiaryNameLower) {
            const n = typeof e.name === 'string' ? e.name.trim().toLowerCase() : '';
            if (n && n === beneficiaryNameLower) return true;
          }
          return false;
        });
        if (filteredBeneficiaries.length === 0) return null;
        data.beneficiaries = filteredBeneficiaries;
      }
      const createdAt = data.createdAt
        ? { seconds: data.createdAt.seconds, nanoseconds: data.createdAt.nanoseconds }
        : null;
      return { id: d.id, ...data, createdAt };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('[mobile/policies] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 },
    );
  }
}
