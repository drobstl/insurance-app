import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import {
  SUPPORTED_LICENSE_CONTENT_TYPES,
  type SupportedLicenseContentType,
} from '../../../../lib/agent-licenses';
import { extractLicenseFields } from '../../../../lib/license-extractor';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors the upload route

/**
 * POST /api/agent-licenses/extract
 *
 * Reads the license number, issuing state, and expiration off an
 * uploaded license file (PDF / JPEG / PNG) via Claude vision, so the
 * State Licenses settings form can prefill those fields. Saves nothing —
 * the agent reviews the result and the separate upload route persists.
 *
 * Auth: Bearer ID token (the requester just has to be a signed-in agent;
 * the file isn't stored or tied to any record here).
 *
 * Extraction is a convenience, never a gate: any failure returns
 * `{ fields: null }` with a 200 so the client silently falls back to
 * manual entry. Only auth + the basic file checks return 4xx.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    try {
      await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    // Resolve content type, falling back to the extension when the browser
    // hands us an empty `file.type` (same logic as the upload route).
    const lowerName = file.name.toLowerCase();
    const resolvedContentType: SupportedLicenseContentType | null = (() => {
      const t = file.type;
      if (t === 'application/pdf' || t === 'image/jpeg' || t === 'image/png') return t;
      if (!t) {
        if (lowerName.endsWith('.pdf')) return 'application/pdf';
        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
        if (lowerName.endsWith('.png')) return 'image/png';
      }
      return null;
    })();
    if (!resolvedContentType) {
      return NextResponse.json(
        { error: `File must be one of: ${SUPPORTED_LICENSE_CONTENT_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    try {
      const fields = await extractLicenseFields(base64, resolvedContentType);
      return NextResponse.json({ fields });
    } catch (err) {
      // Soft-fail: extraction is convenience-only, never block the agent.
      console.error('agent-licenses/extract extraction failed:', err);
      return NextResponse.json({ fields: null });
    }
  } catch (error) {
    console.error('agent-licenses/extract error:', error);
    return NextResponse.json({ fields: null });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 30;
