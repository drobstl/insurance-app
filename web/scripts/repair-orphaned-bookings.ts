#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Repair orphaned bookings — WRITES (dry-run by default; pass --apply).
 *
 * Context: a destructive lead re-import (delete + recreate) mints new lead
 * doc ids, stranding appointments that referenced the old (deleted) id and
 * wiping the lead's dial history. This reattaches each orphaned appointment
 * to the surviving lead (same phone, same name) and restores the 'booked'
 * contact dial the booking flow normally logs — recovering data the rebuild
 * destroyed, so the Activity book rate reads truthfully again.
 *
 * Safety:
 *   - Dry-run unless --apply. Prints the exact plan.
 *   - A survivor is accepted ONLY if exactly one current lead shares the
 *     orphan's phone code AND name (case-insensitive). Ambiguous/none → skip.
 *   - Idempotent: the restored dial is tagged [appt:<id>] and skipped if
 *     already present; repointing only runs while the appt is still orphaned.
 *   - Audit: stamps appointment.repointedFromLeadId + repointedAt; the dial
 *     note records the rebuild. Reversible.
 *
 * Run from web/:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/repair-orphaned-bookings.ts --uid=1sRAF3Kq6shiNtabbPOCRO2VFC93 [--apply]
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';
import { deriveLeadCode } from '../lib/lead-code-derive';

for (const envFile of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

let uid = '1sRAF3Kq6shiNtabbPOCRO2VFC93';
let apply = false;
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--uid=')) uid = a.slice('--uid='.length);
  else if (a === '--apply') apply = true;
}
const norm = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const TRANSIENT = new Set(['no_answer', 'left_vm']);
// Month window (matches the Activity "This month" view the rate is read in).
const WIN_FROM = Date.UTC(2026, 5, 1);
const WIN_TO = Date.now();
const tsMillis = (t: any): number | null =>
  t && typeof t === 'object'
    ? (typeof t.toMillis === 'function' ? t.toMillis() : (typeof t._seconds === 'number' ? t._seconds * 1000 : null))
    : null;
/** True if this lead already has a contact (non-transient) dial in-window —
 *  i.e. it's already counted in `contacts`, so don't stack another. */
const hasInWindowContact = (dialLog: any[]): boolean =>
  dialLog.some((e) => {
    const ms = tsMillis(e?.at);
    return ms !== null && ms >= WIN_FROM && ms < WIN_TO && !TRANSIENT.has(e?.outcome);
  });

async function main() {
  const db = getAdminFirestore();
  const agentRef = db.collection('agents').doc(uid);
  const [leadsSnap, apptsSnap] = await Promise.all([
    agentRef.collection('leads').get(),
    agentRef.collection('appointments').get(),
  ]);

  const leadIds = new Set(leadsSnap.docs.map((d) => d.id));
  // phone code -> [{id,name}] so we can detect ambiguity.
  const byCode = new Map<string, Array<{ id: string; name: string }>>();
  for (const d of leadsSnap.docs) {
    const phone = d.data().phone;
    const code = typeof phone === 'string' ? deriveLeadCode(phone) : null;
    if (!code) continue;
    (byCode.get(code) ?? byCode.set(code, []).get(code)!).push({ id: d.id, name: norm(d.data().name) });
  }

  const plan: Array<{
    apptId: string; oldLeadId: string; survivorId: string; name: string;
    createdAt: Timestamp | null; restoreDial: boolean;
  }> = [];
  const skipped: string[] = [];

  for (const a of apptsSnap.docs) {
    const data = a.data();
    const oldLeadId = data.leadId;
    if (typeof oldLeadId !== 'string' || !oldLeadId || leadIds.has(oldLeadId)) continue; // not orphaned
    const phone = typeof data.leadPhone === 'string' ? data.leadPhone : '';
    const code = phone ? deriveLeadCode(phone) : null;
    const apptName = norm(data.leadName);
    const candidates = (code ? byCode.get(code) : undefined) || [];
    const matches = candidates.filter((c) => c.name === apptName);
    if (matches.length !== 1) {
      skipped.push(`${data.leadName ?? '?'} (appt ${a.id}): ${matches.length} name+phone matches — skipped`);
      continue;
    }
    const survivorId = matches[0].id;
    // Restore the lost 'booked' contact dial ONLY if the survivor has no
    // contact dial in-window yet — otherwise it's already counted and a
    // second one would inflate `contacts`. (Also makes re-runs idempotent:
    // once restored, the survivor has an in-window contact, so we skip it.)
    const sLead = await agentRef.collection('leads').doc(survivorId).get();
    const dialLog = Array.isArray(sLead.data()?.dialLog) ? (sLead.data()!.dialLog as any[]) : [];
    plan.push({
      apptId: a.id, oldLeadId, survivorId,
      name: data.leadName ?? '?',
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
      restoreDial: !hasInWindowContact(dialLog),
    });
  }

  console.log(`\n=== Repair orphaned bookings — uid ${uid} — ${apply ? 'APPLY' : 'DRY-RUN'} ===`);
  console.log(`orphaned appointments to repair: ${plan.length}\n`);
  for (const p of plan) {
    console.log(`  ${p.name.padEnd(20)} appt=${p.apptId}  ${p.oldLeadId} -> ${p.survivorId}  ${p.restoreDial ? '+restore booked dial' : '(dial already restored)'}`);
  }
  if (skipped.length) {
    console.log(`\nskipped (need a human):`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  const willRestore = plan.filter((p) => p.restoreDial).length;
  console.log(`\nwould repoint ${plan.length} appointments, restore ${willRestore} contact dials.`);

  if (!apply) {
    console.log(`\nDRY-RUN only. Re-run with --apply to write.\n`);
    return;
  }

  let repointed = 0, dials = 0;
  for (const p of plan) {
    try {
      if (p.restoreDial) {
        const at = p.createdAt ?? Timestamp.now();
        const dialEntry = {
          at,
          outcome: 'booked' as const,
          notes: `Restored booking ${at.toDate().toLocaleDateString()} — contact lost when lead record was rebuilt 2026-06-15 [appt:${p.apptId}]`,
        };
        await agentRef.collection('leads').doc(p.survivorId)
          .update({ dialLog: FieldValue.arrayUnion(dialEntry) });
        dials += 1;
      }
      await agentRef.collection('appointments').doc(p.apptId).update({
        leadId: p.survivorId,
        repointedFromLeadId: p.oldLeadId,
        repointedAt: Timestamp.now(),
      });
      repointed += 1;
    } catch (err) {
      console.error(`  FAILED ${p.name} (appt ${p.apptId}):`, err);
    }
  }
  console.log(`\nAPPLIED: repointed ${repointed}, restored ${dials} dials.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
