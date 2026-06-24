#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Book-rate diagnostic — READ-ONLY.
 *
 * Answers "why is the Activity book rate over 100%" for one agent +
 * one range, by reproducing the getActivityStats counts and then
 * decomposing the booked-vs-contacts gap into its drivers:
 *
 *   1. The converted-lead DOUBLE-COUNT (booked/showed old vs fixed).
 *   2. Cross-month sold-padding (booked because sold-in-window even
 *      though the booking — and its 'booked' contact dial — was in a
 *      prior window, or there's no appointment doc at all).
 *   3. Bookings with NO in-window contact dial (lead deleted/merged,
 *      or booked through a path that didn't log a dial).
 *
 * Reproduces resolveRange + policySaleDateMillis from the real module
 * so the windowing matches the page exactly.
 *
 * Run from web/:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/diagnose-book-rate.ts --email=deardanielroberts@gmail.com --range=month
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore, getAdminAuth } from '../lib/firebase-admin';
import {
  resolveRange,
  policySaleDateMillis,
  type ActivityRange,
} from '../lib/activity-stats';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

// ── args ──
let email = 'deardanielroberts@gmail.com';
let uidArg: string | null = null;
let range: ActivityRange = 'month';
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--email=')) email = a.slice('--email='.length);
  else if (a.startsWith('--uid=')) uidArg = a.slice('--uid='.length);
  else if (a.startsWith('--range=')) range = a.slice('--range='.length) as ActivityRange;
}

const TRANSIENT = new Set(['no_answer', 'left_vm']);

function tsMillis(t: unknown): number | null {
  if (t && typeof t === 'object') {
    const anyT = t as { toMillis?: () => number; _seconds?: number };
    if (typeof anyT.toMillis === 'function') return anyT.toMillis();
    if (typeof anyT._seconds === 'number') return anyT._seconds * 1000;
  }
  return null;
}

