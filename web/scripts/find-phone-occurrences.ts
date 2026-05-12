#!/usr/bin/env npx tsx
/**
 * find-phone-occurrences — READ-ONLY.
 *
 * Sweeps Firestore for every doc that contains the given phone number
 * across the agent-scoped collections that matter for client + welcome +
 * referral data integrity. Prints a structured inventory so the operator
 * can decide what to delete / null.
 *
 * Companion to purge-phone-occurrences.ts (separate script — only written
 * after the inventory has been reviewed). This script never writes.
 *
 * Why it exists: when the same phone appears across multiple client docs
 * (e.g., an agent uses their own phone for testing), the byPhone resolver
 * entry accumulates stale `welcome_pending_<id>` placeholders in its
 * `threadIdCandidates` array. The welcome-activation candidate finder
 * picks the first placeholder it iterates over — which can be a stale one
 * pointing to a different client whose `clientActivatedAt` is still unset.
 * The fix is data hygiene: get the phone out of the system, leaving a
 * clean slate.
 *
 * Usage:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/find-phone-occurrences.ts +13145551234
 *
 * Argument: a single phone number. Accepts US-style formatting; will be
 * normalized to E.164 before scanning.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../lib/phone';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

interface Finding {
  collection: string;
  path: string;
  field: string;
  value: string;
  context?: Record<string, unknown>;
}

function pathSegments(docPath: string): { agentId: string | null; clientId: string | null } {
  const parts = docPath.split('/');
  const agentIdx = parts.indexOf('agents');
  const clientIdx = parts.indexOf('clients');
  return {
    agentId: agentIdx >= 0 ? parts[agentIdx + 1] ?? null : null,
    clientId: clientIdx >= 0 ? parts[clientIdx + 1] ?? null : null,
  };
}

async function main() {
  const rawPhone = process.argv[2];
  if (!rawPhone) {
    console.error('Usage: find-phone-occurrences.ts <phone>');
    console.error('Example: find-phone-occurrences.ts +13145551234');
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone);
  if (!isValidE164(phone)) {
    console.error(`Phone "${rawPhone}" did not normalize to a valid E.164 number (got "${phone}").`);
    process.exit(1);
  }

  console.log(`\nScanning Firestore for occurrences of phone: ${phone}\n`);

  const db = getAdminFirestore();
  const findings: Finding[] = [];

  // Iterate top-level agents collection rather than using collectionGroup
  // queries on subcollections — avoids needing additional collectionGroup
  // indexes beyond the entries/phoneE164 one already deployed.
  console.log('[0/6] Loading agents collection ...');
  const agentsSnap = await db.collection('agents').get();
  console.log(`       ${agentsSnap.size} agent(s) to scan.`);

  // 1) Client docs: agents/*/clients/* where phone == E.164
  console.log('[1/6] Scanning clients per agent (phone field) ...');
  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await agentDoc.ref
      .collection('clients')
      .where('phone', '==', phone)
      .get();
    for (const doc of clientsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      findings.push({
        collection: 'clients',
        path: doc.ref.path,
        field: 'phone',
        value: phone,
        context: {
          name: data.name ?? null,
          clientCode: data.clientCode ?? null,
          clientActivatedAt: data.clientActivatedAt ? 'set' : 'unset',
          createdAt: data.createdAt ?? null,
        },
      });
    }
  }

  // 2) Referrals: agents/*/referrals/* where referralPhone == E.164
  console.log('[2/6] Scanning referrals per agent (referralPhone field) ...');
  for (const agentDoc of agentsSnap.docs) {
    const referralsSnap = await agentDoc.ref
      .collection('referrals')
      .where('referralPhone', '==', phone)
      .get();
    for (const doc of referralsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      findings.push({
        collection: 'referrals',
        path: doc.ref.path,
        field: 'referralPhone',
        value: phone,
        context: {
          referralName: data.referralName ?? null,
          status: data.status ?? null,
          createdAt: data.createdAt ?? null,
        },
      });
    }
  }

  // 3) byPhone resolver entries:
  //    agents/*/threadResolvers/byPhone/entries/<phoneE164>
  //    Doc id IS the phone; field phoneE164 also stores it.
  console.log('[3/6] Scanning byPhone resolver entries (collectionGroup, phoneE164 field) ...');
  const entriesSnap = await db
    .collectionGroup('entries')
    .where('phoneE164', '==', phone)
    .get();
  for (const doc of entriesSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    findings.push({
      collection: 'threadResolvers/byPhone/entries',
      path: doc.ref.path,
      field: 'phoneE164',
      value: phone,
      context: {
        latestThreadId: data.latestThreadId ?? null,
        threadIdCandidatesCount: Array.isArray(data.threadIdCandidates)
          ? data.threadIdCandidates.length
          : 0,
        threadIdCandidates: data.threadIdCandidates ?? null,
        updatedAt: data.updatedAt ?? null,
      },
    });
  }

  // 4) Policies / beneficiaries: walk each client under each agent and
  //    scan the beneficiaries array on each policy. Slower than a
  //    collectionGroup filter, but no index required.
  console.log('[4/6] Scanning policies for beneficiary phones per agent ...');
  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await agentDoc.ref.collection('clients').get();
    for (const clientDoc of clientsSnap.docs) {
      const policiesSnap = await clientDoc.ref.collection('policies').get();
      for (const doc of policiesSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const beneficiaries = Array.isArray(data.beneficiaries)
          ? (data.beneficiaries as Array<Record<string, unknown>>)
          : [];
        const matched = beneficiaries.filter(
          (b) => typeof b.phone === 'string' && normalizePhone(b.phone) === phone,
        );
        if (matched.length === 0) continue;
        findings.push({
          collection: 'policies (beneficiary phone)',
          path: doc.ref.path,
          field: `beneficiaries[].phone (x${matched.length})`,
          value: phone,
          context: {
            beneficiaryNames: matched.map((b) => b.name ?? null),
            policyType: data.policyType ?? null,
          },
        });
      }
    }
  }

  // 5) Action items: scan per agent for clientPhoneE164 matches.
  console.log('[5/6] Scanning actionItems per agent (clientPhoneE164 field) ...');
  for (const agentDoc of agentsSnap.docs) {
    try {
      const actionItemsSnap = await agentDoc.ref
        .collection('actionItems')
        .where('clientPhoneE164', '==', phone)
        .get();
      for (const doc of actionItemsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        findings.push({
          collection: 'actionItems',
          path: doc.ref.path,
          field: 'clientPhoneE164',
          value: phone,
          context: {
            lane: data.lane ?? null,
            status: data.status ?? null,
            clientId: data.clientId ?? null,
          },
        });
      }
    } catch {
      // Per-agent actionItems missing index — skip silently.
    }
  }

  // 6) leadInbox: inbound leads may contain the sender phone (per agent).
  console.log('[6/6] Scanning leadInbox per agent (fromPhoneE164 field) ...');
  for (const agentDoc of agentsSnap.docs) {
    try {
      const leadInboxSnap = await agentDoc.ref
        .collection('leadInbox')
        .where('fromPhoneE164', '==', phone)
        .get();
      for (const doc of leadInboxSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        findings.push({
          collection: 'leadInbox',
          path: doc.ref.path,
          field: 'fromPhoneE164',
          value: phone,
          context: {
            body: typeof data.body === 'string' ? data.body.slice(0, 80) : null,
            createdAt: data.createdAt ?? null,
          },
        });
      }
    } catch {
      // Per-agent leadInbox missing — skip silently.
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`FINDINGS — ${findings.length} document(s) reference ${phone}`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  const byCollection: Record<string, Finding[]> = {};
  for (const f of findings) {
    (byCollection[f.collection] ??= []).push(f);
  }

  for (const [collection, items] of Object.entries(byCollection)) {
    console.log(`── ${collection} (${items.length}) ──`);
    for (const item of items) {
      console.log(`  ${item.path}`);
      console.log(`    field: ${item.field}`);
      if (item.context) {
        for (const [k, v] of Object.entries(item.context)) {
          const display = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
          console.log(`    ${k}: ${display}`);
        }
      }
      console.log('');
    }
  }

  console.log('══════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  for (const [collection, items] of Object.entries(byCollection)) {
    console.log(`  ${collection.padEnd(40)} ${items.length}`);
  }
  console.log(`  ${'TOTAL'.padEnd(40)} ${findings.length}`);
  console.log('');
  console.log('READ-ONLY scan complete. No writes performed.');
  console.log('Review the inventory above before running any cleanup.');
  console.log('');
}

main().catch((err) => {
  console.error('find-phone-occurrences failed:', err);
  process.exit(1);
});
