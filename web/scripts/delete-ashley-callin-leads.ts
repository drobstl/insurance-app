#!/usr/bin/env npx tsx
/**
 * One-off: clear out Ashley Turle's mis-read Call-In lead batch so she can
 * start fresh, WITHOUT touching her hand-typed Manual/Mail-In leads, the
 * leads that have appointments booked on them, or a named keep-list.
 *
 * Scope (all conditions must hold for a lead to be deleted):
 *   - belongs to Ashley's agent uid (HWWkdk6h0wSxjLA1xwUhXRl1iXX2)
 *   - formType === 'Call-In'
 *   - has NO appointment pointing at it (agents/{uid}/appointments.leadId)
 *   - name is not in KEEP_NAMES (Calvin Johnson)
 *
 * For each deleted lead it mirrors the DELETE /api/leads/[leadId] cleanup:
 *   - delete the lead doc
 *   - clear leadCodes index entries (stored leadCode + code derived from the
 *     current phone), but only when that index doc points at THIS lead
 *   - delete leadActivity entries where leadId === this lead
 *
 * Always writes a JSON backup of every lead it will delete to
 * ./scratch-backups/ before deleting, so a restore is trivial.
 *
 * Default: DRY RUN (writes the backup + prints the plan, deletes nothing).
 * Pass --apply to actually delete.
 *
 * Run:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/delete-ashley-callin-leads.ts [--apply]
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { deriveLeadCode } from '../lib/lead-code-derive';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const AGENT_UID = 'HWWkdk6h0wSxjLA1xwUhXRl1iXX2'; // Ashley Turle
const KEEP_NAMES = new Set(['calvin johnson']); // explicit keep-list (lowercased)
const APPLY = process.argv.slice(2).includes('--apply');

async function main(): Promise<void> {
  const db = getAdminFirestore();

  // Sanity-check we're on the right account.
  const agentSnap = await db.collection('agents').doc(AGENT_UID).get();
  const agent = agentSnap.data() as { name?: string; email?: string } | undefined;
  if (!agentSnap.exists) {
    console.error(`Agent ${AGENT_UID} not found. Aborting.`);
    process.exit(1);
  }
  console.log(`Agent: ${agent?.name ?? '(no name)'} <${agent?.email ?? '?'}> (${AGENT_UID})`);
  console.log(`Mode:  ${APPLY ? 'APPLY (deletes will happen)' : 'DRY RUN (no deletes)'}`);
  console.log('');

  // Lead ids that have an appointment — these are skipped.
  const apptsSnap = await db
    .collection('agents').doc(AGENT_UID).collection('appointments').get();
  const apptLeadIds = new Set<string>();
  apptsSnap.docs.forEach((a) => {
    const lid = (a.data() as { leadId?: string }).leadId;
    if (typeof lid === 'string' && lid) apptLeadIds.add(lid);
  });
  console.log(`Appointments found: ${apptsSnap.size} (lead ids: ${[...apptLeadIds].join(', ') || 'none'})`);

  const leadsSnap = await db
    .collection('agents').doc(AGENT_UID).collection('leads').get();

  const toDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const skipped: string[] = [];
  for (const ld of leadsSnap.docs) {
    const d = ld.data() as { name?: string; formType?: string };
    const name = (d.name ?? '').trim();
    if (d.formType !== 'Call-In') {
      skipped.push(`${name} [${d.formType ?? '—'}] — not Call-In`);
      continue;
    }
    if (apptLeadIds.has(ld.id)) {
      skipped.push(`${name} — has appointment`);
      continue;
    }
    if (KEEP_NAMES.has(name.toLowerCase())) {
      skipped.push(`${name} — keep-list`);
      continue;
    }
    toDelete.push(ld);
  }

  console.log(`\nTotal leads: ${leadsSnap.size}`);
  console.log(`Will DELETE: ${toDelete.length}`);
  console.log(`Will KEEP:   ${skipped.length}`);
  console.log('\nKEEP:');
  skipped.forEach((s) => console.log(`  • ${s}`));
  console.log('\nDELETE:');
  toDelete.forEach((ld) => {
    const d = ld.data() as { name?: string; phone?: string };
    console.log(`  • ${d.name ?? '(no name)'}  ${d.phone ?? ''}  (${ld.id})`);
  });

  // Backup every lead we're about to delete — full doc data.
  const backupDir = path.resolve(__dirname, '..', 'scratch-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `ashley-callin-leads-backup-${leadsSnap.size}of${toDelete.length}.json`);
  const backup = toDelete.map((ld) => ({ id: ld.id, data: ld.data() }));
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup written: ${backupPath} (${backup.length} leads)`);

  if (!APPLY) {
    console.log('\nDRY RUN complete. Re-run with --apply to delete.');
    return;
  }

  console.log('\nApplying deletions...');
  let n = 0;
  for (const ld of toDelete) {
    const data = ld.data() as { leadCode?: string; phone?: string };
    const codesToClear = new Set<string>();
    if (typeof data.leadCode === 'string' && data.leadCode) codesToClear.add(data.leadCode);
    const derived = typeof data.phone === 'string' ? deriveLeadCode(data.phone) : null;
    if (derived) codesToClear.add(derived);

    const activitySnap = await db
      .collection('agents').doc(AGENT_UID).collection('leadActivity')
      .where('leadId', '==', ld.id).get();

    const ops: Promise<unknown>[] = [ld.ref.delete()];
    for (const code of codesToClear) {
      ops.push((async () => {
        const ref = db.collection('leadCodes').doc(code);
        const idx = await ref.get();
        const ix = idx.data() as { agentId?: string; leadId?: string } | undefined;
        if (idx.exists && ix?.agentId === AGENT_UID && ix?.leadId === ld.id) {
          await ref.delete();
        }
      })().catch(() => {}));
    }
    activitySnap.docs.forEach((a) => ops.push(a.ref.delete().catch(() => {})));
    await Promise.all(ops);
    n += 1;
    console.log(`  ✓ deleted ${ld.id} (${(ld.data() as { name?: string }).name ?? ''})`);
  }
  console.log(`\nDone. Deleted ${n} leads. Backup at ${backupPath}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Deletion failed:', err);
    process.exit(1);
  });
