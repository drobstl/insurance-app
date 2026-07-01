import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { resolveLeadCodeOrDuplicate } from '../../../../lib/lead-dedup';
import { deriveLeadCode } from '../../../../lib/lead-code-derive';
import { loadLeadPhoneIndex } from '../../../../lib/lead-phone-index';
import { ageFromDob } from '../../../../lib/household';

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
 * log into the app until a phone is added). A same-agent phone collision is
 * matched by phone against the agent's existing leads (see
 * `loadLeadPhoneIndex`, which also catches leads stored under a fallback
 * code that the global `leadCodes` index alone would miss). When the names
 * line up it's treated as a re-import of the same person: the existing lead
 * is gap-filled IN PLACE, keeping its id so its appointments + dial history
 * stay attached (no delete+recreate). When the names differ — a different
 * person sharing a household phone — it's reported as a `duplicate` and
 * skipped, so one person's details never bleed onto another. This is
 * automatic; there is no opt-in flag.
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
  ageYears?: number | null;
  address?: { street?: string; city?: string; state?: string; zip?: string };
  gender?: 'M' | 'F' | '';
  heightText?: string;
  weightLbs?: number | null;
  smokerStatus?: 'Y' | 'N' | '';
  coborrowerStatus?: 'Y' | 'N' | '';
  mortgageBalance?: number | null;
  mortgageLender?: string;
  spouseName?: string;
  spouseAgeYears?: number | null;
  beneficiaryName?: string;
}

/**
 * Compose the rich, PDF-parity fields onto a lead update/create payload from
 * an import row, writing each only when present. `mode: 'create'` sets every
 * value we have; `mode: 'gapfill'` fills only blanks (never clobbers an agent-
 * curated value on `cur`). Field names + shapes mirror the PDF upload path
 * (`/api/leads/upload`) so a CSV lead and a scanned-form lead look identical.
 * Returns true if it wrote anything (gap-fill uses this to report a change).
 */
function applyRichFields(
  target: Record<string, unknown>,
  row: LeadImportRow,
  opts: { mode: 'create' | 'gapfill'; cur?: Record<string, unknown> },
): boolean {
  const cur = opts.cur || {};
  const blank = (k: string) => cur[k] === undefined || cur[k] === null || cur[k] === '';
  let wrote = false;
  const set = (k: string, v: unknown) => { target[k] = v; wrote = true; };

  // Age: an explicit age column wins; otherwise derive from DOB so age-based
  // sorts, the 80+ lead-credit flag, and quoting all work on CSV leads too.
  const dob = (row.dateOfBirth || '').trim();
  const age = typeof row.ageYears === 'number' && row.ageYears > 0
    ? row.ageYears
    : ageFromDob(dob || undefined) ?? null;
  if (age !== null && (opts.mode === 'create' || blank('ageYears'))) set('ageYears', age);

  if (row.gender && (opts.mode === 'create' || blank('gender'))) set('gender', row.gender);
  const height = (row.heightText || '').trim();
  if (height && (opts.mode === 'create' || blank('heightText'))) set('heightText', height);
  if (typeof row.weightLbs === 'number' && row.weightLbs > 0 && (opts.mode === 'create' || blank('weightLbs'))) {
    set('weightLbs', row.weightLbs);
  }
  if ((row.smokerStatus === 'Y' || row.smokerStatus === 'N') && (opts.mode === 'create' || blank('smokerStatus'))) {
    set('smokerStatus', row.smokerStatus);
  }
  if ((row.coborrowerStatus === 'Y' || row.coborrowerStatus === 'N') && (opts.mode === 'create' || blank('coborrowerStatus'))) {
    set('coborrowerStatus', row.coborrowerStatus);
  }

  // Mortgage balance + lender share one object, matching the PDF path's
  // `mortgageDetails`. Merge onto any existing object so gap-fill can add a
  // lender to a balance-only record without dropping the balance.
  const balance = typeof row.mortgageBalance === 'number' && row.mortgageBalance > 0 ? row.mortgageBalance : null;
  const lender = (row.mortgageLender || '').trim();
  if (balance !== null || lender) {
    const curMort = (cur.mortgageDetails && typeof cur.mortgageDetails === 'object'
      ? cur.mortgageDetails
      : {}) as Record<string, unknown>;
    const nextMort: Record<string, unknown> = opts.mode === 'create' ? {} : { ...curMort };
    if (balance !== null && (opts.mode === 'create' || curMort.balance === undefined || curMort.balance === null)) {
      nextMort.balance = balance;
    }
    if (lender && (opts.mode === 'create' || !curMort.lender)) {
      nextMort.lender = lender;
    }
    if (Object.keys(nextMort).length > 0) set('mortgageDetails', nextMort);
  }

  const spouseName = (row.spouseName || '').trim();
  if (spouseName && (opts.mode === 'create' || blank('spouseName'))) set('spouseName', spouseName);
  if (typeof row.spouseAgeYears === 'number' && row.spouseAgeYears > 0 && (opts.mode === 'create' || blank('spouseAgeYears'))) {
    set('spouseAgeYears', row.spouseAgeYears);
  }
  const beneficiary = (row.beneficiaryName || '').trim();
  if (beneficiary && (opts.mode === 'create' || blank('beneficiaryName'))) set('beneficiaryName', beneficiary);

  return wrote;
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

/**
 * Same-person check for a re-import refresh: do these two names refer to the
 * same lead? A phone match alone isn't enough — we keep one lead per phone,
 * and spouses on a shared household line are common in this book, so a phone
 * collision is only safe to gap-fill when the names also line up. Mismatches
 * fall back to the skip-as-duplicate path, so one person's details never
 * bleed onto another's record.
 *
 * Lenient on formatting, strict on identity: compares the set of alphabetic
 * name tokens, lower-cased and punctuation-stripped, order-independent (so
 * "Jane Smith" matches "Smith, Jane"). The smaller token set must be fully
 * contained in the larger — equal sets match, and an added/dropped middle
 * initial or suffix still matches — but a different first name (Jane vs John
 * Smith) never does, and a lone surname never absorbs a full-name lead. When
 * in doubt it returns false, preferring the safe skip.
 */
function namesMatchForRefresh(a: string, b: string): boolean {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false; // small ⊆ large
  // Containment is enough once ≥2 tokens line up (tolerates a middle initial
  // or suffix). Single-token names must match exactly, so a bare surname
  // can't refresh a full-name lead.
  return small.size >= 2 || large.size === 1;
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
      // Gap-fill the rich PDF-parity fields too (mortgage, tobacco, spouse, …)
      // so a re-import that adds columns backfills an existing lead.
      applyRichFields(update, row, { mode: 'gapfill', cur });
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
            // Same person on this phone → refresh in place (keeps the id, so
            // appointments + dial history survive). Different person sharing
            // the line → skip as a duplicate, exactly as before.
            if (namesMatchForRefresh(name, existing.name || '')) {
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
          // Same as the phone-index branch above: refresh only when the names
          // confirm it's the same person; otherwise skip as a duplicate. A
          // missing existing name fails the check, so we skip rather than risk
          // gap-filling a stranger.
          if (namesMatchForRefresh(name, resolution.existingLeadName || '')) {
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

        // Rich, PDF-parity fields (age, mortgage, tobacco, co-borrower,
        // spouse, beneficiary, gender/height/weight) when the list carried them.
        applyRichFields(leadDoc, row, { mode: 'create' });

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
