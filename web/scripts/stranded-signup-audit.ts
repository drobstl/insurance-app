#!/usr/bin/env npx tsx
/**
 * Stranded-signup audit — READ-ONLY.
 *
 * Finds Firestore agents who don't have an active subscription so we
 * can email them after the /signup loop fix ships. Ian Chow-Ise was
 * one of these — created an account, never reached Stripe Checkout
 * because /pricing CTAs sent him back to /signup, which threw
 * email-already-in-use and trapped him.
 *
 * Buckets:
 *   - NEVER_SUBBED   subscriptionStatus is missing — these are the
 *                    UX-bug victims. Top priority to email.
 *   - LAPSED         subscriptionStatus is 'canceled' / 'past_due' /
 *                    other — these had a sub at some point. Different
 *                    recovery path (normal churn).
 *
 * Excludes accounts created within the last hour (likely in-flight).
 *
 * Run: `node --import tsx ./scripts/stranded-signup-audit.ts` from `web/`.
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

interface Row {
  uid: string;
  email: string;
  name: string;
  createdAtIso: string;
  status: string;
}

async function main() {
  const db = getAdminFirestore();
  const snapshot = await db.collection('agents').get();

  const cutoffMs = Date.now() - 60 * 60 * 1000;
  const neverSubbed: Row[] = [];
  const lapsed: Row[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const status = data.subscriptionStatus;
    if (status === 'active') continue;

    const createdAtMs =
      data.createdAt && typeof data.createdAt.toMillis === 'function'
        ? data.createdAt.toMillis()
        : null;
    if (createdAtMs !== null && createdAtMs > cutoffMs) continue;

    const row: Row = {
      uid: doc.id,
      email: data.email ?? '—',
      name: data.name ?? '—',
      createdAtIso: createdAtMs ? new Date(createdAtMs).toISOString() : '—',
      status: status ?? '(unset)',
    };
    if (status === undefined || status === null) {
      neverSubbed.push(row);
    } else {
      lapsed.push(row);
    }
  }

  const sortByDate = (a: Row, b: Row) => a.createdAtIso.localeCompare(b.createdAtIso);
  neverSubbed.sort(sortByDate);
  lapsed.sort(sortByDate);

  console.log(`\n=== NEVER_SUBBED (${neverSubbed.length}) — likely /signup-loop victims ===`);
  for (const r of neverSubbed) {
    console.log(`  ${r.createdAtIso}  ${r.email.padEnd(40)}  ${r.name.padEnd(30)}  uid=${r.uid}`);
  }

  console.log(`\n=== LAPSED (${lapsed.length}) — had a sub at some point ===`);
  for (const r of lapsed) {
    console.log(
      `  ${r.createdAtIso}  ${r.email.padEnd(40)}  ${r.name.padEnd(30)}  status=${r.status}  uid=${r.uid}`,
    );
  }

  console.log(
    `\nTotal agents: ${snapshot.size}.  Active: ${snapshot.size - neverSubbed.length - lapsed.length}.  Never-subbed: ${neverSubbed.length}.  Lapsed: ${lapsed.length}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
