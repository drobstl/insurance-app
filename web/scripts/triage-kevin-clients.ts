#!/usr/bin/env npx tsx
/**
 * triage-kevin-clients — READ-ONLY.
 *
 * Quantifies the bulk-import mess on one agent's account and assesses how
 * recoverable the source documents are, to decide the cleanup approach.
 *
 * Reports:
 *   1. Clients — active vs soft-deleted, policy-count distribution,
 *      zero-policy "junk" candidates, and the top stacked clients (many
 *      policies = a multi-application pile like Mickey Hoon).
 *   2. Duplicate groups — via the existing client-dedup scanner.
 *   3. Ingestion jobs — how many, and how many carry a filename / storage
 *      path that SIGNALS a decline/denial (the "...DECLINE.pdf" cue).
 *   4. Source-image survival — sample-probes whether the original page
 *      images still exist in storage (→ can we reattach documents?).
 *
 * Usage:
 *   cd web && unset ANTHROPIC_API_KEY && \
 *     node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/triage-kevin-clients.ts [email]
 *
 * NEVER writes. Pure reads.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminAuth, getAdminFirestore, getAdminStorage } from '../lib/firebase-admin';
import { scanForDuplicateGroups, type ClientCandidate } from '../lib/client-dedup';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

const EMAIL = process.argv[2] || 'kevin@wwfinancialservices.com';
// Heuristic filename/path cues that an application was a dead attempt.
const DECLINE_RE = /declin|denied|denial|reject|withdraw|postpon|adverse|\bnto\b|not[\s_-]?taken/i;
const base = (p: string) => p.split('/').pop() || p;

async function main() {
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  const user = await auth.getUserByEmail(EMAIL);
  const uid = user.uid;
  const agentSnap = await db.collection('agents').doc(uid).get();
  const tier = (agentSnap.data()?.membershipTier as string | undefined) ?? '(none)';

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TRIAGE  ${EMAIL}`);
  console.log(`uid=${uid}   membershipTier=${tier}`);
  console.log('══════════════════════════════════════════════════════════════');

  // ── 1. Clients ──
  const clientsSnap = await db.collection('agents').doc(uid).collection('clients').get();
  let active = 0;
  let deleted = 0;
  let zeroPolicy = 0;
  const dist = { p0: 0, p1: 0, p2_5: 0, p6plus: 0 };
  const candidates: ClientCandidate[] = [];
  const stacks: Array<{ name: string; policyCount: number }> = [];
  const junkClients: string[] = [];

  for (const doc of clientsSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (d.deleted) { deleted++; continue; }
    active++;
    const polCount = (await doc.ref.collection('policies').count().get()).data().count ?? 0;
    if (polCount === 0) { zeroPolicy++; dist.p0++; junkClients.push((d.name as string) || '(no name)'); }
    else if (polCount === 1) dist.p1++;
    else if (polCount <= 5) dist.p2_5++;
    else dist.p6plus++;
    stacks.push({ name: (d.name as string) || '(no name)', policyCount: polCount });
    candidates.push({
      id: doc.id,
      name: (d.name as string) || '',
      dateOfBirth: (d.dateOfBirth as string) ?? null,
      phone: (d.phone as string) ?? null,
      email: (d.email as string) ?? null,
      createdAt: (d.createdAt as FirebaseFirestore.Timestamp) ?? null,
      policyCount: polCount,
    });
  }

  console.log('\n── CLIENTS ──');
  console.log(`  total=${clientsSnap.size}   active=${active}   soft-deleted/merged=${deleted}`);
  console.log(`  policies per client:  0=${dist.p0}   1=${dist.p1}   2-5=${dist.p2_5}   6+=${dist.p6plus}`);
  console.log(`  zero-policy clients (non-application / junk candidates): ${zeroPolicy}`);
  console.log('\n  Top stacked clients (most policies = likely multi-application piles):');
  stacks.sort((a, b) => b.policyCount - a.policyCount).slice(0, 15)
    .forEach((c) => console.log(`    ${String(c.policyCount).padStart(3)}  ${c.name}`));

  // ── 2. Duplicate groups ──
  const groups = scanForDuplicateGroups(candidates);
  const byBucket: Record<string, number> = {};
  for (const g of groups) byBucket[g.bucket] = (byBucket[g.bucket] ?? 0) + 1;
  console.log('\n── DUPLICATE GROUPS ──');
  console.log(`  groups=${groups.length}   by bucket: ${JSON.stringify(byBucket)}`);
  groups.slice(0, 12).forEach((g) =>
    console.log(`    [${g.bucket}] ${g.members.length}×  ${g.members.map((m) => m.name).join('  |  ')}`));

  // ── 3. Ingestion jobs (source filenames + decline signal) ──
  const jobsSnap = await db.collection('ingestionJobsV3').where('agentId', '==', uid).get();
  let appJobs = 0, bobJobs = 0, withImages = 0, declineNamed = 0, withFileName = 0;
  const declineSamples: string[] = [];
  const declineFiles: string[] = [];
  const imageProbe: string[] = [];
  for (const doc of jobsSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (d.mode === 'application') appJobs++; else if (d.mode === 'bob') bobJobs++;
    const imgs = Array.isArray(d.gcsImagePaths) ? (d.gcsImagePaths as string[]) : [];
    if (imgs.length) { withImages++; if (imageProbe.length < 25 && imgs[0]) imageProbe.push(imgs[0]); }
    const fn = typeof d.fileName === 'string' ? (d.fileName as string) : '';
    if (fn) withFileName++;
    const gcsPath = typeof d.gcsPath === 'string' ? (d.gcsPath as string) : '';
    const blob = [fn, gcsPath, ...imgs].join(' ');
    if (blob.trim() && DECLINE_RE.test(blob)) {
      declineNamed++;
      const label = fn || base(gcsPath) || base(imgs[0] || '');
      declineFiles.push(label);
      if (declineSamples.length < 20) declineSamples.push(label);
    }
  }
  console.log('\n── INGESTION JOBS (source documents) ──');
  console.log(`  total jobs=${jobsSnap.size}   application=${appJobs}   bob=${bobJobs}`);
  console.log(`  jobs with a stored fileName=${withFileName}   with page-images=${withImages}`);
  console.log(`  jobs whose filename/path SIGNALS a decline/denial: ${declineNamed}`);
  declineSamples.forEach((s) => console.log(`    • ${s}`));

  // ── 4. Source-image survival probe ──
  const bucket = getAdminStorage().bucket();
  let exists = 0, gone = 0;
  for (const p of imageProbe) {
    try { const [e] = await bucket.file(p).exists(); e ? exists++ : gone++; } catch { gone++; }
  }
  console.log('\n── SOURCE-IMAGE SURVIVAL ──');
  console.log(`  probed ${imageProbe.length} jobs:  still in storage=${exists}   gone=${gone}`);
  console.log(exists > 0
    ? '  → source documents ARE recoverable; we can reattach them to clients.'
    : '  → no sampled images survived; reattachment may not be possible.');

  // ── 5. Review worklist (what Kevin actually has to look at) ──
  const lc = (s: string) => s.toLowerCase();
  const lastNameOf = (full: string) => (full.trim().split(/\s+/).pop() || '').toLowerCase();
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('REVIEW WORKLIST — the clients Kevin should check (post-merge)');
  console.log('══════════════════════════════════════════════════════════════');
  let n = 0;
  for (const g of groups) {
    const survivor = g.members.find((m) => m.id === g.suggestedCanonicalId)?.name || g.members[0].name;
    const ln = lastNameOf(survivor);
    const hasDenied = ln.length >= 4 && declineFiles.some((f) => lc(f).includes(ln));
    n++;
    console.log(`  ${String(n).padStart(2)}. ${survivor.padEnd(26)} merge ${String(g.members.length).padStart(2)} records${hasDenied ? '   ⚑ includes a DENIED application' : ''}`);
  }
  if (junkClients.length) {
    console.log('\n  Zero-policy / non-application records (delete candidates):');
    junkClients.forEach((nm) => console.log(`      • ${nm}`));
  }
  console.log(`\n  → ${groups.length} duplicate clusters to merge+review  +  ${junkClients.length} junk records to clear.`);
  console.log('  Post-merge each becomes ONE flagged "Needs review" client: Kevin opens it,');
  console.log('  sees every application with its document, and checks off keep / declined / trash.');

  console.log('\nREAD-ONLY scan complete. No writes performed.\n');
}

main().catch((err) => { console.error('triage failed:', err); process.exit(1); });
