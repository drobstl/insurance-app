#!/usr/bin/env npx tsx
/**
 * set-outreach-hold — toggle an agent's automated-outreach hold.
 *
 *   cd web && unset ANTHROPIC_API_KEY && \
 *     node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/set-outreach-hold.ts <email> [--off]
 *
 * Default sets the hold ON (care crons skip this agent). --off lifts it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../lib/firebase-admin';

for (const f of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const EMAIL = process.argv.find((a) => a.includes('@')) || 'kevin@wwfinancialservices.com';
const ON = !process.argv.includes('--off');

async function main() {
  const uid = (await getAdminAuth().getUserByEmail(EMAIL)).uid;
  await getAdminFirestore().collection('agents').doc(uid).set(
    ON
      ? {
          automatedOutreachHold: true,
          automatedOutreachHoldReason: 'import_cleanup',
          automatedOutreachHeldAt: FieldValue.serverTimestamp(),
        }
      : {
          automatedOutreachHold: false,
          automatedOutreachHoldReleasedAt: FieldValue.serverTimestamp(),
        },
    { merge: true },
  );
  console.log(`outreach hold ${ON ? 'ON' : 'OFF'} for ${EMAIL} (uid=${uid})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