async function main() {
  const db = getAdminFirestore();

  // Resolve uid.
  let uid = uidArg;
  if (!uid) {
    const user = await getAdminAuth().getUserByEmail(email);
    uid = user.uid;
  }
  const win = resolveRange(range);
  const fromMs = win.from.getTime();
  const toMs = win.to.getTime();
  console.log(`\n=== Book-rate diagnostic ===`);
  console.log(`agent uid : ${uid}${uidArg ? '' : `  (${email})`}`);
  console.log(`range     : ${range}  [${win.from.toISOString()} .. ${win.to.toISOString()})\n`);

  const agentRef = db.collection('agents').doc(uid);

  // ── Dials / contacts (+ in-window outcome breakdown) ──
  const leadsSnap = await agentRef.collection('leads').get();
  const leadsById = new Map<string, any>();
  let dials = 0;
  let contacts = 0;
  const byOutcome: Record<string, number> = {};
  // leadId -> does it have an in-window non-transient (contact) dial?
  const leadHasInWindowContact = new Map<string, boolean>();
  for (const d of leadsSnap.docs) {
    const data = d.data();
    leadsById.set(d.id, data);
    let hasContact = false;
    const log = Array.isArray(data.dialLog) ? data.dialLog : [];
    for (const e of log) {
      const ms = tsMillis(e?.at);
      if (ms === null || ms < fromMs || ms >= toMs) continue;
      dials += 1;
      byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1;
      if (!TRANSIENT.has(e.outcome)) { contacts += 1; hasContact = true; }
    }
    leadHasInWindowContact.set(d.id, hasContact);
  }

  // ── Appointments grouped per entity ──
  const apptsSnap = await agentRef.collection('appointments').get();
  const apptsByEntity = new Map<string, any[]>();
  for (const a of apptsSnap.docs) {
    const data = a.data();
    const entityId = data.leadId || data.clientId;
    if (!entityId) continue;
    (apptsByEntity.get(entityId) ?? apptsByEntity.set(entityId, []).get(entityId)!).push(data);
  }
  const entityAppts = new Map<string, { firstBookedMs: number; latestStatus: string }>();
  for (const [entityId, appts] of apptsByEntity) {
    const first = appts.map((a) => tsMillis(a.createdAt)).filter((m): m is number => m !== null)
      .reduce((min, m) => (m < min ? m : min), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(first)) continue;
    const latest = [...appts].sort((a, b) => (tsMillis(b.createdAt) ?? 0) - (tsMillis(a.createdAt) ?? 0))[0];
    entityAppts.set(entityId, { firstBookedMs: first, latestStatus: latest?.status || 'scheduled' });
  }

  // ── Sales walk ──
  const clientsSnap = await agentRef.collection('clients').get();
  const soldKeysCurr = new Set<string>();                       // both leadId + clientId
  const soldClients = new Map<string, { leadId: string | null }>(); // per-sale, clientId keyed
  let salesCount = 0;
  for (const c of clientsSnap.docs) {
    const cd = c.data();
    const apptKeyA: string | undefined = cd.convertedFromLeadId;
    const apptKeyB = c.id;
    const policies = await c.ref.collection('policies').get();
    for (const pdoc of policies.docs) {
      const p = pdoc.data();
      const saleMs = policySaleDateMillis(p);
      if (saleMs === null) continue;
      if (saleMs >= fromMs && saleMs < toMs) {
        salesCount += 1;
        if (apptKeyA) soldKeysCurr.add(apptKeyA);
        soldKeysCurr.add(apptKeyB);
        soldClients.set(apptKeyB, { leadId: apptKeyA || null });
      }
    }
  }

  // ── Reconcile: OLD (buggy) vs NEW (fixed) ──
  function reconcile(mode: 'old' | 'new') {
    let booked = 0, showed = 0, noShowed = 0;
    const accounted = new Set<string>();
    const bookedEntities: Array<{ id: string; via: string }> = [];
    for (const [entityId, info] of entityAppts) {
      const inCurr = info.firstBookedMs >= fromMs && info.firstBookedMs < toMs;
      const sold = soldKeysCurr.has(entityId);
      if (inCurr) {
        booked += 1; accounted.add(entityId); bookedEntities.push({ id: entityId, via: 'booked-in-window' });
        if (sold) showed += 1;
        else {
          const s = info.latestStatus;
          if (s === 'completed' || s === 'sit_no_sale' || s === 'sit_think_about_it') showed += 1;
          else if (s === 'no_show') noShowed += 1;
        }
      } else if (sold) {
        booked += 1; showed += 1; accounted.add(entityId);
        bookedEntities.push({ id: entityId, via: 'sold-cross-month(appt)' });
      }
    }
    if (mode === 'old') {
      for (const entityId of soldKeysCurr) {
        if (!accounted.has(entityId)) { booked += 1; showed += 1; bookedEntities.push({ id: entityId, via: 'sold-no-appt' }); }
      }
    } else {
      for (const [clientId, { leadId }] of soldClients) {
        if (accounted.has(clientId) || (leadId !== null && accounted.has(leadId))) continue;
        booked += 1; showed += 1; accounted.add(clientId);
        bookedEntities.push({ id: clientId, via: 'sold-no-appt' });
      }
    }
    return { booked, showed, noShowed, bookedEntities };
  }
  const oldR = reconcile('old');
  const newR = reconcile('new');

  // ── Decompose the NEW booked set vs contacts ──
  // For each booked entity, does it have an in-window contact dial on
  // its lead doc? (entityId is a leadId for appt entities; for
  // sold-no-appt clientId entities, map via the client's
  // convertedFromLeadId.)
  const clientConvFrom = new Map<string, string | undefined>();
  for (const c of clientsSnap.docs) clientConvFrom.set(c.id, c.data().convertedFromLeadId);
  let bookedWithContact = 0, bookedNoContactLeadExists = 0, bookedNoLeadDoc = 0;
  const noContactSamples: string[] = [];
  for (const be of newR.bookedEntities) {
    const leadId: string | undefined = leadsById.has(be.id) ? be.id : clientConvFrom.get(be.id);
    if (leadId && leadsById.has(leadId)) {
      if (leadHasInWindowContact.get(leadId)) bookedWithContact += 1;
      else { bookedNoContactLeadExists += 1; if (noContactSamples.length < 8) noContactSamples.push(`${be.via} lead=${leadId}`); }
    } else {
      bookedNoLeadDoc += 1;
      const appt = (apptsByEntity.get(be.id) || [])[0] || {};
      const info = entityAppts.get(be.id);
      const created = info ? new Date(info.firstBookedMs).toISOString().slice(0, 10) : '?';
      const sold = soldKeysCurr.has(be.id) ? ' SOLD' : '';
      if (noContactSamples.length < 20) noContactSamples.push(`no-lead-doc  name="${appt.leadName ?? '?'}"  status=${info?.latestStatus ?? '?'}  booked=${created}${sold}  leadId=${be.id}`);
    }
  }

  // ── Report ──
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');
  console.log(`DIALS / CONTACTS`);
  console.log(`  dials in window     : ${dials}`);
  console.log(`  contacts (non-transient): ${contacts}`);
  console.log(`  in-window outcomes  : ${JSON.stringify(byOutcome)}`);
  console.log(`  └ of which 'booked' : ${byOutcome['booked'] || 0}\n`);
  console.log(`SALES`);
  console.log(`  policies sold in window : ${salesCount}\n`);
  console.log(`BOOKED / SHOWED — old (buggy) vs new (fixed)`);
  console.log(`  booked  : ${oldR.booked}  ->  ${newR.booked}   (double-count removed: ${oldR.booked - newR.booked})`);
  console.log(`  showed  : ${oldR.showed}  ->  ${newR.showed}   (double-count removed: ${oldR.showed - newR.showed})`);
  console.log(`  book rate  old: ${pct(oldR.booked, contacts)}   new: ${pct(newR.booked, contacts)}`);
  console.log(`  show rate  old: ${pct(oldR.showed, oldR.showed + oldR.noShowed)}   new: ${pct(newR.showed, newR.showed + newR.noShowed)}\n`);
  console.log(`WHY new booked (${newR.booked}) STILL exceeds contacts (${contacts}):`);
  const viaCounts: Record<string, number> = {};
  for (const be of newR.bookedEntities) viaCounts[be.via] = (viaCounts[be.via] || 0) + 1;
  console.log(`  booked entity sources : ${JSON.stringify(viaCounts)}`);
  console.log(`  booked w/ in-window contact dial      : ${bookedWithContact}`);
  console.log(`  booked w/o contact dial (lead exists) : ${bookedNoContactLeadExists}`);
  console.log(`  booked w/o lead doc (deleted/merged)  : ${bookedNoLeadDoc}`);
  if (noContactSamples.length) {
    console.log(`  samples (no in-window contact):`);
    for (const s of noContactSamples) console.log(`    - ${s}`);
  }
  console.log(`\n(Reproduce check vs screenshot: dials=32 contacts=10 booked=16 showed=7 sales=2)\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
