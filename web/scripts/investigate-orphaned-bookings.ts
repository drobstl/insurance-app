#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Orphaned-booking investigation — READ-ONLY.
 *
 * An "orphaned" appointment is one whose `leadId` no longer points at a
 * lead doc. Because POST /api/leads/[leadId]/appointments 404s unless the
 * lead exists, every such lead DID exist when booked and was deleted
 * afterward. This classifies HOW it vanished:
 *
 *   - converted    : a client has convertedFromLeadId === the dead leadId
 *                    (lead → client; lead doc should have survived — if it
 *                    didn't, something deleted it post-convert)
 *   - survivor-lead: a current lead shares the same phone code (deriveLeadCode)
 *                    under a DIFFERENT id  → re-import / dedup delete+recreate
 *   - survivor-client: a client shares the same phone → converted under a
 *                    different lead, or re-added as a client
 *   - gone         : no trace anywhere → hard delete, never re-added
 *
 * Run from web/:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/investigate-orphaned-bookings.ts --uid=1sRAF3Kq6shiNtabbPOCRO2VFC93
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { deriveLeadCode } from '../lib/lead-code-derive';

for (const envFile of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

let uid = '1sRAF3Kq6shiNtabbPOCRO2VFC93';
for (const a of process.argv.slice(2)) if (a.startsWith('--uid=')) uid = a.slice('--uid='.length);

function tsMillis(t: any): number | null {
  if (t && typeof t === 'object') {
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t._seconds === 'number') return t._seconds * 1000;
  }
  return null;
}
const ymd = (ms: number | null) => (ms === null ? '?' : new Date(ms).toISOString().slice(0, 10));

async function main() {
  const db = getAdminFirestore();
  const agentRef = db.collection('agents').doc(uid);

  const [leadsSnap, clientsSnap, apptsSnap] = await Promise.all([
    agentRef.collection('leads').get(),
    agentRef.collection('clients').get(),
    agentRef.collection('appointments').get(),
  ]);

  const leadIds = new Set<string>();
  const leadCodeToId = new Map<string, string>(); // deriveLeadCode(phone) -> current leadId
  for (const d of leadsSnap.docs) {
    leadIds.add(d.id);
    const phone = d.data().phone;
    const code = typeof phone === 'string' ? deriveLeadCode(phone) : null;
    if (code && !leadCodeToId.has(code)) leadCodeToId.set(code, d.id);
  }
  const convertedFrom = new Map<string, string>(); // dead leadId -> clientId
  const clientCodeToId = new Map<string, string>();
  for (const c of clientsSnap.docs) {
    const cd = c.data();
    if (typeof cd.convertedFromLeadId === 'string') convertedFrom.set(cd.convertedFromLeadId, c.id);
    const code = typeof cd.phone === 'string' ? deriveLeadCode(cd.phone) : null;
    if (code && !clientCodeToId.has(code)) clientCodeToId.set(code, c.id);
  }

  // Orphaned appts = leadId set, but no current lead doc with that id.
  const orphans: Array<{ leadId: string; name: string; phone: string; status: string; createdMs: number | null }> = [];
  for (const a of apptsSnap.docs) {
    const data = a.data();
    const leadId = data.leadId;
    if (typeof leadId !== 'string' || !leadId) continue;
    if (leadIds.has(leadId)) continue; // lead still exists — not orphaned
    orphans.push({
      leadId,
      name: data.leadName ?? '?',
      phone: typeof data.leadPhone === 'string' ? data.leadPhone : '',
      status: data.status ?? '?',
      createdMs: tsMillis(data.createdAt),
    });
  }
  orphans.sort((a, b) => (b.createdMs ?? 0) - (a.createdMs ?? 0));

  const cls = { converted: 0, 'survivor-lead': 0, 'survivor-client': 0, gone: 0 } as Record<string, number>;
  console.log(`\n=== Orphaned bookings for uid ${uid} ===`);
  console.log(`leads=${leadsSnap.size} clients=${clientsSnap.size} appointments=${apptsSnap.size}`);
  console.log(`orphaned appointments (leadId has no lead doc): ${orphans.length}\n`);
  console.log(`booked    status               name / classification`);
  for (const o of orphans) {
    const code = o.phone ? deriveLeadCode(o.phone) : null;
    let kind: string;
    let detail = '';
    if (convertedFrom.has(o.leadId)) { kind = 'converted'; detail = `client=${convertedFrom.get(o.leadId)}`; }
    else if (code && leadCodeToId.has(code)) { kind = 'survivor-lead'; detail = `survivingLead=${leadCodeToId.get(code)}`; }
    else if (code && clientCodeToId.has(code)) { kind = 'survivor-client'; detail = `client=${clientCodeToId.get(code)}`; }
    else kind = 'gone';
    cls[kind] += 1;
    console.log(`${ymd(o.createdMs)}  ${o.status.padEnd(18)}  ${o.name.padEnd(22)} ${kind}${detail ? '  ' + detail : ''}`);
  }
  console.log(`\nclassification: ${JSON.stringify(cls)}`);

  // For survivor-lead orphans: what did the recreated lead lose? Compare
  // the survivor's createdAt to the booking date and check its dial history.
  console.log(`\n--- survivor leads: created when, history intact? ---`);
  for (const o of orphans) {
    const code = o.phone ? deriveLeadCode(o.phone) : null;
    const survId = code ? leadCodeToId.get(code) : undefined;
    if (!survId) continue;
    const s = await agentRef.collection('leads').doc(survId).get();
    const sd = s.data() || {};
    const created = tsMillis(sd.createdAt);
    const dialLog = Array.isArray(sd.dialLog) ? sd.dialLog : [];
    const bookedDials = dialLog.filter((e: any) => e?.outcome === 'booked').length;
    console.log(`${o.name.padEnd(22)} appt booked ${ymd(o.createdMs)} | survivor created ${ymd(created)} | dialLog=${dialLog.length} (booked=${bookedDials}) | name="${sd.name ?? '?'}"`);
  }
  const monthMs = Date.UTC(2026, 5, 1);
  const thisMonth = orphans.filter((o) => (o.createdMs ?? 0) >= monthMs).length;
  console.log(`orphans booked this month (Jun): ${thisMonth} of ${orphans.length} total\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
