import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';
import { generateUniqueLeadCode } from '../../../../lib/lead-code-generator';
import { deriveLeadCode } from '../../../../lib/lead-code-derive';
import { extractLeadFromPdf, type ExtractedLeadFields } from '../../../../lib/lead-form-extractor';

const MAX_PDF_BYTES = 10 * 1024 * 1024;  // 10 MB; sample fixtures are <500 KB

/**
 * POST /api/leads/upload
 *
 * Multipart form upload of a single lead-form PDF (Mail-In / Call-In /
 * Digital). The endpoint:
 *   1. Verifies the agent's auth token.
 *   2. Pulls the file out of FormData and base64-encodes it.
 *   3. Stores the raw PDF in Firebase Storage at
 *      `agents/{agentId}/leads/_uploads/{timestamp}_{filename}` so the
 *      agent can re-download the original from the lead detail page.
 *   4. Calls the lead-form extractor (Claude vision + JSON schema).
 *   5. Derives the lead code (10-digit MMDDYY+last4 when DOB+phone
 *      are both extracted). Falls back to a random `L…` code when
 *      DOB is missing OR a collision happens.
 *   6. Writes the lead doc + leadCodes index entry.
 *
 * Returns the extracted fields so the dashboard can show a preview the
 * agent confirms before the lead is committed visible. (We commit
 * immediately in v1 — agent edits / corrections happen via the
 * existing autosave on the detail page.)
 *
 * Auth: Bearer ID token. Agent owns leads created from their uploads.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth ──
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    // ── Pull the PDF out of multipart form data ──
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
    }
    const file = form.get('file');
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
    const pdfBase64 = pdfBuffer.toString('base64');

    // ── Persist raw PDF first (so we have provenance even if extraction fails) ──
    const db = getAdminFirestore();
    const storage = getAdminStorage().bucket();
    const safeFilename = (file.name || 'lead-form.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const storagePath = `agents/${agentId}/leads/_uploads/${Date.now()}_${safeFilename}`;
    let sourceFileUrl = '';
    try {
      const fileRef = storage.file(storagePath);
      await fileRef.save(pdfBuffer, {
        metadata: { contentType: 'application/pdf' },
        resumable: false,
      });
      // Signed URL valid for 1 year — agents can re-download the original.
      const [signed] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });
      sourceFileUrl = signed;
    } catch (storageErr) {
      // Don't fail the whole request if Storage is misconfigured — we
      // still have the extracted fields. Surface in the response.
      console.error('[leads/upload] Storage write failed:', storageErr);
    }

    // ── Extract fields via Claude ──
    let extracted: ExtractedLeadFields;
    try {
      extracted = await extractLeadFromPdf(pdfBase64);
    } catch (extractionErr) {
      console.error('[leads/upload] Extraction failed:', extractionErr);
      return NextResponse.json(
        {
          error: 'Could not read this lead form. Try uploading a different scan, or use + Create Lead to enter manually.',
          sourceFileUrl,
        },
        { status: 422 },
      );
    }

    // ── Validate required fields ──
    if (!extracted.name) {
      return NextResponse.json(
        {
          error: 'Could not read the lead\'s name from this form. Use + Create Lead to enter manually.',
          extractionFlags: extracted.extractionFlags,
          sourceFileUrl,
        },
        { status: 422 },
      );
    }
    if (!extracted.phone) {
      return NextResponse.json(
        {
          error: 'Could not read a phone number from this form. Use + Create Lead to enter manually.',
          extractionFlags: extracted.extractionFlags,
          sourceFileUrl,
        },
        { status: 422 },
      );
    }

    // ── Derive code (lead's phone, 10 digits) or fall back to random `L…` ──
    // Universal — every lead form has a phone. Falls back to random
    // only when there's a collision with another lead at the same
    // phone (rare; usually a household with a shared landline).
    let leadCode: string;
    let codeKind: 'derived' | 'fallback';
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc();

    const derived = deriveLeadCode(extracted.phone);

    if (derived) {
      try {
        await db.collection('leadCodes').doc(derived).create({
          agentId,
          leadId: leadRef.id,
        });
        leadCode = derived;
        codeKind = 'derived';
      } catch {
        leadCode = await generateUniqueLeadCode();
        codeKind = 'fallback';
        await db.collection('leadCodes').doc(leadCode).set({
          agentId,
          leadId: leadRef.id,
        });
      }
    } else {
      // Phone too short to derive (less than 10 digits — likely a
      // partial/garbled extraction). Fall back to random L-code.
      leadCode = await generateUniqueLeadCode();
      codeKind = 'fallback';
      await db.collection('leadCodes').doc(leadCode).set({
        agentId,
        leadId: leadRef.id,
      });
    }

    // ── Compose lead doc ──
    // Strip undefined values so Firestore doesn't choke. Address is
    // either the structured object or null (no half-state).
    const leadDoc: Record<string, unknown> = {
      name: extracted.name,
      phone: extracted.phone,
      leadCode,
      codeKind,
      formType: extracted.formType,
      sourceFileUrl,
      extractionConfidence: extracted.extractionConfidence,
      extractionFlags: extracted.extractionFlags,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: agentId,
    };
    if (extracted.email) leadDoc.email = extracted.email;
    if (extracted.dateOfBirth) leadDoc.dateOfBirth = extracted.dateOfBirth;
    if (extracted.ageYears !== null) leadDoc.ageYears = extracted.ageYears;
    if (extracted.address) leadDoc.address = extracted.address;
    if (extracted.gender) leadDoc.gender = extracted.gender;
    if (extracted.heightText) leadDoc.heightText = extracted.heightText;
    if (extracted.weightLbs !== null) leadDoc.weightLbs = extracted.weightLbs;
    if (extracted.smokerStatus) leadDoc.smokerStatus = extracted.smokerStatus;
    if (extracted.mortgageDetails) leadDoc.mortgageDetails = extracted.mortgageDetails;
    if (extracted.spouseName) leadDoc.spouseName = extracted.spouseName;
    if (extracted.spouseAgeYears !== null) leadDoc.spouseAgeYears = extracted.spouseAgeYears;
    if (extracted.beneficiaryName) leadDoc.beneficiaryName = extracted.beneficiaryName;

    await leadRef.set(leadDoc);

    return NextResponse.json({
      leadId: leadRef.id,
      leadCode,
      codeKind,
      formType: extracted.formType,
      extractionConfidence: extracted.extractionConfidence,
      extractionFlags: extracted.extractionFlags,
      extracted,
      sourceFileUrl,
    });
  } catch (error) {
    console.error('leads/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Next.js App Router config — let the file upload run a bit longer
// than the default. The Claude call is the long pole (~5-15s for a
// vision request); 60s is safe.
export const runtime = 'nodejs';
export const maxDuration = 60;
