import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';
import {
  isValidStateCode,
  getLicenseForState,
  getLicenseSignedUrl,
  type StateCode,
} from '../../../../lib/agent-licenses';

/**
 * GET /api/agent-licenses/[stateCode]
 * Returns a signed URL for the agent's license PDF in this state.
 * Used by the settings UI to render a "View PDF" link.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ stateCode: string }> },
) {
  try {
    const { stateCode: rawCode } = await context.params;
    const stateCode = rawCode.toUpperCase();
    if (!isValidStateCode(stateCode)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const result = await getLicenseSignedUrl(decoded.uid, stateCode as StateCode);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ url: result.url, contentType: result.contentType });
  } catch (error) {
    console.error('agent-licenses/get error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/agent-licenses/[stateCode]
 * Update license metadata (number, expiresOn) WITHOUT replacing the
 * PDF. Used when an agent renews and only needs to push the new
 * expiration date forward.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ stateCode: string }> },
) {
  try {
    const { stateCode: rawCode } = await context.params;
    const stateCode = rawCode.toUpperCase();
    if (!isValidStateCode(stateCode)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (typeof body?.number === 'string' && body.number.trim()) {
      updates[`licenses.${stateCode}.number`] = body.number.trim();
    }
    if (body?.expiresOn !== undefined) {
      const v = String(body.expiresOn || '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return NextResponse.json({ error: 'expiresOn must be YYYY-MM-DD' }, { status: 400 });
      }
      updates[`licenses.${stateCode}.expiresOn`] = v || null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const db = getAdminFirestore();
    await db.collection('agents').doc(decoded.uid).update(updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('agent-licenses/patch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/agent-licenses/[stateCode]
 * Remove a license entirely — deletes the PDF from Storage AND removes
 * the metadata field from `agents/{agentId}.licenses`.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ stateCode: string }> },
) {
  try {
    const { stateCode: rawCode } = await context.params;
    const stateCode = rawCode.toUpperCase();
    if (!isValidStateCode(stateCode)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminFirestore();
    const storage = getAdminStorage().bucket();

    // Best-effort delete of the stored file; missing file is fine.
    // Use the entry's `pdfStoragePath` directly so we hit the right
    // extension (legacy .pdf vs new .jpg / .png).
    const entry = await getLicenseForState(decoded.uid, stateCode);
    const path = entry?.pdfStoragePath;
    if (path) {
      await storage.file(path).delete().catch(() => {});
    }

    // Remove the field from the agent doc using FieldValue.delete().
    await db.collection('agents').doc(decoded.uid).update({
      [`licenses.${stateCode}`]: FieldValue.delete(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('agent-licenses/delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
