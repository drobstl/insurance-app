import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { PDFDocument } from 'pdf-lib';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../../../../lib/firebase-admin';
import { generateUniqueLeadCode } from '../../../../lib/lead-code-generator';
import { deriveLeadCode } from '../../../../lib/lead-code-derive';
import { extractLeadFromPdf, type ExtractedLeadFields } from '../../../../lib/lead-form-extractor';

const MAX_PDF_BYTES = 50 * 1024 * 1024;  // 50 MB — multi-lead bundles can run 20-30 MB
const EXTRACTION_CONCURRENCY = 4;        // Anthropic vision calls in parallel

/**
 * POST /api/leads/upload
 *
 * Multipart form upload of a lead-form PDF. Supports both:
 *
 *   - **Single-page**: one lead per file. Same response shape as before:
 *     { leadId, leadCode, codeKind, formType, extractionConfidence, ... }
 *
 *   - **Multi-page**: each page is treated as one lead form. The PDF is
 *     split with pdf-lib, the extractor runs per page in parallel (cap
 *     EXTRACTION_CONCURRENCY), and one lead doc is created per
 *     successful extraction. Pages that miss name/phone are reported in
 *     `failed[]` but don't fail the whole upload. Response:
 *
 *       { multi: true, leads: [{leadId, leadCode, name, ...}, ...],
 *         failed: [{page, reason}, ...], sourceFileUrl }
 *
 * The raw PDF is always stored in Firebase Storage first so the agent
 * can re-download even if every page fails extraction.
 *
 * Auth: Bearer ID token.
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

    // ── Persist raw PDF first (provenance even if extraction fails) ──
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
      const [signed] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });
      sourceFileUrl = signed;
    } catch (storageErr) {
      console.error('[leads/upload] Storage write failed:', storageErr);
    }

    // ── Detect page count ──
    let pageCount = 1;
    let parentDoc: PDFDocument | null = null;
    try {
      parentDoc = await PDFDocument.load(pdfBuffer);
      pageCount = parentDoc.getPageCount();
    } catch (loadErr) {
      console.error('[leads/upload] pdf-lib load failed:', loadErr);
      // Fall back to single-page path with the original PDF.
    }

    // ── Single-page path (existing behavior, unchanged response shape) ──
    if (pageCount <= 1 || !parentDoc) {
      const pdfBase64 = pdfBuffer.toString('base64');
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

      if (!extracted.name) {
        return NextResponse.json(
          {
            error: "Could not read the lead's name from this form. Use + Create Lead to enter manually.",
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

      const committed = await commitLead({ db, agentId, sourceFileUrl, sourceFileStoragePath: storagePath, extracted });
      return NextResponse.json({
        leadId: committed.leadId,
        leadCode: committed.leadCode,
        codeKind: committed.codeKind,
        formType: extracted.formType,
        extractionConfidence: extracted.extractionConfidence,
        extractionFlags: extracted.extractionFlags,
        extracted,
        sourceFileUrl,
      });
    }

    // ── Multi-page path: split, extract each page, commit successful ones ──
    const perPageBuffers: Buffer[] = [];
    for (let i = 0; i < pageCount; i++) {
      try {
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(parentDoc, [i]);
        single.addPage(copied);
        const bytes = await single.save();
        perPageBuffers.push(Buffer.from(bytes));
      } catch (splitErr) {
        console.error(`[leads/upload] page ${i + 1} split failed:`, splitErr);
        perPageBuffers.push(Buffer.alloc(0));  // marker — will fail extraction
      }
    }

    const created: Array<{
      leadId: string;
      leadCode: string;
      codeKind: 'derived' | 'fallback';
      name: string;
      phone: string;
      formType: string;
      page: number;
      extractionConfidence: number;
    }> = [];
    const failed: Array<{ page: number; reason: string }> = [];

    // Process pages in chunks to respect concurrency cap. Anthropic
    // vision calls each take 5-15s; with 4 in parallel we cover a
    // 10-page PDF in ~25-40s — comfortably inside our 90s budget below.
    for (let chunkStart = 0; chunkStart < perPageBuffers.length; chunkStart += EXTRACTION_CONCURRENCY) {
      const chunkBuffers = perPageBuffers.slice(chunkStart, chunkStart + EXTRACTION_CONCURRENCY);
      const results = await Promise.allSettled(
        chunkBuffers.map(async (buf) => {
          if (buf.byteLength === 0) throw new Error('split failed');
          return extractLeadFromPdf(buf.toString('base64'));
        }),
      );
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const page = chunkStart + i + 1;
        if (r.status === 'rejected') {
          failed.push({
            page,
            reason: r.reason instanceof Error ? r.reason.message : 'extraction failed',
          });
          continue;
        }
        const ex = r.value;
        if (!ex.name || !ex.phone) {
          failed.push({
            page,
            reason: !ex.name ? 'no name on page' : 'no phone on page',
          });
          continue;
        }
        try {
          const committed = await commitLead({ db, agentId, sourceFileUrl, sourceFileStoragePath: storagePath, extracted: ex });
          created.push({
            leadId: committed.leadId,
            leadCode: committed.leadCode,
            codeKind: committed.codeKind,
            name: ex.name,
            phone: ex.phone,
            formType: ex.formType,
            page,
            extractionConfidence: ex.extractionConfidence,
          });
        } catch (commitErr) {
          console.error(`[leads/upload] commit failed for page ${page}:`, commitErr);
          failed.push({
            page,
            reason: commitErr instanceof Error ? commitErr.message : 'commit failed',
          });
        }
      }
    }

    return NextResponse.json({
      multi: true,
      pageCount,
      leads: created,
      failed,
      sourceFileUrl,
    });
  } catch (error) {
    console.error('leads/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Write a single lead doc + leadCodes index entry. Returns the new
 * leadId, the resolved leadCode, and whether the code was derived from
 * the lead's phone or fell back to a random L-code.
 *
 * Throws on Firestore failure.
 */
