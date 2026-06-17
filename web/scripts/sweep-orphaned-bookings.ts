#!/usr/bin/env npx tsx
/**
 * Platform-wide orphaned-booking sweep — READ-ONLY.
 *
 * Blast radius of the lead delete+reimport orphaning: for every agent,
 * count appointments whose `leadId` no longer resolves to a lead doc, how
 * many were booked this month, and how many are recoverable (a current
 * lead shares the phone). Daniel's uid (already repaired) should read 0.
 *
 * Run from web/:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/sweep-orphaned-bookings.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { deriveLeadCode } from '../lib/lead-code-derive';

for (const envFile of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const MONTH_START = Date.UTC(2026, 5, 1);
const tsMillis = (t: unknown): number | null => {
  const o = t as { toMillis?: () => number; _seconds?: number } | null;
  if (o && typeof o === 'object') {
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o._seconds === 'number') return o._seconds * 1000;
  }
  return null;
};

async function main() {
  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();
  const results: Array<{ uid: string; orphans: number; recent: number; recoverable: number; leads: number; appts: number }> = [];
  let scanned = 0;
  let totalOrphans = 0;

  for (const agent of agentsSnap.docs) {
    const uid = agent.id;
    const ref = db.collection('agents').doc(uid);
    const [leadsSnap, apptsSnap] = await Promise.all([
      ref.collection('leads').get(),
      ref.collection('appointments').get(),
    ]);
    scanned += 1;
    if (apptsSnap.empty) continue;
    const leadIds = new Set(leadsSnap.docs.map((d) => d.id));
    const codeToLead = new Map<string, string>();
    for (const d of leadsSnap.docs) {
      const phone = d.data().phone;
      const code = typeof phone === 'string' ? deriveLeadCode(phone) : null;
      if (code && !codeToLead.has(code)) codeToLead.set(code, d.id);
    }
    let orphans = 0;
    let recent = 0;
    let recoverable = 0;
    for (const a of apptsSnap.docs) {
      const data = a.data();
      const leadId = data.leadId;
      if (typeof leadId !== 'string' || !leadId || leadIds.has(leadId)) continue;
      orphans += 1;
      totalOrphans += 1;
      const ms = tsMillis(data.createdAt);
      if (ms !== null && ms >= MONTH_START) recent += 1;
      const phone = typeof data.leadPhone === 'string' ? data.leadPhone : '';
      const code = phone ? deriveLeadCode(phone) : null;
      if (code && codeToLead.has(code)) recoverable += 1;
    }
    if (orphans > 0) results.push({ uid, orphans, recent, recoverable, leads: leadsSnap.size, appts: apptsSnap.size });
  }

  results.sort((a, b) => b.orphans - a.orphans);
  console.log(`\n=== Platform orphaned-booking sweep ===`);
  console.log(`agents scanned: ${scanned}`);
  console.log(`agents with orphaned appointments: ${results.length}`);
  console.log(`total orphaned appointments: ${totalOrphans}\n`);
  if (results.length) {
    console.log(`uid                            orphans  thisMonth  recoverable  (leads/appts)`);
    for (const r of results) {
      console.log(`${r.uid.padEnd(30)} ${String(r.orphans).padStart(6)}  ${String(r.recent).padStart(8)}  ${String(r.recoverable).padStart(10)}  (${r.leads}/${r.appts})`);
    }
  } else {
    console.log(`No orphaned appointments found anywhere. ✅`);
  }
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
