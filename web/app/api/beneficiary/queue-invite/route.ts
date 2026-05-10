import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isValidE164, normalizePhone } from '../../../../lib/phone';
import { beneficiaryActivationPlaceholderThreadId } from '../../../../lib/beneficiary-activation-handler';

/**
 * POST /api/beneficiary/queue-invite
 *
 * Called by the policyholder's mobile app when they tap the Invite
 * button next to a beneficiary. Server-side responsibilities:
 *
 * 1. Verify the policyholder owns the policy (lookup by clientCode).
 * 2. Locate the target beneficiary (by phone) and ensure an
 *    `accessCode` exists on every beneficiary entry that shares
 *    that phone across the agent's policies. Coalescing — same
 *    person on multiple policies gets ONE invite SMS but the
 *    server pre-registers placeholder threads for ALL their
 *    policies so they see their full role across the book on
 *    activation.
 * 3. Pre-register a `beneficiary_pending_{policyId}_{idx}`
 *    placeholder thread for each policy where this phone appears,
 *    keyed against the byPhone resolver so the Linq webhook
 *    surfaces the placeholder when the beneficiary texts in.
 * 4. Return the pre-filled SMS body for the policyholder's mobile
 *    app to launch via `sms:` URL — sent FROM the policyholder's
 *    own phone.
 *
 * Body: { clientCode: string, beneficiaryPhone: string }
 *   `clientCode` authenticates the policyholder (no Firebase Auth
 *   required — this is invoked from the client's mobile app which
 *   only has the lookup code, not a Firebase user).
 *
 * Returns: {
 *   success: true,
 *   smsBody: string,            // Pre-filled invite SMS
 *   beneficiaryPhone: string,   // Normalized E.164 for sms: URL
 *   primaryAccessCode: string,  // The code shown in the SMS (also
 *                               // works to activate any matching
 *                               // policy thanks to multi-policy
 *                               // coalescing).
 *   matchedPolicyCount: number, // How many policies this phone
 *                               // appears on (for the policyholder
 *                               // app to show "X policies covered").
 * }
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app').replace(/\/$/, '');
const APP_DOWNLOAD_URL = `${APP_URL}/app`;

function generateBeneficiaryAccessCode(): string {
  // 'B' prefix + 7 chars. Matches the convention in
  // `web/app/dashboard/clients/page.tsx > generateBeneficiaryCode`.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'B';
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Locked May 10, 2026 (Daniel sign-off, "Copy A"). Sent from the
 * policyholder's personal phone via `sms:` URL. The policyholder is
 * already in the beneficiary's contacts (family member), so we drop
 * the "I'm X here" intro that would feel awkward between people
 * who already know each other.
 */
function buildBeneficiaryInviteSmsBody(params: {
  beneficiaryFirstName: string;
  accessCode: string;
}): string {
  const first = params.beneficiaryFirstName?.trim() || 'there';
  return (
    `Hey ${first}, I have you listed as a beneficiary on one of my insurance policies, `
    + 'and I want to make sure you have everything you need if something ever happens. '
    + 'Quick app setup:\n\n'
    + `1. Download: ${APP_DOWNLOAD_URL}\n`
    + '2. Tap Activate, then tap Send\n'
    + `3. Log in with code ${params.accessCode}`
  );
}

