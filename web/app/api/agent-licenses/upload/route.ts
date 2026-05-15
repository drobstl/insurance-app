import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';
import {
  isValidStateCode,
  licenseStoragePath,
  type StateCode,
} from '../../../../lib/agent-licenses';

const MAX_PDF_BYTES = 10 * 1024 * 1024;  // 10 MB

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
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `File too large (${file.size} bytes; max ${MAX_PDF_BYTES})` },
        { status: 413 },
      );
    }
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const storage = getAdminStorage().bucket();
    const path = licenseStoragePath(agentId, stateCode);

    await storage.file(path).save(pdfBuffer, {
      metadata: { contentType: 'application/pdf' },
      resumable: false,
    });

    const uploadedAt = new Date().toISOString();
    const entry = {
      number,
      expiresOn: expiresOn || null,
      pdfStoragePath: path,
      uploadedAt,
    };

    // Merge — overwrites any existing entry for this state code,
    // leaves others untouched.
    const db = getAdminFirestore();
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
