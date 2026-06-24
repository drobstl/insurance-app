import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import { resolveClientLanguage } from '../../../../lib/client-language';
import { releaseDripForAgent } from '../../../../lib/bulk-import-drip';
import { isFreeTier } from '../../../../lib/tier-gating';
import {
  loadClientCandidates,
  matchProbeAgainst,
  type ClientCandidate,
  type MatchBucket,
} from '../../../../lib/client-dedup';

export const maxDuration = 60;

const BATCH_SIZE = 50;
const MIN_IMPORT_ROW_QUALITY_RATIO = 0.65;

function normalizePolicyType(raw: string): string {
  const lower = (raw || '').trim().toLowerCase();
  const exactMap: Record<string, string> = {
    iul: 'IUL',
    'indexed universal life': 'IUL',
    'universal life': 'IUL',
    term: 'Term Life',
    'term life': 'Term Life',
    'term life express 10 15 20 30': 'Term Life',
    'level term': 'Term Life',
    'return of premium': 'Term Life',
    'return of premium term': 'Term Life',
    'whole life': 'Whole Life',
    whole: 'Whole Life',
    'living promise-graded': 'Whole Life',
    'living promise - level benefit': 'Whole Life',
    'living promise': 'Whole Life',
    'graded benefit': 'Whole Life',
    "children s - whole life": 'Whole Life',
    'childrens whole life': 'Whole Life',
    "children's whole life": 'Whole Life',
    'ordinary life': 'Whole Life',
    'mortgage protection': 'Mortgage Protection',
    mortgage: 'Mortgage Protection',
    'home certainty': 'Mortgage Protection',
    mp: 'Mortgage Protection',
    accidental: 'Accidental',
    'accidental death': 'Accidental',
    'ad&d': 'Accidental',
    'limited accident': 'Accidental',
    'health and accident': 'Accidental',
    'critical illness': 'Other',
    'critical illness 2014 ia- lump sum heart': 'Other',
    'cancer and specified disease': 'Other',
    cancer: 'Other',
    disability: 'Other',
  };

  if (exactMap[lower]) return exactMap[lower];

  if (lower.includes('term life') || lower.includes('term express')) return 'Term Life';
  if (lower.includes('whole life') || lower.includes('living promise') || lower.includes('children')) return 'Whole Life';
  if (lower.includes('iul') || lower.includes('indexed universal')) return 'IUL';
  if (lower.includes('mortgage') || lower.includes('home certainty')) return 'Mortgage Protection';
  if (lower.includes('accidental') || lower.includes('accident') || lower.includes('ad&d') || lower.includes('limited accident')) return 'Accidental';
  if (lower.includes('critical') || lower.includes('cancer') || lower.includes('disability')) return 'Other';

  return raw?.trim() || 'Other';
}

function normalizeStatus(raw: string): 'Active' | 'Pending' | 'Lapsed' {
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'inforce' || lower === 'in force' || lower === 'active' || lower === 'paid up') return 'Active';
  if (lower === 'pending' || lower === 'applied' || lower === 'submitted') return 'Pending';
  if (
    lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' ||
    lower === 'terminated' || lower === 'surrendered' || lower === 'expired'
  ) return 'Lapsed';
  return 'Active';
}

function normalizeImportDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const r = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  const slashMatch = r.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(r);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface ImportRow {
  name: string;
  owner?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyNumber: string;
  carrier: string;
  policyType: string;
  effectiveDate: string;
  premium: string;
  coverageAmount: string;
  status: string;
  premiumFrequency?: string;
}

export interface CreatedClient {
  clientId: string;
  phone: string;
  firstName: string;
  clientCode: string;
  policyCount: number;
}

export interface MergedClient {
  /** Existing client the import folded into. */
  clientId: string;
  name: string;
  /** New policies appended (duplicates already on the client are skipped). */
  policiesAdded: number;
  /** Why we were confident it's the same person, e.g. "name + DOB exact". */
  reason: string;
}

export interface FlaggedClient {
  /** The newly-created client (a possible — not confident — duplicate). */
  clientId: string;
  name: string;
  /** Existing client it might duplicate. */
  suspectedDuplicateClientId: string;
  reason: string;
}

interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

function countPolicySignals(row: ImportRow): number {
  let signals = 0;
  if ((row.policyNumber || '').trim()) signals++;
  if ((row.carrier || '').trim()) signals++;
  if ((row.policyType || '').trim()) signals++;
  if ((row.premium || '').trim()) signals++;
  if ((row.coverageAmount || '').trim()) signals++;
  return signals;
}

