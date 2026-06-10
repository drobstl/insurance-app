#!/usr/bin/env npx tsx
/**
 * audit-lead-code-collisions — READ-ONLY.
 *
 * Diagnoses why leads carry a random `L…` fallback code instead of the
 * intended phone-derived code. Sweeps every agent's leads, classifies each
 * by the SHAPE of its stored leadCode (ground truth, independent of the
 * stored codeKind field), and for every fallback lead determines the
 * current state of the phone it *would* have derived to:
 *
 *   FREE              leadCodes/{phone} does not exist → phone is available;
 *                     a re-upload / re-derive would now produce the phone code.
 *   CLAIMED (live)    leadCodes/{phone} exists and its owner lead still
 *                     exists → genuine cross-agent collision is still active.
 *   ORPHANED          leadCodes/{phone} exists but its owner lead is gone →
 *                     a delete didn't clean up the index (phone "burned").
 *   NO-PHONE          phone missing / <10 digits → fallback was unavoidable
 *                     (not a collision).
 *
 * This pins down Daniel's "did I delete the test-account leads before or
 * after uploading here?" question: if the phones read FREE, the test leads
 * were deleted and cleanup worked (the 38 are merely stranded, easily
 * re-derived); if CLAIMED, the colliding owner agent is printed; if
 * ORPHANED, there's a cleanup bug to fix first.
 *
 * Companion to the lead-code scheme in:
 *   - web/lib/lead-code-derive.ts        (deriveLeadCode)
 *   - web/lib/lead-dedup.ts              (collision → fallback resolution)
 *
 * Usage:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/audit-lead-code-collisions.ts
 *
 * NEVER writes. Pure reads.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { deriveLeadCode } from '../lib/lead-code-derive';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

type CodeShape = 'derived' | 'fallback' | 'other' | 'none';

function classifyCode(code: unknown): CodeShape {
  if (typeof code !== 'string' || code.length === 0) return 'none';
  if (/^\d{10}$/.test(code)) return 'derived';
  if (code.length === 8 && code.startsWith('L')) return 'fallback';
  return 'other';
}

type PhoneState = 'FREE' | 'CLAIMED' | 'ORPHANED' | 'NO-PHONE';

interface FallbackFinding {
  agentId: string;
  leadId: string;
  name: string;
  phone: string;
  fallbackCode: string;
  derivedCode: string | null;
  phoneState: PhoneState;
  ownerAgentId?: string | null; // for CLAIMED / ORPHANED
  ownerLeadId?: string | null;
}

async function main() {
  const db = getAdminFirestore();

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('LEAD-CODE COLLISION AUDIT  (READ-ONLY)');
  console.log('══════════════════════════════════════════════════════════════════\n');

  console.log('[1/3] Loading agents ...');
  const agentsSnap = await db.collection('agents').get();
  console.log(`      ${agentsSnap.size} agent(s).\n`);

  // Per-agent tally of code shapes + the fallback leads we need to analyze.
  const perAgent: Record<
    string,
    { derived: number; fallback: number; other: number; none: number; fallbackLeads: Array<{ leadId: string; name: string; phone: string; code: string }> }
  > = {};

  console.log('[2/3] Classifying every lead by code shape ...');
  for (const agentDoc of agentsSnap.docs) {
    const leadsSnap = await agentDoc.ref.collection('leads').get();
    const bucket = { derived: 0, fallback: 0, other: 0, none: 0, fallbackLeads: [] as Array<{ leadId: string; name: string; phone: string; code: string }> };
    for (const leadDoc of leadsSnap.docs) {
      const data = leadDoc.data() as Record<string, unknown>;
      const shape = classifyCode(data.leadCode);
      bucket[shape]++;
      if (shape === 'fallback') {
        bucket.fallbackLeads.push({
          leadId: leadDoc.id,
          name: typeof data.name === 'string' ? data.name : '(no name)',
          phone: typeof data.phone === 'string' ? data.phone : '',
          code: data.leadCode as string,
        });
      }
    }
    if (leadsSnap.size > 0) perAgent[agentDoc.id] = bucket;
  }

  // Collision analysis for every fallback lead.
  console.log('[3/3] Resolving phone state for each fallback lead ...\n');
  const findings: FallbackFinding[] = [];
  // Cache index-doc lookups so shared phones aren't read twice.
  const indexCache = new Map<string, { agentId?: string; leadId?: string } | null>();

  for (const [agentId, bucket] of Object.entries(perAgent)) {
    for (const fl of bucket.fallbackLeads) {
      const derived = deriveLeadCode(fl.phone);
      if (!derived) {
        findings.push({
          agentId, leadId: fl.leadId, name: fl.name, phone: fl.phone,
          fallbackCode: fl.code, derivedCode: null, phoneState: 'NO-PHONE',
        });
        continue;
      }

      let indexData = indexCache.get(derived);
      if (indexData === undefined) {
        const idxSnap = await db.collection('leadCodes').doc(derived).get();
        indexData = idxSnap.exists ? (idxSnap.data() as { agentId?: string; leadId?: string }) : null;
        indexCache.set(derived, indexData);
      }

      if (!indexData) {
        findings.push({
          agentId, leadId: fl.leadId, name: fl.name, phone: fl.phone,
          fallbackCode: fl.code, derivedCode: derived, phoneState: 'FREE',
        });
        continue;
      }

      // Index doc exists — does its owner lead still exist?
      let ownerExists = false;
      if (indexData.agentId && indexData.leadId) {
        const ownerSnap = await db
          .collection('agents').doc(indexData.agentId)
          .collection('leads').doc(indexData.leadId)
          .get();
        ownerExists = ownerSnap.exists;
      }
      findings.push({
        agentId, leadId: fl.leadId, name: fl.name, phone: fl.phone,
        fallbackCode: fl.code, derivedCode: derived,
        phoneState: ownerExists ? 'CLAIMED' : 'ORPHANED',
        ownerAgentId: indexData.agentId ?? null,
        ownerLeadId: indexData.leadId ?? null,
      });
    }
  }

  // ── Report ──
  console.log('── Per-agent code-shape tally ──');
  for (const [agentId, b] of Object.entries(perAgent)) {
    console.log(`  agent ${agentId}`);
    console.log(`    derived(phone): ${b.derived}   fallback(L…): ${b.fallback}   other: ${b.other}   none: ${b.none}`);
  }
  console.log('');

  if (findings.length === 0) {
    console.log('No fallback-coded leads found anywhere. Nothing to diagnose.\n');
    console.log('READ-ONLY scan complete. No writes performed.\n');
    return;
  }

  const byState: Record<PhoneState, FallbackFinding[]> = { FREE: [], CLAIMED: [], ORPHANED: [], 'NO-PHONE': [] };
  for (const f of findings) byState[f.phoneState].push(f);

  console.log('── Fallback-lead phone state ──');
  for (const state of ['FREE', 'CLAIMED', 'ORPHANED', 'NO-PHONE'] as PhoneState[]) {
    const items = byState[state];
    console.log(`\n  ${state}  (${items.length})`);
    for (const f of items) {
      const owner = f.ownerAgentId ? `  ← owned by agent ${f.ownerAgentId} / lead ${f.ownerLeadId}` : '';
      console.log(`    ${f.name.padEnd(22)} phone=${f.phone || '(none)'}  code=${f.fallbackCode}  →phone-code=${f.derivedCode ?? '—'}${owner}`);
    }
  }

  // Owners of CLAIMED codes — reveals the test account(s) still holding phones.
  const claimOwners = new Map<string, number>();
  for (const f of byState.CLAIMED) {
    if (f.ownerAgentId) claimOwners.set(f.ownerAgentId, (claimOwners.get(f.ownerAgentId) ?? 0) + 1);
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  fallback leads analyzed: ${findings.length}`);
  console.log(`    FREE      (phone available, re-derive would fix): ${byState.FREE.length}`);
  console.log(`    CLAIMED   (still colliding with a LIVE lead):      ${byState.CLAIMED.length}`);
  console.log(`    ORPHANED  (index points at a DELETED lead):        ${byState.ORPHANED.length}`);
  console.log(`    NO-PHONE  (no valid 10-digit phone at creation):   ${byState['NO-PHONE'].length}`);
  if (claimOwners.size > 0) {
    console.log('\n  CLAIMED phones are held by these agent(s):');
    for (const [aid, n] of claimOwners) console.log(`    agent ${aid}: ${n} phone(s)`);
  }
  console.log('\nREAD-ONLY scan complete. No writes performed.\n');
}

main().catch((err) => {
  console.error('audit-lead-code-collisions failed:', err);
  process.exit(1);
});
