import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { resolveLeadCodeOrDuplicate } from '../../../../lib/lead-dedup';
import { deriveLeadCode } from '../../../../lib/lead-code-derive';
import { loadLeadPhoneIndex } from '../../../../lib/lead-phone-index';

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
 * are reported as `duplicates` rather than creating a second doc — matched
 * by phone against the agent's existing leads (see `loadLeadPhoneIndex`),
 * so re-importing a list also dedups leads stored under a fallback code,
 * which the global `leadCodes` index alone would miss.
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

interface UpdatedLead {
  row: number;
  name: string;
  existingLeadId: string;
  existingLeadName?: string;
  changed: boolean; // true if a blank field was filled, false if already complete
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
    // Opt-in "refresh" mode: a same-agent phone match updates the existing
    // lead IN PLACE (gap-fill, keeping its id) instead of being skipped as a
    // duplicate — so re-importing a vendor list never needs delete+recreate
    // (which orphans appointments + wipes dial history). Default off keeps
    // the existing skip-duplicates behavior.
    const updateExisting = body?.updateExisting === true;

    const db = getAdminFirestore();
    const created: CreatedLead[] = [];
    const duplicates: DuplicateLead[] = [];
    const updated: UpdatedLead[] = [];
    const failed: FailedRow[] = [];

    // Update-in-place: gap-fill an existing lead's empty contact fields from
    // the row, KEEPING its doc id so its appointments + dial history stay
    // attached. Never overwrites a value the agent already curated, and never
    // touches name or phone (the match key). Returns true if a field changed.
    const gapFillExisting = async (existingLeadId: string, row: LeadImportRow): Promise<boolean> => {
      const ref = db.collection('agents').doc(agentId).collection('leads').doc(existingLeadId);
      const snap = await ref.get();
      if (!snap.exists) return false;
      const cur = snap.data() || {};
      const update: Record<string, unknown> = {};
      const email = (row.email || '').trim();
      if (email && !cur.email) update.email = email;
      const dob = (row.dateOfBirth || '').trim();
      if (dob && !cur.dateOfBirth) update.dateOfBirth = dob;
      const addr: NonNullable<LeadImportRow['address']> = row.address || {};
      const curAddr = (cur.address && typeof cur.address === 'object' ? cur.address : {}) as Record<string, string>;
      const nextAddr: Record<string, string> = { ...curAddr };
      let addrChanged = false;
      for (const k of ['street', 'city', 'state', 'zip'] as const) {
        const v = (addr[k] || '').trim();
        if (v && !curAddr[k]) { nextAddr[k] = v; addrChanged = true; }
      }
      if (addrChanged) update.address = nextAddr;
      if (Object.keys(update).length === 0) return false;
      await ref.update(update);
      return true;
    };

    // Phone-keyed map of the agent's EXISTING leads. The shared
    // `resolveLeadCodeOrDuplicate` dedup keys off the global
    // `leadCodes/{derived}` index, which has no doc for leads stored
    // under a random `L…` fallback code — so re-importing a list whose
    // leads fell back (no phone at first import, a cross-agent code
    // collision, or the old DOB-based scheme) would miss them and create
    // duplicates. This index keys off each lead's actual phone, catching
    // fallback-coded leads too. One read per batch (bulk import is rare).
    const phoneIndex = await loadLeadPhoneIndex(db, agentId);

    // Sequential so within-file duplicate phones are caught by the first
    // occurrence — both via the leadCodes index doc it writes and via
    // phoneIndex, which we seed below as each lead is created.
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
        // Match against the agent's existing leads by phone FIRST — this
        // catches fallback-coded leads the leadCodes index can't see.
        const derived = deriveLeadCode(phone);
        if (derived) {
          const existing = phoneIndex.get(derived);
          if (existing) {
            if (updateExisting) {
              const changed = await gapFillExisting(existing.leadId, row);
              updated.push({ row: rowNum, name, existingLeadId: existing.leadId, existingLeadName: existing.name, changed });
            } else {
              duplicates.push({
                row: rowNum,
                phone,
                name,
                existingLeadId: existing.leadId,
                existingLeadCode: existing.leadCode,
                existingLeadName: existing.name,
              });
            }
            continue;
          }
        }

        const leadRef = db.collection('agents').doc(agentId).collection('leads').doc();
        const resolution = await resolveLeadCodeOrDuplicate({
          db,
          agentId,
          phone,
          newLeadId: leadRef.id,
        });
        if (resolution.duplicate) {
          if (updateExisting) {
            const changed = await gapFillExisting(resolution.existingLeadId, row);
            updated.push({ row: rowNum, name, existingLeadId: resolution.existingLeadId, existingLeadName: resolution.existingLeadName, changed });
          } else {
            duplicates.push({
              row: rowNum,
              phone,
              name,
              existingLeadId: resolution.existingLeadId,
              existingLeadCode: resolution.existingLeadCode,
              existingLeadName: resolution.existingLeadName,
            });
          }
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
        // Seed the index so a later row in THIS batch with the same phone
        // dedups against the lead we just created (catches fallback-coded
        // within-batch dupes the leadCodes index would miss).
        if (derived) {
          phoneIndex.set(derived, { leadId: leadRef.id, leadCode: resolution.leadCode, name });
        }
      } catch (err) {
        console.error(`[leads/import-batch] row ${rowNum} failed:`, err);
        failed.push({ row: rowNum, reason: err instanceof Error ? err.message : 'write failed' });
      }
    }

    return NextResponse.json({ created, updated, duplicates, failed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('leads/import-batch error:', msg);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
