#!/usr/bin/env npx tsx
/**
 * fire-drip-now — one-shot manual drip release for a single agent.
 *
 * Calls the same `releaseDripForAgent` helper the cron + import-batch
 * route use. Useful when a deploy race caused a bulk-import to skip the
 * immediate release pass — fire this to fill the agent's queue without
 * waiting for the next daily cron at 1 PM UTC.
 *
 * Honors the 15/UTC-day cap. Won't double-release on top of a same-day
 * release that already happened.
 *
 * Usage:
 *   cd web
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/fire-drip-now.ts <agentId>
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { releaseDripForAgent } from '../lib/bulk-import-drip';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

async function main() {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error('Usage: fire-drip-now.ts <agentId>');
    process.exit(1);
  }

  const db = getAdminFirestore();
  const outcome = await releaseDripForAgent({ db, agentId });

  console.log('');
  console.log(`Agent: ${agentId}`);
  console.log(`  released:                  ${outcome.released}`);
  console.log(`  skippedNoPhone:            ${outcome.skippedNoPhone}`);
  console.log(`  skippedAlreadyComplete:    ${outcome.skippedAlreadyComplete}`);
  console.log(`  pendingAfter:              ${outcome.pendingAfter}`);
  console.log(`  sameDayCapReached:         ${outcome.sameDayCapReached}`);
  console.log(`  slotsRemainingToday:       ${outcome.slotsRemainingToday}`);
  console.log('');
}

main().catch((err) => {
  console.error('fire-drip-now failed:', err);
  process.exit(1);
});
