import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { resolveLeadCodeOrDuplicate } from '../../../../lib/lead-dedup';

/**
 * POST /api/leads/import-batch
 *
 * Bulk lead creation from a CSV/Excel list. The file is parsed in the
 * browser (`lib/lead-csv-parse.ts`) into rows; this endpoint writes one
 * lead doc per row, reusing the same code-derivation + dedup logic as the
 * manual (`/api/leads/create`) and PDF (`/api/leads/upload`) paths.
 *
 * Unlike the Clients bulk import, leads have no policies and do NOT go on
 * a welcome drip — they land straight in the agent's dialing queue.
 *
 * Rows without a usable phone still import: `resolveLeadCodeOrDuplicate`
 * falls back to a random `L…` code (the lead shows in the queue but can't
 * log into the app until a phone is added). Same-agent phone collisions
 * are reported as `duplicates` rather than creating a second doc.
 *
 * The client chunks large files into batches of <= BATCH_SIZE and merges
 * the per-batch results. `row` numbers are 1-based within the batch; the
 * client offsets them to the file-global row when displaying.
 *
 * Auth: Bearer ID token. `agentId` comes from the token, never the body.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 50;

interface LeadImportRow {
  name?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  address?: { street?: string; city?: string; state?: string; zip?: string };
}

interface CreatedLead {
  leadId: string;
  leadCode: string;
  codeKind: 'derived' | 'fallback';
  name: string;
  row: number;
}

interface DuplicateLead {
  row: number;
  phone: string;
  name: string;
  existingLeadId: string;
  existingLeadCode: string;
  existingLeadName?: string;
}

interface FailedRow {
  row: number;
  reason: string;
}

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
    const rows: LeadImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required and must not be empty' }, { status: 400 });
    }
    if (rows.length > BATCH_SIZE) {
      return NextResponse.json({ error: `Maximum ${BATCH_SIZE} rows per batch` }, { status: 400 });
    }

    const db = getAdminFirestore();
    const created: CreatedLead[] = [];
    const duplicates: DuplicateLead[] = [];
    const failed: FailedRow[] = [];

    // Sequential so within-file duplicate phones are caught by the
    // leadCodes index doc the first occurrence writes.
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i] || {};
      const name = (row.name || '').trim();
      if (!name) {
        failed.push({ row: rowNum, reason: 'no name in row' });
        continue;
      }
      const phone = (row.phone || '').trim();

      try {
        const leadRef = db.collection('agents').doc(agentId).collection('leads').doc();
        const resolution = await resolveLeadCodeOrDuplicate({
          db,
          agentId,
          phone,
          newLeadId: leadRef.id,
        });
        if (resolution.duplicate) {
          duplicates.push({
            row: rowNum,
            phone,
            name,
            existingLeadId: resolution.existingLeadId,
            existingLeadCode: resolution.existingLeadCode,
            existingLeadName: resolution.existingLeadName,
          });
          continue;
        }

        const leadDoc: Record<string, unknown> = {
          name,
          phone,
          leadCode: resolution.leadCode,
          codeKind: resolution.codeKind,
          formType: 'CSV Import',
          createdAt: FieldValue.serverTimestamp(),
          createdBy: agentId,
        };
        if (phone) {
          leadDoc.phones = [{ number: phone, label: null }];
        }
        const email = (row.email || '').trim();
        if (email) leadDoc.email = email;
        const dob = (row.dateOfBirth || '').trim();
        if (dob) leadDoc.dateOfBirth = dob;

        const addr = row.address || {};
        const address: Record<string, string> = {};
        if ((addr.street || '').trim()) address.street = (addr.street as string).trim();
        if ((addr.city || '').trim()) address.city = (addr.city as string).trim();
        if ((addr.state || '').trim()) address.state = (addr.state as string).trim();
        if ((addr.zip || '').trim()) address.zip = (addr.zip as string).trim();
        if (Object.keys(address).length > 0) leadDoc.address = address;

        await leadRef.set(leadDoc);
        created.push({
          leadId: leadRef.id,
          leadCode: resolution.leadCode,
          codeKind: resolution.codeKind,
          name,
          row: rowNum,
        });
      } catch (err) {
        console.error(`[leads/import-batch] row ${rowNum} failed:`, err);
        failed.push({ row: rowNum, reason: err instanceof Error ? err.message : 'write failed' });
      }
    }

    return NextResponse.json({ created, duplicates, failed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('leads/import-batch error:', msg);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