function filterHighQualityRows(rows: ImportRow[]): { acceptedRows: ImportRow[]; rejectedCount: number; qualityRatio: number } {
  if (rows.length === 0) {
    return { acceptedRows: [], rejectedCount: 0, qualityRatio: 0 };
  }
  const acceptedRows = rows.filter((row) => {
    const hasName = (row.name || '').trim().length > 0;
    return hasName && countPolicySignals(row) >= 2;
  });
  const rejectedCount = rows.length - acceptedRows.length;
  const qualityRatio = acceptedRows.length / rows.length;
  return { acceptedRows, rejectedCount, qualityRatio };
}

function validateRow(row: ImportRow, index: number): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (/^\d+$/.test(row.name.trim())) {
    warnings.push({ row: index, field: 'name', message: `Name looks like a number: "${row.name}"` });
  }

  if (row.dateOfBirth?.trim()) {
    const parsed = normalizeImportDate(row.dateOfBirth.trim());
    if (!parsed) {
      warnings.push({ row: index, field: 'dateOfBirth', message: `Could not parse date of birth: "${row.dateOfBirth}"` });
    }
  }

  if (row.effectiveDate?.trim()) {
    const parsed = normalizeImportDate(row.effectiveDate.trim());
    if (!parsed) {
      warnings.push({ row: index, field: 'effectiveDate', message: `Could not parse effective date: "${row.effectiveDate}"` });
    }
  }

  if (row.premium?.trim()) {
    const num = parseFloat(row.premium.replace(/[,$]/g, ''));
    if (isNaN(num)) {
      warnings.push({ row: index, field: 'premium', message: `Premium is not a number: "${row.premium}"` });
    } else if (num > 10000) {
      warnings.push({ row: index, field: 'premium', message: `Premium seems high ($${num}/mo). Verify this is monthly, not annual.` });
    }
  }

  if (row.coverageAmount?.trim()) {
    const num = parseFloat(row.coverageAmount.replace(/[,$]/g, ''));
    if (isNaN(num)) {
      warnings.push({ row: index, field: 'coverageAmount', message: `Coverage amount is not a number: "${row.coverageAmount}"` });
    }
  }

  if (row.phone?.trim()) {
    try {
      const normalized = normalizePhone(row.phone.trim());
      if (!isValidE164(normalized)) {
        warnings.push({ row: index, field: 'phone', message: `Phone may be invalid: "${row.phone}"` });
      }
    } catch {
      warnings.push({ row: index, field: 'phone', message: `Phone may be invalid: "${row.phone}"` });
    }
  }

  if (row.policyNumber?.trim() && /^\d{3}-\d{2}-\d{4}$/.test(row.policyNumber.trim())) {
    warnings.push({ row: index, field: 'policyNumber', message: 'Policy number looks like an SSN — skipping.' });
  }

  return warnings;
}

