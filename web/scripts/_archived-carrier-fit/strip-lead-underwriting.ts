#!/usr/bin/env npx tsx
/**
 * Strip `underwriting` subdoc from every lead.
 *
 * Reversibility escape-hatch for the carrier-fit engine: if Daniel
 * decides to remove the feature entirely, this script wipes the
 * structured medical-flag data those panels wrote to Firestore. The
 * lead docs themselves are otherwise untouched.
 *
 * Default: dry-run (lists affected leads, writes nothing).
 * Pass `--apply` to actually delete the field.
 *
 * Run from `web/`:
 *   npx tsx scripts/strip-lead-underwriting.ts            # dry-run
 *   npx tsx scripts/strip-lead-underwriting.ts --apply    # for real
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = getAdminFirestore();

  // collectionGroup query gets every `leads/{leadId}` doc across every
  // agent in one pass. Cheaper than walking the agents collection.
  const snap = await db.collectionGroup('leads').get();
  let affected = 0;
  let totalScanned = 0;
  for (const docSnap of snap.docs) {
    totalScanned += 1;
    const data = docSnap.data() as { underwriting?: unknown };
    if (data.underwriting === undefined) continue;
    affected += 1;
    if (apply) {
      await docSnap.ref.update({ underwriting: FieldValue.delete() });
    }
    console.log(`${apply ? 'STRIPPED' : 'WOULD STRIP'}: ${docSnap.ref.path}`);
  }
  console.log('');
  console.log(`Scanned ${totalScanned} leads`);
  console.log(`${apply ? 'Stripped' : 'Would strip'} underwriting from ${affected}`);
  if (!apply) console.log('Re-run with --apply to actually delete the field.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
