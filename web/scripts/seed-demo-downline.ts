#!/usr/bin/env npx tsx
/**
 * seed-demo-downline — CLI wrapper around lib/demo-downline.ts.
 *
 * Seeds (or purges) TEMPORARY fake downline agents for a My Team demo.
 * See lib/demo-downline.ts for what gets written and the safety rails
 * (isDemoSeed flags, demo-seed- ids, outreach hold, example.com emails).
 * The same logic is exposed to admins in-app via
 * POST /api/admin/demo-downline (buttons on /dashboard/admin/manage-agents).
 *
 * Default: DRY RUN — prints the plan, writes nothing.
 *   --apply   actually write
 *   --purge   delete every isDemoSeed agent under the owner (recursive)
 *   --owner=<email>   the agency owner (default daniel@crosswindsfg.com)
 *
 * Run (from web/):
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/seed-demo-downline.ts --owner=you@example.com --apply
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/seed-demo-downline.ts --owner=you@example.com --purge
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminAuth, getAdminFirestore } from '../lib/firebase-admin';
import { seedDemoDownline, purgeDemoDownline, describeDemoDownline } from '../lib/demo-downline';

for (const f of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge');
const OWNER_EMAIL =
  process.argv.find((a) => a.startsWith('--owner='))?.slice('--owner='.length) ||
  'daniel@crosswindsfg.com';

async function main() {
  const db = getAdminFirestore();

  // Resolve the owner.
  let ownerUid: string;
  try {
    ownerUid = (await getAdminAuth().getUserByEmail(OWNER_EMAIL)).uid;
  } catch {
    const snap = await db.collection('agents').where('email', '==', OWNER_EMAIL).limit(1).get();
    if (snap.empty) {
      console.error(`ERROR: no auth user or agent doc found for ${OWNER_EMAIL}`);
      process.exit(1);
    }
    ownerUid = snap.docs[0].id;
  }
  const ownerDoc = await db.collection('agents').doc(ownerUid).get();
  if (!ownerDoc.exists) {
    console.error(`ERROR: agents/${ownerUid} does not exist for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  if (ownerDoc.data()?.isAgencyOwner !== true) {
    console.warn(
      `⚠ agents/${ownerUid} is not flagged isAgencyOwner — the My Team page will 403.\n` +
      `  Fix separately if needed; this script does not modify the owner doc.`,
    );
  }
  console.log(`Owner: ${OWNER_EMAIL} (uid=${ownerUid})`);

  if (PURGE) {
    const { agents, names } = await purgeDemoDownline(ownerUid);
    if (agents === 0) {
      console.log('No demo-seed agents found under this owner. Nothing to purge.');
    } else {
      for (const n of names) console.log(`  ✗ ${n}`);
      console.log(`Purged ${agents} demo-seed agent(s) and all their subcollections.`);
    }
    return;
  }

  console.log(`\nPlan: fake downline agents under this owner:\n`);
  for (const p of describeDemoDownline()) {
    console.log(
      `  • ${p.name.padEnd(16)} ~${p.dials} dials, ${p.sales} sales (~$${p.apv.toLocaleString()} APV), ` +
      `${p.referrals} referrals, ${p.saves} saves, ${p.scoredCalls} scored calls`,
    );
  }
  console.log(
    '\nAll docs carry isDemoSeed: true; agent ids are prefixed demo-seed-.' +
    '\nFake agents have automatedOutreachHold: true, no phone, example.com emails.',
  );
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to seed.\n');
    return;
  }

  console.log('\nApplying…');
  const { agents, docs } = await seedDemoDownline(ownerUid);
  console.log(
    `\nDone. ${agents} demo agents (${docs} docs) seeded under ${OWNER_EMAIL}.` +
    `\nAFTER THE DEMO, purge with:\n` +
    `  node --require ./scripts/server-only-shim.cjs --import tsx \\\n` +
    `    ./scripts/seed-demo-downline.ts --owner=${OWNER_EMAIL} --purge\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
