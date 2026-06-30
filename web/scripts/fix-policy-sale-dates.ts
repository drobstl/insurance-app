#!/usr/bin/env npx tsx
/**
 * Fix policy sale dates that silently fell back to `createdAt` (the day
 * the policy was added to AgentForLife), so old / back-book policies stop
 * counting as current-period sales in Activity.
 *
 * Background: Activity derives a policy's sale date as
 *     applicationSignedDate ?? effectiveDate ?? createdAt
 * When neither real date is on the doc (e.g. an existing client added by
 * PDF before the signed-date-persistence fix in PR #212), it falls back
 * to `createdAt` — dating a 2024 policy to today and inflating the
 * current month's Submitted / Net-Placed numbers.
 *
 * This script finds those policies for one agent and, where the client's
 * "Client Since" date (clientSinceDate) tells us the real date, proposes
 * setting the policy's `applicationSignedDate` to it. It only auto-writes
 * "high-confidence" rows — where clientSinceDate exists AND is clearly
 * older than the import day (so it's a back-book entry, not a genuine
 * same-day sale). Rows without a usable date are reported, never written.
 *
 * Default: DRY RUN — prints every candidate and writes nothing.
 *   --agent <uid>    Agent to scan (default: Daniel's agent uid).
 *   --only <substr>  Only consider clients whose name contains <substr>
 *                    (case-insensitive). e.g. `--only Besozzi` for Vicki.
 *   --apply          Actually set applicationSignedDate on high-confidence
 *                    candidates.
 *
 * Run from web/:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/fix-policy-sale-dates.ts [--agent <uid>] [--only Besozzi] [--apply]
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { computeAPV } from '../lib/apv';
import { policySaleDateSource } from '../lib/activity-stats';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

const DANIEL_UID = '1sRAF3Kq6shiNtabbPOCRO2VFC93';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function tsToYmd(ts: unknown): string | null {
  const maybe = ts as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') {
    try {
      return maybe.toDate().toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }
  return null;
}

interface Cand {
  clientId: string;
  policyId: string;
  clientName: string;
  carrier: string;
  product: string;
  apv: number;
  createdYmd: string | null;
  proposed: string | null;
  confidence: 'high' | 'review';
}

async function main() {
  const agentId = arg('--agent') || DANIEL_UID;
  const only = (arg('--only') || '').toLowerCase();
  const apply = process.argv.includes('--apply');
  const db = getAdminFirestore();

  console.log(`[fix-sale-dates] agent=${agentId} only=${only || '(all clients)'} apply=${apply}\n`);

  const clientsSnap = await db.collection('agents').doc(agentId).collection('clients').get();
  const cands: Cand[] = [];

  for (const c of clientsSnap.docs) {
    const cd = c.data() as { name?: string; clientSinceDate?: string };
    if (only && !(cd.name || '').toLowerCase().includes(only)) continue;
    const clientSince =
      typeof cd.clientSinceDate === 'string' && YMD.test(cd.clientSinceDate) ? cd.clientSinceDate : null;

    const polSnap = await c.ref.collection('policies').get();
    for (const p of polSnap.docs) {
      const pd = p.data() as Record<string, unknown>;
      // Only policies whose sale date is the createdAt fallback — those
      // already carrying a real signed/effective date are correct.
      if (policySaleDateSource(pd) !== 'createdAt') continue;
      const createdYmd = tsToYmd(pd.createdAt);
      // High confidence: we know the real date (clientSinceDate) AND it's
      // clearly before the import day — i.e. a back-book entry, not a
      // genuine same-day sale we'd risk back-dating by mistake.
      const olderThanImport = Boolean(clientSince && createdYmd && clientSince < createdYmd);
      cands.push({
        clientId: c.id,
        policyId: p.id,
        clientName: cd.name || 'Unnamed client',
        carrier: typeof pd.insuranceCompany === 'string' ? pd.insuranceCompany : '—',
        product: typeof pd.policyType === 'string' ? pd.policyType : '—',
        apv: computeAPV(pd.premiumAmount as number | null, pd.premiumFrequency as string | null),
        createdYmd,
        proposed: clientSince,
        confidence: olderThanImport ? 'high' : 'review',
      });
    }
  }

  const high = cands.filter((c) => c.confidence === 'high');
  const review = cands.filter((c) => c.confidence === 'review');

  console.log(`Found ${cands.length} policy(ies) dated only by the createdAt fallback:`);
  console.log(`  ${high.length} high-confidence (clientSinceDate older than import day) → fixable`);
  console.log(`  ${review.length} need a manual date (no/unhelpful clientSinceDate)\n`);

  const fmt = (c: Cand) =>
    `  [${c.confidence === 'high' ? 'FIX ' : 'REVW'}] ${c.clientName.padEnd(22)} ${c.carrier.padEnd(16)} ${c.product.padEnd(18)} APV $${String(Math.round(c.apv)).padStart(6)}  import=${c.createdYmd ?? '?'}  ->  ${c.proposed ?? '(needs date)'}`;

  if (high.length) {
    console.log('HIGH CONFIDENCE (set on --apply):');
    high.forEach((c) => console.log(fmt(c)));
    console.log('');
  }
  if (review.length) {
    console.log('NEEDS MANUAL DATE (never auto-written):');
    review.forEach((c) => console.log(fmt(c)));
    console.log('');
  }

  const movedApv = high.reduce((s, c) => s + c.apv, 0);
  console.log(`APV that would move out of its import-day month: $${Math.round(movedApv)}\n`);

  if (!apply) {
    console.log('DRY RUN — no writes. Re-run with --apply to set the high-confidence dates.');
    return;
  }

  console.log('APPLYING…');
  for (const c of high) {
    await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(c.clientId)
      .collection('policies')
      .doc(c.policyId)
      .update({ applicationSignedDate: c.proposed });
    console.log(`  set ${c.clientName} -> applicationSignedDate=${c.proposed}`);
  }
  console.log(`\nDone. Updated ${high.length} policy(ies). Reload /dashboard/activity to see the corrected totals.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