function dedupKey(name: string, dob: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ' ').trim()}|${(dob || '').trim()}`;
}

function dedupKeyFallback(name: string, phone: string, email: string): string {
  const norm = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (phone?.trim()) return `${norm}|phone:${phone.trim()}`;
  if (email?.trim()) return `${norm}|email:${email.trim().toLowerCase()}`;
  return `${norm}|solo`;
}

interface ClientGroup {
  primaryRow: ImportRow;
  allRows: ImportRow[];
}

function groupRowsByClient(rows: ImportRow[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();

  for (const row of rows) {
    const name = (row.name || '').trim();
    if (!name) continue;

    const key = row.dateOfBirth?.trim()
      ? dedupKey(name, row.dateOfBirth)
      : dedupKeyFallback(name, row.phone, row.email);

    const existing = groups.get(key);
    if (existing) {
      existing.allRows.push(row);
      if (!existing.primaryRow.email && row.email) existing.primaryRow.email = row.email;
      if (!existing.primaryRow.phone && row.phone) existing.primaryRow.phone = row.phone;
      if (!existing.primaryRow.dateOfBirth && row.dateOfBirth) existing.primaryRow.dateOfBirth = row.dateOfBirth;
    } else {
      groups.set(key, { primaryRow: { ...row }, allRows: [row] });
    }
  }

  return Array.from(groups.values());
}

/**
 * Buckets we treat as "confident enough to merge without a human." Both
 * require an identifier (DOB / phone / email) to corroborate the name, so
 * two different people who happen to share a name never auto-merge — they
 * fall to `strong`/`fuzzy-name-only`/`weak`, which we flag for review
 * instead. Mirrors the auto-merge bar in scripts/run-import-merge.ts.
 */
const CONFIDENT_MERGE_BUCKETS: ReadonlySet<MatchBucket> = new Set<MatchBucket>([
  'exact',
  'fuzzy-corroborated',
]);

/**
 * Build a policy document payload from an import row, or null if the row
 * carries no usable policy (no policy signals, or a policy number that
 * looks like an SSN). Pulled out of the handler so the create path and
 * the merge-into-existing path share identical policy parsing.
 */
function buildPolicyPayload(row: ImportRow, clientName: string): Record<string, unknown> | null {
  const hasPolicy =
    (row.policyNumber || '').trim() ||
    (row.carrier || '').trim() ||
    (row.policyType || '').trim() ||
    (row.premium || '').trim() ||
    (row.coverageAmount || '').trim();
  if (!hasPolicy) return null;
  if (row.policyNumber?.trim() && /^\d{3}-\d{2}-\d{4}$/.test(row.policyNumber.trim())) {
    return null;
  }

  const premiumNum = parseFloat((row.premium || '0').replace(/[,$]/g, ''));
  const coverageNum = parseFloat((row.coverageAmount || '0').replace(/[,$]/g, ''));
  let effDate: string | null = null;
  if ((row.effectiveDate || '').trim()) {
    effDate = normalizeImportDate(row.effectiveDate.trim());
  }

  const ownerName = (row.owner || '').trim();
  const policyOwner = ownerName && ownerName.toLowerCase() !== clientName.toLowerCase()
    ? ownerName
    : clientName;

  return {
    policyType: normalizePolicyType(row.policyType || ''),
    policyNumber: (row.policyNumber || '').trim(),
    insuranceCompany: (row.carrier || '').trim(),
    policyOwner,
    beneficiaries: [],
    coverageAmount: isNaN(coverageNum) ? 0 : coverageNum,
    premiumAmount: isNaN(premiumNum) ? 0 : premiumNum,
    premiumFrequency: row.premiumFrequency || 'monthly',
    renewalDate: '',
    effectiveDate: effDate,
    status: normalizeStatus(row.status || ''),
  };
}

/**
 * Stable identity key for a policy so a re-import doesn't append a second
 * copy of one already on the client. Policy number is authoritative when
 * present; otherwise fall back to carrier + type + effective date +
 * coverage.
 */
function policyDedupKey(p: Record<string, unknown>): string {
  const num = String(p.policyNumber ?? '').trim().toLowerCase();
  if (num) return `num:${num}`;
  return [
    'meta',
    String(p.insuranceCompany ?? '').toLowerCase().trim(),
    String(p.policyType ?? '').toLowerCase().trim(),
    String(p.effectiveDate ?? ''),
    String(p.coverageAmount ?? ''),
  ].join('|');
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required and must not be empty' }, { status: 400 });
    }
    if (rows.length > BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${BATCH_SIZE} rows per batch` },
        { status: 400 }
      );
    }

    const quality = filterHighQualityRows(rows);
    if (quality.acceptedRows.length === 0 || quality.qualityRatio < MIN_IMPORT_ROW_QUALITY_RATIO) {
      return NextResponse.json(
        {
          error: `Import quality too low (${Math.round(quality.qualityRatio * 100)}% usable rows). Please review and retry.`,
        },
        { status: 400 },
      );
    }

    const allWarnings: ValidationWarning[] = [];
    quality.acceptedRows.forEach((row, i) => {
      allWarnings.push(...validateRow(row, i));
    });
    if (quality.rejectedCount > 0) {
      allWarnings.push({
        row: 0,
        field: 'quality',
        message: `${quality.rejectedCount} low-confidence row${quality.rejectedCount !== 1 ? 's' : ''} skipped.`,
      });
    }

    const clientGroups = groupRowsByClient(quality.acceptedRows);
    const db = getAdminFirestore();

    // Load the agent's existing book ONCE so we can catch duplicates
    // against clients already on file. The importer previously only
    // de-duped rows within this 50-row chunk and blindly created a new
    // client for every group — so re-imports and already-present clients
    // produced duplicates. Batches are sent sequentially by the client,
    // so this reload also sees clients written by earlier batches in the
    // same upload. We mutate this list in-memory as we go (push new
    // clients, patch gap-filled fields) so later groups in this batch
    // match against them too.
    const existing: ClientCandidate[] = await loadClientCandidates(db, uid);
    const existingById = new Map<string, ClientCandidate>(existing.map((c) => [c.id, c]));

    const created: CreatedClient[] = [];
    const merged: MergedClient[] = [];
    const flaggedForReview: FlaggedClient[] = [];
    let totalPolicies = 0;
    let totalPoliciesMerged = 0;

    for (const group of clientGroups) {
      const { primaryRow, allRows } = group;
      const name = (primaryRow.name || '').trim();
      if (!name) continue;

      const rowEmail = (primaryRow.email || '').trim();
      const rowPhone = (primaryRow.phone || '').trim();
      const rowDob = (primaryRow.dateOfBirth || '').trim();

      // Is this person already in the book? Match against existing
      // clients (and clients created earlier in this same upload).
      const match = matchProbeAgainst(existing, {
        name,
        dateOfBirth: rowDob || null,
        phone: rowPhone || null,
        email: rowEmail || null,
      });

      // ─── Confident duplicate → merge into the existing client ───
      // Identifier-corroborated match: don't create a second client.
      // Append only genuinely-new policies and gap-fill blank contact
      // fields on the record we already have.
      if (match && CONFIDENT_MERGE_BUCKETS.has(match.match.bucket)) {
        const targetId = match.clientId;
        const targetRef = db.collection('agents').doc(uid).collection('clients').doc(targetId);

        // Key the policies already on the target so a re-import doesn't
        // append second copies.
        const existingPolicyKeys = new Set<string>();
        try {
          const polSnap = await targetRef.collection('policies').get();
          for (const d of polSnap.docs) existingPolicyKeys.add(policyDedupKey(d.data()));
        } catch (polErr) {
          console.error('Import-batch read existing policies failed (non-blocking):', polErr);
        }

        let policiesAdded = 0;
        for (const row of allRows) {
          const policyPayload = buildPolicyPayload(row, name);
          if (!policyPayload) continue;
          const key = policyDedupKey(policyPayload);
          if (existingPolicyKeys.has(key)) continue;
          existingPolicyKeys.add(key);
          await targetRef
            .collection('policies')
            .add({ ...policyPayload, createdAt: FieldValue.serverTimestamp() });
          policiesAdded++;
          totalPoliciesMerged++;
        }

        // Gap-fill ONLY blank contact fields — never overwrite a curated
        // value. Mirrors the lead importer's gapFillExisting (PR #190).
        const target = existingById.get(targetId);
        const gapUpdate: Record<string, unknown> = {};
        if (rowEmail && !(target?.email || '').trim()) gapUpdate.email = rowEmail;
        if (rowPhone && !(target?.phone || '').trim()) gapUpdate.phone = rowPhone;
        if (rowDob && !(target?.dateOfBirth || '').trim()) gapUpdate.dateOfBirth = rowDob;
        if (Object.keys(gapUpdate).length > 0) {
          try {
            await targetRef.update(gapUpdate);
            await db.doc(`clients/${targetId}`).set(gapUpdate, { merge: true });
          } catch (gapErr) {
            console.error('Import-batch gap-fill failed (non-blocking):', gapErr);
          }
          // Keep the in-memory candidate current so later groups in this
          // batch match against the now-filled identifiers.
          if (target) {
            if (typeof gapUpdate.email === 'string') target.email = gapUpdate.email;
            if (typeof gapUpdate.phone === 'string') target.phone = gapUpdate.phone;
            if (typeof gapUpdate.dateOfBirth === 'string') target.dateOfBirth = gapUpdate.dateOfBirth;
          }
        }

        merged.push({ clientId: targetId, name, policiesAdded, reason: match.match.reason });
        continue;
      }

      // ─── New client (possibly an uncertain duplicate we'll flag) ───
      // Name-only / fuzzy-name-only / weak: could be two different people
      // with the same name, so create the client but flag it for the
      // existing import-review screen rather than silently merging.
      const suspectedDuplicate =
        match && !CONFIDENT_MERGE_BUCKETS.has(match.match.bucket) ? match : null;

      // Pre-compute the max effective date across this client's
      // policies so the drip-release query can orderBy it without
      // touching the policies subcollection. Stored as YYYY-MM-DD
      // (lex-sortable). Empty string for clients with no parseable
      // effective date — they still match the orderBy query and sort
      // last in DESC order.
      let latestEffectiveDate = '';
      for (const row of allRows) {
        const raw = (row.effectiveDate || '').trim();
        if (!raw) continue;
        const parsed = normalizeImportDate(raw);
        if (parsed && parsed > latestEffectiveDate) {
          latestEffectiveDate = parsed;
        }
      }

      const code = generateClientCode();
      const clientPayload: Record<string, unknown> = {
        name,
        email: rowEmail,
        phone: rowPhone,
        clientCode: code,
        agentId: uid,
        createdAt: FieldValue.serverTimestamp(),
        preferredLanguage: resolveClientLanguage('en'),
        // Mode 2 (bulk import) flag — May 9, 2026. Marks the client
        // as awaiting daily drip release rather than immediate
        // welcome queue. The `bulk-import-drip-release` cron picks
        // up to 15 of these per agent per day, queues a Mode 2
        // welcome action item, and clears the flag.
        bulkImportPendingDrip: true,
        bulkImportSource: 'csv',
        bulkImportLatestPolicyEffectiveDate: latestEffectiveDate,
      };
      if (rowDob) {
        clientPayload.dateOfBirth = rowDob;
      }
      if (suspectedDuplicate) {
        // Surface on the existing import-review worklist
        // (/api/clients/needs-review filters needsImportReview == true).
        clientPayload.needsImportReview = true;
        clientPayload.suspectedDuplicateClientId = suspectedDuplicate.clientId;
        clientPayload.suspectedDuplicateReason = suspectedDuplicate.match.reason;
      }

      const clientRef = await db
        .collection('agents')
        .doc(uid)
        .collection('clients')
        .add(clientPayload);

      try {
        await db.doc(`clients/${clientRef.id}`).set(clientPayload);
        await db.doc(`clientCodes/${code}`).set({ agentId: uid, clientId: clientRef.id });
      } catch (mirrorErr) {
        console.error('Import-batch mirror failed (non-blocking):', mirrorErr);
      }

      // Make the just-created client visible to later groups in this same
      // batch so a split/fuzzy within-batch duplicate folds in too.
      const newCandidate: ClientCandidate = {
        id: clientRef.id,
        name,
        dateOfBirth: rowDob || null,
        phone: rowPhone || null,
        email: rowEmail || null,
        notDuplicateOf: [],
      };
      existing.push(newCandidate);
      existingById.set(clientRef.id, newCandidate);

      if (rowPhone) {
        try {
          const normalized = normalizePhone(rowPhone);
          if (isValidE164(normalized)) {
            const refSnap = await db
              .collection('agents')
              .doc(uid)
              .collection('referrals')
              .where('referralPhone', '==', normalized)
              .limit(1)
              .get();
            if (!refSnap.empty) {
              await clientRef.update({ sourceReferralId: refSnap.docs[0].id });
            }
          }
        } catch (matchErr) {
          console.error('Referral match failed (non-blocking):', matchErr);
        }
      }

      let policyCount = 0;
      for (const row of allRows) {
        const policyPayload = buildPolicyPayload(row, name);
        if (!policyPayload) continue;
        await db
          .collection('agents')
          .doc(uid)
          .collection('clients')
          .doc(clientRef.id)
          .collection('policies')
          .add({ ...policyPayload, createdAt: FieldValue.serverTimestamp() });

        policyCount++;
        totalPolicies++;
      }

      const firstName = name.split(' ')[0] || name;
      created.push({
        clientId: clientRef.id,
        phone: rowPhone,
        firstName,
        clientCode: code,
        policyCount,
      });
      if (suspectedDuplicate) {
        flaggedForReview.push({
          clientId: clientRef.id,
          name,
          suspectedDuplicateClientId: suspectedDuplicate.clientId,
          reason: suspectedDuplicate.match.reason,
        });
      }
    }

    // Immediately release the first batch (capped at 15/UTC-day) into
    // the agent's welcome action item queue so they see welcomes
    // appear without waiting for the next daily cron. Wrapped in a
    // try/catch — if drip release fails for any reason, the import
    // itself still succeeded; the daily cron at 1 PM UTC will pick up
    // whatever remains.
    let dripReleased = 0;
    let dripPendingAfter = 0;
    let dripSameDayCapReached = false;
    try {
      // Free tier is engine-paused: the import above still persists the
      // agent's clients/policies, but skip the immediate drip release so
      // no client-facing outreach is queued. Mirrors the cron guards;
      // the daily bulk-import-drip-release cron also skips Free agents.
      const agentSnap = await db.collection('agents').doc(uid).get();
      if (!isFreeTier(agentSnap.data()?.membershipTier as string | undefined)) {
        const dripOutcome = await releaseDripForAgent({
          db,
          agentId: uid,
        });
        dripReleased = dripOutcome.released;
        dripPendingAfter = dripOutcome.pendingAfter;
        dripSameDayCapReached = dripOutcome.sameDayCapReached;
      }
    } catch (err) {
      console.error('[import-batch] immediate drip release failed (non-blocking)', {
        agentId: uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({
      created,
      totalPolicies,
      merged,
      flaggedForReview,
      totalPoliciesMerged,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      drip: {
        releasedNow: dripReleased,
        pendingForFutureDays: dripPendingAfter,
        sameDayCapReached: dripSameDayCapReached,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Import-batch error:', msg);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