interface BeneficiaryRecord {
  name?: string;
  phone?: string;
  accessCode?: string;
  type?: 'primary' | 'contingent';
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      clientCode?: unknown;
      beneficiaryPhone?: unknown;
    } | null;

    const clientCode =
      typeof body?.clientCode === 'string' ? body.clientCode.trim().toUpperCase() : '';
    const rawBeneficiaryPhone =
      typeof body?.beneficiaryPhone === 'string' ? body.beneficiaryPhone.trim() : '';

    if (!clientCode) {
      return NextResponse.json({ error: 'Missing clientCode' }, { status: 400 });
    }
    if (!rawBeneficiaryPhone) {
      return NextResponse.json({ error: 'Missing beneficiaryPhone' }, { status: 400 });
    }

    const beneficiaryPhone = normalizePhone(rawBeneficiaryPhone);
    if (!isValidE164(beneficiaryPhone)) {
      return NextResponse.json(
        { error: 'beneficiaryPhone is not a valid E.164 number' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    // Resolve the policyholder via clientCode (no Firebase Auth on
    // the mobile policyholder side — they auth via their lookup
    // code). The lookup mirrors what `findClientByCode` does in
    // mobile/lookup-client-code.
    const codeMapSnap = await db.collection('clientCodes').doc(clientCode).get();
    if (!codeMapSnap.exists) {
      return NextResponse.json(
        { error: 'Invalid client code' },
        { status: 404 },
      );
    }
    const codeMap = codeMapSnap.data() as { agentId?: string; clientId?: string };
    const agentId = codeMap.agentId;
    const clientId = codeMap.clientId;
    if (!agentId || !clientId) {
      return NextResponse.json(
        { error: 'Client code map is malformed' },
        { status: 500 },
      );
    }

    // Find every policy under this agent+client where the
    // beneficiary phone matches. Coalescing — same person on
    // multiple policies gets ONE invite SMS, but the placeholder
    // thread is registered for ALL their policies so they see
    // their full role on activation.
    //
    // Beneficiaries are nested in policy docs as an array. We
    // can't query arrays of objects directly in Firestore, so we
    // load the agent+client's policies and filter in code. Books
    // are small enough that this is fine.
    const policiesSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('policies')
      .get();

    interface MatchedSlot {
      policyId: string;
      beneficiaryIndex: number;
      beneficiary: BeneficiaryRecord;
    }
    const matches: MatchedSlot[] = [];
    for (const policyDoc of policiesSnap.docs) {
      const data = policyDoc.data() as { beneficiaries?: unknown };
      const beneficiaries = Array.isArray(data.beneficiaries)
        ? (data.beneficiaries as BeneficiaryRecord[])
        : [];
      for (let i = 0; i < beneficiaries.length; i++) {
        const b = beneficiaries[i];
        if (typeof b?.phone !== 'string') continue;
        const normalized = normalizePhone(b.phone);
        if (!isValidE164(normalized)) continue;
        if (normalized !== beneficiaryPhone) continue;
        matches.push({ policyId: policyDoc.id, beneficiaryIndex: i, beneficiary: b });
      }
    }

    if (matches.length === 0) {
      return NextResponse.json(
        {
          error:
            'No beneficiary with that phone number found on any of your policies. Add the phone to the beneficiary record first.',
        },
        { status: 404 },
      );
    }

    // Ensure each matched beneficiary has an accessCode. Existing
    // codes are preserved; only generate for slots that don't have
    // one. We pick the first match's code (or newly-generated) as
    // the "primary" code shown in the SMS — any of them resolves
    // to this beneficiary on activation, but showing only one
    // keeps the SMS simple.
    const now = new Date().toISOString();
    let primaryAccessCode: string | null = null;

    for (const match of matches) {
      const policyRef = db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .doc(clientId)
        .collection('policies')
        .doc(match.policyId);

      // Read-modify-write the array. Concurrent invites for the
      // same beneficiary across two policies don't collide because
      // each transaction targets a different policy doc.
      let assignedCode: string | null = null;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(policyRef);
        if (!snap.exists) return;
        const data = snap.data() as { beneficiaries?: unknown };
        const beneficiaries = Array.isArray(data.beneficiaries)
          ? ([...(data.beneficiaries as BeneficiaryRecord[])])
          : [];
        const target = beneficiaries[match.beneficiaryIndex];
        if (!target) return;

        const existing = typeof target.accessCode === 'string' ? target.accessCode : null;
        const code = existing || generateBeneficiaryAccessCode();
        assignedCode = code;

        if (!existing) {
          beneficiaries[match.beneficiaryIndex] = {
            ...target,
            accessCode: code,
            beneficiaryAccessCodeAssignedAt: now,
          };
          tx.update(policyRef, { beneficiaries });
        }
      });

      if (assignedCode && !primaryAccessCode) {
        primaryAccessCode = assignedCode;
      }
    }

    if (!primaryAccessCode) {
      return NextResponse.json(
        { error: 'Failed to assign access codes' },
        { status: 500 },
      );
    }

    // Pre-register placeholder threads for every matched policy so
    // the Linq webhook recognizes the beneficiary's activation
    // inbound regardless of which match's code they used.
    for (const match of matches) {
      const placeholderThreadId = beneficiaryActivationPlaceholderThreadId(
        match.policyId,
        match.beneficiaryIndex,
      );

      const threadRef = db
        .collection('agents')
        .doc(agentId)
        .collection('conversationThreads')
        .doc(placeholderThreadId);

      await threadRef.set(
        {
          threadId: placeholderThreadId,
          agentId,
          provider: 'linq',
          providerThreadId: placeholderThreadId,
          providerType: 'sms_direct',
          lane: 'beneficiary',
          purpose: 'beneficiary',
          // Stash the policyholder's clientId on the placeholder so
          // the activation handler can resolve back to the parent
          // client record without re-parsing the threadId.
          beneficiaryClientId: clientId,
          beneficiaryPolicyId: match.policyId,
          beneficiaryIndex: match.beneficiaryIndex,
          linkedEntityType: 'beneficiary',
          linkedEntityId: `${match.policyId}:${match.beneficiaryIndex}`,
          participantPhonesE164: [beneficiaryPhone],
          aiPolicy: {
            allowAutoReply: false,
            allowedResponder: 'manual',
          },
          lifecycleStatus: 'active',
          confidence: 'medium',
          assignmentSource: 'outbound_create',
          isBeneficiaryActivationPlaceholder: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: now,
        },
        { merge: true },
      );

      // byPhone resolver entry — same convention as welcome
      // activation. Multiple placeholders for the same phone
      // accumulate via FieldValue.arrayUnion so the webhook can
      // resolve any of them.
      const byPhoneRef = db
        .collection('agents')
        .doc(agentId)
        .collection('threadResolvers')
        .doc('byPhone')
        .collection('entries')
        .doc(beneficiaryPhone);
      await byPhoneRef.set(
        {
          phoneE164: beneficiaryPhone,
          latestThreadId: placeholderThreadId,
          threadIdCandidates: FieldValue.arrayUnion(placeholderThreadId),
          updatedAt: now,
        },
        { merge: true },
      );
    }

    // Build the SMS body using the primary match's name + code.
    const primaryMatch = matches[0];
    const beneficiaryFirstName =
      typeof primaryMatch.beneficiary.name === 'string'
        ? primaryMatch.beneficiary.name.split(/\s+/)[0]
        : 'there';

    const smsBody = buildBeneficiaryInviteSmsBody({
      beneficiaryFirstName,
      accessCode: primaryAccessCode,
    });

    return NextResponse.json({
      success: true,
      smsBody,
      beneficiaryPhone,
      primaryAccessCode,
      matchedPolicyCount: matches.length,
    });
  } catch (error) {
    console.error('[beneficiary-queue-invite] error', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to queue beneficiary invite',
      },
      { status: 500 },
    );
  }
}

// `getAdminAuth` is intentionally not used — this endpoint
// authenticates via clientCode lookup, not Firebase Auth (the
// mobile policyholder app doesn't have a Firebase user, only a
// lookup code). Suppress the unused-import lint.
void getAdminAuth;
