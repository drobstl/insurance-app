#!/usr/bin/env npx tsx
/**
 * Nuke welcome action items created during the maintenance window.
 *
 * Per Daniel's "the 34 will have to start over when we go back live"
 * stance from the May 8 reactivation safety pass, every welcome action
 * item that was queued while `MAINTENANCE_MODE_READONLY=true` /
 * `LINQ_OUTBOUND_DISABLED=true` were active gets marked expired with
 * `nukeReason: 'maintenance_window_reset'` so /dashboard/welcomes does
 * not surface stale items on relaunch.
 *
 * The action items themselves never sent through Linq — Mode 1 sends
 * via the agent's personal phone — but the queue card might still
 * confuse an agent on relaunch. Cleanest to wipe.
 *
 * Default: dry-run (lists what would be marked but writes nothing).
 * Pass `--apply` to actually write.
 *
 * Run: `npm run nuke:window-welcomes -- --apply` from `web/`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

interface Args {
  windowStartIso: string;
  apply: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    windowStartIso: '2026-05-06T00:00:00Z',
    apply: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--window-start=')) {
      args.windowStartIso = arg.slice('--window-start='.length);
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: nuke-window-welcome-action-items.ts [--window-start=ISO] [--apply]\n' +
          '  --window-start  Maintenance window start; defaults to 2026-05-06T00:00:00Z\n' +
          '  --apply         Write changes (default is dry-run)',
      );
      process.exit(0);
    }
  }
  return args;
}

interface Found {
  agentId: string;
  agentEmail: string | null;
  itemId: string;
  createdAt: string;
}

function tsToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const windowStart = new Date(args.windowStartIso);
  if (isNaN(windowStart.getTime())) {
    console.error(`Invalid --window-start: ${args.windowStartIso}`);
    process.exit(1);
  }

  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();

  console.log(`Window start: ${windowStart.toISOString()}`);
  console.log(`Mode: ${args.apply ? 'APPLY (writes will happen)' : 'dry-run'}`);
  console.log(`Agents scanned: ${agentsSnap.docs.length}`);

  const found: Found[] = [];
  for (const agentDoc of agentsSnap.docs) {
    const agentEmail = (agentDoc.data().email as string) || null;
    const aiSnap = await db
      .collection('agents')
      .doc(agentDoc.id)
      .collection('actionItems')
      .where('lane', '==', 'welcome')
      .where('status', '==', 'pending')
      .get();
    for (const doc of aiSnap.docs) {
      const data = doc.data();
      const createdIso = tsToIso(data.createdAt);
      if (!createdIso) continue;
      if (new Date(createdIso) < windowStart) continue;
      found.push({
        agentId: agentDoc.id,
        agentEmail,
        itemId: doc.id,
        createdAt: createdIso,
      });
    }
  }

  if (found.length === 0) {
    console.log('\nNo pending welcome action items created during the window. Nothing to nuke.');
    return;
  }

  console.log(`\nFound ${found.length} item(s) to nuke:`);
  for (const item of found) {
    console.log(
      `  agent=${item.agentEmail ?? item.agentId} itemId=${item.itemId} createdAt=${item.createdAt}`,
    );
  }

  if (!args.apply) {
    console.log('\nDry run — no writes. Re-run with `--apply` to mark these expired.');
    return;
  }

  const nowIso = new Date().toISOString();
  let written = 0;
  for (const item of found) {
    const ref = db
      .collection('agents')
      .doc(item.agentId)
      .collection('actionItems')
      .doc(item.itemId);
    await ref.update({
      status: 'expired',
      completionAction: 'expired_unhandled',
      completedAt: nowIso,
      nukeReason: 'maintenance_window_reset',
      nukedAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    });
    written += 1;
    console.log(`  ✓ nuked ${item.itemId} (agent ${item.agentEmail ?? item.agentId})`);
  }
  console.log(`\nWrote ${written} update(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Nuke failed:', err);
    process.exit(1);
  });
