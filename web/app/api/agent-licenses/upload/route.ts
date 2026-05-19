import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';
import {
  isValidStateCode,
  licenseStoragePath,
  extForLicenseContentType,
  SUPPORTED_LICENSE_CONTENT_TYPES,
  type StateCode,
  type SupportedLicenseContentType,
} from '../../../../lib/agent-licenses';

const MAX_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB — applies to PDF, JPEG, and PNG alike

/**
 * POST /api/agent-licenses/upload
 *
 * Multipart upload of a license PDF for a single state. Body must
 * include `file` (PDF), `stateCode` (USPS 2-letter), `number`
 * (license number), and `expiresOn` (YYYY-MM-DD, optional — empty
 * string allowed).
 *
 * On success, writes the PDF to Firebase Storage at
 * `agents/{agentId}/licenses/{stateCode}.pdf` (overwrites any
 * existing one for that state — agents renewing a license replace
 * the prior PDF) and updates
 * `agents/{agentId}.licenses[stateCode]` with the metadata.
 *
 * Auth: Bearer ID token; agent owns their own licenses.
 */
export async function POST(req: NextRequest) {
  try {
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

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }
    const file = form.get('file');
    const stateCodeRaw = String(form.get('stateCode') || '').trim().toUpperCase();
    const number = String(form.get('number') || '').trim();
    const expiresOn = String(form.get('expiresOn') || '').trim();

    if (!isValidStateCode(stateCodeRaw)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
    }
    const stateCode = stateCodeRaw as StateCode;
    if (!number) {
      return NextResponse.json({ error: 'License number is required' }, { status: 400 });
    }
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
      return NextResponse.json({ error: 'expiresOn must be YYYY-MM-DD' }, { status: 400 });
    }
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${file.size} bytes; max ${MAX_FILE_BYTES})` },
        { status: 413 },
      );
    }

    // Resolve content type. Browsers occasionally hand us empty
    // `file.type` (drag-drop from some apps); fall back to the file
    // extension before rejecting.
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

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const storage = getAdminStorage().bucket();
    const newExt = extForLicenseContentType(resolvedContentType);
    const path = licenseStoragePath(agentId, stateCode, newExt);

    // Replacing a license? Delete any old file at a DIFFERENT extension
    // before writing the new one — otherwise the orphaned old file sits
    // in Storage forever and could come back if the user re-uploads at
    // the old extension later.
    const db = getAdminFirestore();
    const existingSnap = await db.collection('agents').doc(agentId).get();
    const existing = (existingSnap.data()?.licenses as Record<string, { pdfStoragePath?: string } | undefined> | undefined)?.[stateCode];
    if (existing?.pdfStoragePath && existing.pdfStoragePath !== path) {
      await storage.file(existing.pdfStoragePath).delete().catch(() => {});
    }

    await storage.file(path).save(fileBuffer, {
      metadata: { contentType: resolvedContentType },
      resumable: false,
    });

    const uploadedAt = new Date().toISOString();
    const entry = {
      number,
      expiresOn: expiresOn || null,
      pdfStoragePath: path,
      fileContentType: resolvedContentType,
      uploadedAt,
    };

    // Merge — overwrites any existing entry for this state code,
    // leaves others untouched.
    await db.collection('agents').doc(agentId).set(
      { licenses: { [stateCode]: entry } },
      { merge: true },
    );

    return NextResponse.json({ stateCode, entry });
  } catch (error) {
    console.error('agent-licenses/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 30;
