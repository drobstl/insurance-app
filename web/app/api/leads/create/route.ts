import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { deriveLeadCode } from '../../../../lib/lead-code-derive';
import { resolveLeadCodeOrDuplicate } from '../../../../lib/lead-dedup';

/**
 * POST /api/leads/create
 *
 * Phase-1 manual lead creation endpoint. Agent fills in name + phone
 * on the dashboard `/dashboard/leads` page, gets back the lead's own
 * phone number (10 digits) as the login code — agent tells the lead
 * "your code is your phone number" rather than reading a random code.
 *
 * Collision handling: if another lead already exists at the same
 * phone (rare — usually a shared household landline), the endpoint
 * falls back to a random `L…` code from generateUniqueLeadCode and
 * returns a `codeKind: 'fallback'` flag so the dashboard can surface
 * that to the agent. The lead-login screen accepts both formats.
 *
 * The PDF-extractor path (Mail-In / Call-In / Digital) lands in a
 * separate endpoint (`/api/leads/upload`) — Chunk 2 — that resolves to
 * the same lead doc shape and reuses this same code-derivation logic.
 *
 * Auth: Bearer ID token, agent must own the lead they're creating. The
 * `agentId` is taken from the authenticated user (NOT from the request
 * body) so a malicious caller can't create leads under someone else's
 * account.
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

    // ── Body ──
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const dateOfBirth = typeof body?.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
    const formType = typeof body?.formType === 'string' ? body.formType.trim() : 'Manual';

    if (!name) {
      return NextResponse.json({ error: 'Lead name is required' }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: 'Lead phone is required' }, { status: 400 });
    }

    const derived = deriveLeadCode(phone);
    if (!derived) {
      return NextResponse.json(
        { error: 'Phone number must have at least 10 digits' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    // ── Resolve code with shared dedup helper ──
    // Same-agent phone collision → return the existing lead so the
    // dashboard can surface it. Cross-agent collision → random L
    // fallback (existing behavior).
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc();
    const resolution = await resolveLeadCodeOrDuplicate({
      db,
      agentId,
      phone,
      newLeadId: leadRef.id,
    });
    if (resolution.duplicate) {
      return NextResponse.json({
        duplicate: true,
        existingLeadId: resolution.existingLeadId,
        existingLeadCode: resolution.existingLeadCode,
        existingLeadName: resolution.existingLeadName,
      });
    }
    const leadCode = resolution.leadCode;
    const codeKind = resolution.codeKind;

    // DOB is captured when the agent provides it (from the form or
    // from the optional create-modal field) but is no longer required.
    // It's surfaced on the lead-detail page as an autosave field.
    const leadDoc: Record<string, unknown> = {
      name,
      phone,
      // Structured phone list — even manually-created single-phone leads
      // get the array shape so the lead page UI can render uniformly.
      phones: [{ number: phone, label: null }],
      leadCode,
      codeKind,
      formType,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: agentId,
    };
    if (dateOfBirth) leadDoc.dateOfBirth = dateOfBirth;

    await leadRef.set(leadDoc);

    return NextResponse.json({
      leadId: leadRef.id,
      leadCode,
      codeKind,
    });
  } catch (error) {
    console.error('leads/create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
