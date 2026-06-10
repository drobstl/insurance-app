#!/usr/bin/env npx tsx
/**
 * run-import-merge — collapse the safe duplicate clusters from a bulk
 * import and flag the survivors for review. DEFAULTS TO DRY-RUN.
 *
 * Only auto-merges the high-confidence buckets (exact, strong,
 * fuzzy-corroborated) — mirrors the dashboard's AUTO_MERGE_BUCKETS.
 * `fuzzy-name-only` + `weak` are LEFT for manual review (could be two
 * different people — e.g. Mark P vs Mark T Hanson).
 *
 * Merges reuse the production engine (web/lib/client-merge.ts), which is
 * reversible: the loser is soft-deleted with a full snapshot + a
 * `clientMerges` journal, kept 30 days.
 *
 * Usage:
 *   cd web && unset ANTHROPIC_API_KEY && \
 *     node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/run-import-merge.ts <email> [--execute]
 *
 *   (no flag) → DRY-RUN: prints the plan, performs NO writes.
 *   --execute → applies merges + stamps `needsImportReview` on survivors.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../lib/firebase-admin';
import { findDuplicateCandidates } from '../lib/client-dedup';
import { mergeClients } from '../lib/client-merge';

for (const envFile of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const EMAIL = process.argv.find((a) => a.includes('@')) || 'kevin@wwfinancialservices.com';
const EXECUTE = process.argv.includes('--execute');
const AUTO = new Set(['exact', 'strong', 'fuzzy-corroborated']);
// Canonical display-names to hold back from auto-merge (likely two people
// linked by a shared phone — settled manually against the documents).
const SKIP = new Set(
  (process.argv.find((a) => a.startsWith('--skip='))?.slice('--skip='.length) || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Full read-only snapshot of every client + its policies, written to
 *  disk before any merge so we have a clean restore reference. */
async function backupBook(db: ReturnType<typeof getAdminFirestore>, uid: string): Promise<string> {
  const clientsSnap = await db.collection('agents').doc(uid).collection('clients').get();
  const out: { uid: string; at: string; clientCount: number; clients: unknown[] } = {
    uid,
    at: new Date().toISOString(),
    clientCount: clientsSnap.size,
    clients: [],
  };
  for (const c of clientsSnap.docs) {
    const pol = await c.ref.collection('policies').get();
    out.clients.push({ id: c.id, data: c.data(), policies: pol.docs.map((p) => ({ id: p.id, data: p.data() })) });
  }
  const dir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `kevin-book-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  return file;
}

async function main() {
  const db = getAdminFirestore();
  const uid = (await getAdminAuth().getUserByEmail(EMAIL)).uid;

  console.log(`\n${EXECUTE ? '⚠️  EXECUTE (writes)' : 'DRY-RUN (no writes)'} — import merge for ${EMAIL}`);
  console.log(`uid=${uid}\n`);

  if (EXECUTE) {
    const file = await backupBook(db, uid);
    console.log(`  📦 backup written before any writes: ${file}\n`);
  }

  const groups = await findDuplicateCandidates(db, uid);

  let autoGroups = 0;
  let mergedRecords = 0;
  let movedPolicies = 0;
  let survivorsFlagged = 0;
  const manual: Array<{ bucket: string; names: string[] }> = [];

  for (const g of groups) {
    if (!AUTO.has(g.bucket)) {
      manual.push({ bucket: g.bucket, names: g.members.map((m) => m.name) });
      continue;
    }
    const canonical = g.members.find((m) => m.id === g.suggestedCanonicalId) || g.members[0];
    if (SKIP.has(canonical.name)) {
      manual.push({ bucket: `${g.bucket} · held by --skip`, names: g.members.map((m) => m.name) });
      continue;
    }
    const dups = g.members.filter((m) => m.id !== canonical.id);

    let groupPolicies = 0;
    let blocked = 0;
    const fills = new Set<string>();
    for (const dup of dups) {
      const res = await mergeClients(db, uid, canonical.id, dup.id, {
        dryRun: !EXECUTE,
        actorAgentId: uid,
      });
      if (!res.ok) {
        blocked++;
        console.log(`   ⚠️  ${canonical.name}: cannot merge "${dup.name}" (${res.reason})`);
        continue;
      }
      mergedRecords++;
      groupPolicies += res.counts.policies;
      Object.keys(res.contactGapsFilled).forEach((k) => fills.add(k));
    }
    movedPolicies += groupPolicies;
    autoGroups++;

    if (EXECUTE && blocked === 0) {
      await db.collection('agents').doc(uid).collection('clients').doc(canonical.id).set(
        {
          needsImportReview: true,
          importReview: {
            reason: 'merged_duplicates',
            mergedRecords: dups.length,
            flaggedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      survivorsFlagged++;
    }

    console.log(
      `  KEEP ${canonical.name.padEnd(26)} ← merge ${String(dups.length).padStart(2)}` +
      `  (+${groupPolicies} policies${fills.size ? `, fill: ${[...fills].join(',')}` : ''})  [${g.bucket}]`,
    );
  }

  if (manual.length) {
    console.log(`\n  LEFT FOR MANUAL REVIEW (not auto-merged — verify they're the same person):`);
    manual.forEach((m) => console.log(`     [${m.bucket}] ${m.names.join('  |  ')}`));
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  auto-merge clusters:            ${autoGroups}`);
  console.log(`  duplicate records ${EXECUTE ? 'merged   ' : 'to merge '}:     ${mergedRecords}`);
  console.log(`  policies ${EXECUTE ? 'consolidated' : 'to consolidate'}:    ${movedPolicies}`);
  console.log(`  clusters left for manual:       ${manual.length}`);
  if (EXECUTE) console.log(`  survivors flagged for review:   ${survivorsFlagged}`);
  console.log('══════════════════════════════════════════════════');
  console.log(
    EXECUTE
      ? '\n✅ Applied. Reversible: each loser soft-deleted + clientMerges journal (30-day window).\n'
      : '\nDRY-RUN — no writes performed. Re-run with --execute to apply.\n',
  );
}

main().catch((e) => {
  console.error('merge pass failed:', e);
  process.exit(1);
});