async function commitLead(ctx: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  sourceFileUrl: string;
  sourceFileStoragePath: string;
  extracted: ExtractedLeadFields;
}): Promise<{ leadId: string; leadCode: string; codeKind: 'derived' | 'fallback' }> {
  const { db, agentId, sourceFileUrl, sourceFileStoragePath, extracted } = ctx;
  const leadRef = db.collection('agents').doc(agentId).collection('leads').doc();

  // ── Resolve lead code (phone-derived preferred, random L fallback) ──
  let leadCode: string;
  let codeKind: 'derived' | 'fallback';
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
    leadCode = await generateUniqueLeadCode();
    codeKind = 'fallback';
    await db.collection('leadCodes').doc(leadCode).set({
      agentId,
      leadId: leadRef.id,
    });
  }

  // ── Compose lead doc ──
  const leadDoc: Record<string, unknown> = {
    name: extracted.name,
    phone: extracted.phone,
    leadCode,
    codeKind,
    formType: extracted.formType,
    sourceFileUrl,
    // Stored separately from sourceFileUrl so the lead-pdf-archive cron
    // doesn't have to parse the signed URL to find the storage object.
    sourceFileStoragePath,
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
  if (extracted.coborrowerStatus) leadDoc.coborrowerStatus = extracted.coborrowerStatus;
  // Always store phones[] when we have at least one — even single-phone
  // leads benefit from having the structured array for dial tracking.
  if (extracted.phones && extracted.phones.length > 0) {
    leadDoc.phones = extracted.phones;
  } else if (extracted.phone) {
    leadDoc.phones = [{ number: extracted.phone, label: null }];
  }
  if (extracted.mortgageDetails) leadDoc.mortgageDetails = extracted.mortgageDetails;
  if (extracted.spouseName) leadDoc.spouseName = extracted.spouseName;
  if (extracted.spouseAgeYears !== null) leadDoc.spouseAgeYears = extracted.spouseAgeYears;
  if (extracted.beneficiaryName) leadDoc.beneficiaryName = extracted.beneficiaryName;

  await leadRef.set(leadDoc);
  return { leadId: leadRef.id, leadCode, codeKind };
}

// Next.js App Router config — multi-lead can take 30-60s for a 10-page
// PDF (Anthropic vision calls in chunks of 4). 90s gives headroom.
export const runtime = 'nodejs';
export const maxDuration = 90;
