#!/usr/bin/env npx tsx
/**
 * inspect-drip-state — READ-ONLY diagnostic.
 *
 * Pulls the agent doc's drip counters + a roll-up of pending vs released
 * bulk-import clients + recent welcome action items so we can tell why
 * a just-completed bulk import didn't surface welcomes in the queue.
 *
 * Usage:
 *   cd web
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/inspect-drip-state.ts <agentId>
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const c = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof c.toDate === 'function') {
      try { return c.toDate().toISOString(); } catch { return null; }
    }
    const s = typeof c._seconds === 'number' ? c._seconds : c.seconds;
    if (typeof s === 'number') return new Date(s * 1000).toISOString();
  }
  return null;
}

async function main() {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error('Usage: inspect-drip-state.ts <agentId>');
    process.exit(1);
  }

  const db = getAdminFirestore();

  console.log(`\n══ Agent doc (drip fields) — ${agentId}\n`);
  const agentSnap = await db.collection('agents').doc(agentId).get();
  if (!agentSnap.exists) {
    console.log('Agent doc not found.');
    return;
  }
  const agentData = agentSnap.data() ?? {};
  console.log(`  lastBulkImportDripReleasedAt:        ${agentData.lastBulkImportDripReleasedAt ?? '(unset)'}`);
  console.log(`  bulkImportDripReleasedTodayCount:    ${agentData.bulkImportDripReleasedTodayCount ?? '(unset)'}`);

  console.log(`\n══ Bulk-import clients (status)\n`);
  const allClients = await db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .get();

  let totalClients = 0;
  let pendingDrip = 0;
  let releasedDrip = 0;
  const recentlyImported: Array<{ id: string; name: string; pending: boolean; createdAt: string | null; releasedAt: string | null; outcome: string | null }> = [];
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

  for (const doc of allClients.docs) {
    totalClients++;
    const d = doc.data() as Record<string, unknown>;
    const pending = d.bulkImportPendingDrip === true;
    if (pending) pendingDrip++;
    if (d.bulkImportReleasedAt) releasedDrip++;

    const createdAtMs = d.createdAt && typeof (d.createdAt as { toDate?: () => Date }).toDate === 'function'
      ? (d.createdAt as { toDate: () => Date }).toDate().getTime()
      : null;
    if (createdAtMs && createdAtMs >= oneHourAgoMs) {
      recentlyImported.push({
        id: doc.id,
        name: typeof d.name === 'string' ? d.name : '(no name)',
        pending,
        createdAt: toIso(d.createdAt),
        releasedAt: toIso(d.bulkImportReleasedAt),
        outcome: typeof d.bulkImportReleaseOutcome === 'string' ? d.bulkImportReleaseOutcome : null,
      });
    }
  }

  console.log(`  Total clients:                       ${totalClients}`);
  console.log(`  Pending drip (bulkImportPendingDrip): ${pendingDrip}`);
  console.log(`  Drip-released (bulkImportReleasedAt): ${releasedDrip}`);

  console.log(`\n══ Clients created in last hour (${recentlyImported.length})\n`);
  for (const c of recentlyImported.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))) {
    console.log(`  ${c.createdAt}  ${c.name.padEnd(28)}  pending=${c.pending}  outcome=${c.outcome ?? '(none)'}`);
  }

  console.log(`\n══ Welcome action items (last hour)\n`);
  try {
    const aiSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('actionItems')
      .where('lane', '==', 'welcome')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    let recentAI = 0;
    for (const doc of aiSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const createdMs = d.createdAt && typeof (d.createdAt as { toDate?: () => Date }).toDate === 'function'
        ? (d.createdAt as { toDate: () => Date }).toDate().getTime()
        : null;
      if (createdMs && createdMs >= oneHourAgoMs) {
        recentAI++;
        console.log(`  ${toIso(d.createdAt)}  status=${d.status}  clientId=${d.clientId}  mode=${d.mode ?? '(none)'}`);
      }
    }
    if (recentAI === 0) console.log('  (none in last hour)');
  } catch (e) {
    console.log(`  Welcome action items query failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log('');
}

main().catch((err) => {
  console.error('inspect-drip-state failed:', err);
  process.exit(1);
});
