#!/usr/bin/env npx tsx
/**
 * READ-ONLY. Find Ashley Turle's agent doc and summarize her leads so we
 * can confirm scope before any deletion. Writes nothing.
 *
 * Run:
 *   npx tsx ./scripts/inspect-ashley-leads.ts [--needle="ashley"]
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

function arg(name: string, def: string): string {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : def;
}

async function main(): Promise<void> {
  const needle = arg('needle', 'ashley').toLowerCase();
  const db = getAdminFirestore();

  // Agents collection is small; fetch all and filter by any string field
  // that contains the needle. Report matches so we pick the right uid.
  const agentsSnap = await db.collection('agents').get();
  const matches = agentsSnap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    return Object.values(data).some(
      (v) => typeof v === 'string' && v.toLowerCase().includes(needle),
    );
  });

  if (matches.length === 0) {
    console.log(`No agent doc has any string field containing "${needle}".`);
    process.exit(0);
  }

  for (const agentDoc of matches) {
    const data = agentDoc.data() as Record<string, unknown>;
    console.log('────────────────────────────────────────────────────');
    console.log(`Agent uid: ${agentDoc.id}`);
    for (const k of ['name', 'displayName', 'fullName', 'email', 'emailLower', 'membershipTier', 'subscriptionStatus']) {
      if (data[k] !== undefined) console.log(`  ${k}: ${String(data[k])}`);
    }

    const leadsSnap = await db
      .collection('agents').doc(agentDoc.id)
      .collection('leads')
      .get();
    console.log(`  TOTAL LEADS: ${leadsSnap.size}`);

    // Break down by formType and createdAt range.
    const byForm = new Map<string, number>();
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const ld of leadsSnap.docs) {
      const d = ld.data() as { formType?: string; createdAt?: { toMillis?: () => number } };
      const ft = d.formType ?? '(none)';
      byForm.set(ft, (byForm.get(ft) ?? 0) + 1);
      const ms = d.createdAt?.toMillis?.();
      if (typeof ms === 'number') {
        if (ms < minMs) minMs = ms;
        if (ms > maxMs) maxMs = ms;
      }
    }
    console.log('  By formType:');
    for (const [ft, n] of [...byForm.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ft}: ${n}`);
    }
    if (minMs !== Infinity) {
      console.log(`  createdAt range: ${new Date(minMs).toISOString()} → ${new Date(maxMs).toISOString()}`);
    }

    // Sample first 10 names so Daniel can eyeball they're really hers.
    console.log('  Sample (up to 10):');
    leadsSnap.docs.slice(0, 10).forEach((ld) => {
      const d = ld.data() as { name?: string; phone?: string; formType?: string };
      console.log(`    ${d.name ?? '(no name)'}  ${d.phone ?? ''}  [${d.formType ?? '—'}]`);
    });

    // Count appointments too — deleting leads orphans these; report only.
    const apptsSnap = await db
      .collection('agents').doc(agentDoc.id)
      .collection('appointments')
      .get();
    console.log(`  Appointments (NOT touched by lead delete unless we choose to): ${apptsSnap.size}`);
  }
  console.log('────────────────────────────────────────────────────');
  console.log('READ-ONLY. Nothing was written.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Inspection failed:', err);
    process.exit(1);
  });
