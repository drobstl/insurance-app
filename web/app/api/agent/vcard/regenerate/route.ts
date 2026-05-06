import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { ensureAgentVCardAttachment } from '../../../../../lib/agent-vcard-store';
import { getAdminAuth } from '../../../../../lib/firebase-admin';

/**
 * POST /api/agent/vcard/regenerate
 *
 * Idempotent endpoint that ensures the agent's vCard attachment is
 * up-to-date on Linq. Cheap on cache hit (no upload), expensive only
 * when the source fingerprint changed.
 *
 * Called from `web/app/dashboard/settings/page.tsx` immediately after a
 * save that touched the agent name, agency name, or profile photo. Also
 * safe to call from anywhere — the helper short-circuits on a matching
 * fingerprint.
 *
 * Body: { force?: boolean }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
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

    const body = (await req.json().catch(() => null)) as { force?: unknown } | null;
    const force = body?.force === true;

    const result = await ensureAgentVCardAttachment(agentId, { force });

    return NextResponse.json({
      success: true,
      outcome: result.outcome,
      attachmentPresent: !!result.attachmentId,
      vcardSizeBytes: result.vcard?.vcardSizeBytes ?? null,
      photoEmbedded: result.vcard?.photoEmbedded ?? null,
      inputPhotoBytes: result.vcard?.inputPhotoBytes ?? null,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[agent-vcard] regenerate failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
