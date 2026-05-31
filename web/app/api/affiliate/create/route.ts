import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  createFirstPromoterPromoter,
  extractAffiliateFields,
  FirstPromoterApiError,
  getFirstPromoterPromoterByEmail,
  isFirstPromoterConfigured,
} from '../../../../lib/firstpromoter';

/**
 * POST /api/affiliate/create
 *
 * Enroll the calling agent in the FirstPromoter affiliate program.
 * Idempotent — if the agent already has affiliate fields on their
 * doc, returns them without calling FP. If FP returns "already
 * exists", falls back to looking up the existing promoter so the
 * agent's tracking link can still be returned.
 *
 * Auth: Bearer <Firebase ID token>
 * Body: none required (we use the agent's auth email + their
 *       agents/{uid} doc for first/last name)
 *
 * Response on success (200):
 *   { refLink, refToken, coupon, promoterId, alreadyEnrolled }
 *
 * Response when FP isn't configured (503):
 *   { error: 'affiliate_program_unavailable' }
 *   — Dashboard treats this as a "Coming soon" state.
 */
export async function POST(req: NextRequest) {
  try {
    // --- 1. Auth ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;
    const authEmail = (decoded.email || '').trim().toLowerCase();
    if (!authEmail) {
      return NextResponse.json({ error: 'missing_email' }, { status: 400 });
    }

    // --- 2. Bail early if FP isn't configured ---
    if (!isFirstPromoterConfigured()) {
      return NextResponse.json(
        { error: 'affiliate_program_unavailable' },
        { status: 503 },
      );
    }

    // --- 3. Idempotency — return cached affiliate if already enrolled ---
    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    const agentData = agentSnap.exists ? agentSnap.data() : null;
    const existingAffiliate = (agentData as { affiliate?: AffiliateDoc } | null)?.affiliate;
    if (existingAffiliate?.refLink) {
      return NextResponse.json({
        refLink: existingAffiliate.refLink,
        refToken: existingAffiliate.refToken ?? null,
        coupon: existingAffiliate.coupon ?? null,
        promoterId: existingAffiliate.firstPromoterPromoterId ?? null,
        alreadyEnrolled: true,
      });
    }

    // --- 4. Build name for the FP profile ---
    const fullName = typeof agentData?.name === 'string' ? agentData.name.trim() : '';
    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const lastName = rest.join(' ');

    // --- 5. Create the promoter in FirstPromoter ---
    let promoter;
    try {
      promoter = await createFirstPromoterPromoter({
        email: authEmail,
        cust_id: agentId,
        drip_emails: true,
        profile: {
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          company_name:
            typeof agentData?.agencyName === 'string'
              ? agentData.agencyName.trim() || undefined
              : undefined,
        },
      });
    } catch (err) {
      // "Already exists" in FP but not on our agent doc → recover by
      // looking up the existing promoter.
      if (err instanceof FirstPromoterApiError && err.code === 'already_exists') {
        const existing = await getFirstPromoterPromoterByEmail(authEmail);
        if (!existing) {
          // FP told us it exists but won't return it — give up
          // gracefully rather than loop.
          return NextResponse.json(
            { error: 'affiliate_lookup_failed' },
            { status: 502 },
          );
        }
        promoter = existing;
      } else if (err instanceof FirstPromoterApiError) {
        console.error('[affiliate/create] FirstPromoter API error', {
          status: err.status,
          code: err.code,
          message: err.message,
        });
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
        );
      } else {
        throw err;
      }
    }

    const { refLink, refToken, coupon } = extractAffiliateFields(promoter);
    if (!refLink) {
      console.error('[affiliate/create] FP returned no ref_link', { promoterId: promoter.id });
      return NextResponse.json(
        { error: 'affiliate_missing_ref_link' },
        { status: 502 },
      );
    }

    // --- 6. Cache on the agent doc so future loads don't re-hit FP ---
    const affiliatePayload: AffiliateDoc = {
      firstPromoterPromoterId: promoter.id,
      refLink,
      refToken: refToken || null,
      coupon: coupon || null,
      createdAt: FieldValue.serverTimestamp() as unknown as null,
    };
    await agentRef.set({ affiliate: affiliatePayload }, { merge: true });

    return NextResponse.json({
      refLink,
      refToken: refToken || null,
      coupon: coupon || null,
      promoterId: promoter.id,
      alreadyEnrolled: false,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[affiliate/create] unexpected error', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

interface AffiliateDoc {
  firstPromoterPromoterId: number;
  refLink: string;
  refToken: string | null;
  coupon: string | null;
  createdAt: null;
}
