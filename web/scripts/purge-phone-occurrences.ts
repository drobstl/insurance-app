#!/usr/bin/env npx tsx
/**
 * purge-phone-occurrences — DESTRUCTIVE (when --apply).
 *
 * Companion to find-phone-occurrences. Re-runs the same scan and deletes
 * every doc the inventory would surface. Beneficiary-array matches are
 * removed via filter-and-rewrite, not whole-policy deletion.
 *
 * **Never touches the top-level `agents/<agentId>` doc.** That's the
 * operator's account identity; their phone lives there legitimately as
 * their login + notification contact. Only subcollection data + cross-
 * agent contamination is purged.
 *
 * Modes:
 *   Default: DRY RUN — prints every write it would perform, no Firestore
 *   mutations.
 *   --apply: APPLY — performs the writes.
 *
 * Usage:
 *   # dry run first
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/purge-phone-occurrences.ts +13145551234
 *
 *   # then, if the plan looks right
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/purge-phone-occurrences.ts +13145551234 --apply
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

interface PendingDocDelete {
  kind: 'doc-delete';
  collection: string;
  path: string;
  reason: string;
}

interface PendingBeneficiaryRewrite {
  kind: 'beneficiary-rewrite';
  path: string;
  beforeCount: number;
  afterCount: number;
  removedNames: (string | null)[];
}

type PendingOp = PendingDocDelete | PendingBeneficiaryRewrite;

async function main() {
  const args = process.argv.slice(2);
  const rawPhone = args.find((a) => !a.startsWith('--'));
  const apply = args.includes('--apply');

  if (!rawPhone) {
    console.error('Usage: purge-phone-occurrences.ts <phone> [--apply]');
    process.exit(1);
  }

  const phone = normalizePhone(rawPhone);
  if (!isValidE164(phone)) {
    console.error(`Phone "${rawPhone}" did not normalize to a valid E.164 number (got "${phone}").`);
    process.exit(1);
  }

  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  purge-phone-occurrences — ${apply ? 'APPLY MODE' : 'DRY RUN'}`);
  console.log(`  phone: ${phone}`);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('');

  const db = getAdminFirestore();
  const ops: PendingOp[] = [];

  console.log('[0/5] Loading agents collection ...');
  const agentsSnap = await db.collection('agents').get();
  console.log(`       ${agentsSnap.size} agent(s) to scan.`);

  // 1) Client docs: delete the client doc when its phone matches.
  console.log('[1/5] Scanning clients per agent (phone field) ...');
  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await agentDoc.ref
      .collection('clients')
      .where('phone', '==', phone)
      .get();
    for (const doc of clientsSnap.docs) {
      ops.push({
        kind: 'doc-delete',
        collection: 'clients',
        path: doc.ref.path,
        reason: `client.phone == ${phone}`,
      });
    }
  }

  // 2) Referrals: delete the referral doc when its referralPhone matches.
  console.log('[2/5] Scanning referrals per agent (referralPhone field) ...');
  for (const agentDoc of agentsSnap.docs) {
    const referralsSnap = await agentDoc.ref
      .collection('referrals')
      .where('referralPhone', '==', phone)
      .get();
    for (const doc of referralsSnap.docs) {
      ops.push({
        kind: 'doc-delete',
        collection: 'referrals',
        path: doc.ref.path,
        reason: `referral.referralPhone == ${phone}`,
      });
    }
  }

  // 3) byPhone resolver entries: delete the entry doc entirely.
  //    Doc id is the E.164 phone so future welcomes re-create a clean
  //    entry with only the new placeholder.
  console.log('[3/5] Scanning byPhone resolver entries (collectionGroup, phoneE164 field) ...');
  const entriesSnap = await db
    .collectionGroup('entries')
    .where('phoneE164', '==', phone)
    .get();
  for (const doc of entriesSnap.docs) {
    ops.push({
      kind: 'doc-delete',
      collection: 'threadResolvers/byPhone/entries',
      path: doc.ref.path,
      reason: `byPhone entry.phoneE164 == ${phone} (clears stale threadIdCandidates)`,
    });
  }

  // 4) Policy beneficiaries: filter matching beneficiaries out of the
  //    array. We rewrite the array (don't delete the policy).
  console.log('[4/5] Scanning policy beneficiaries per agent ...');
  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await agentDoc.ref.collection('clients').get();
    for (const clientDoc of clientsSnap.docs) {
      const policiesSnap = await clientDoc.ref.collection('policies').get();
      for (const policyDoc of policiesSnap.docs) {
        const data = policyDoc.data() as Record<string, unknown>;
        const beneficiaries = Array.isArray(data.beneficiaries)
          ? (data.beneficiaries as Array<Record<string, unknown>>)
          : [];
        if (beneficiaries.length === 0) continue;
        const next = beneficiaries.filter(
          (b) => !(typeof b.phone === 'string' && normalizePhone(b.phone) === phone),
        );
        if (next.length === beneficiaries.length) continue;
        const removedNames = beneficiaries
          .filter((b) => typeof b.phone === 'string' && normalizePhone(b.phone) === phone)
          .map((b) => (typeof b.name === 'string' ? b.name : null));
        ops.push({
          kind: 'beneficiary-rewrite',
          path: policyDoc.ref.path,
          beforeCount: beneficiaries.length,
          afterCount: next.length,
          removedNames,
        });
      }
    }
  }

  // 5) Action items: delete each matching action item doc.
  console.log('[5/5] Scanning actionItems per agent (clientPhoneE164 field) ...');
  for (const agentDoc of agentsSnap.docs) {
    try {
      const actionItemsSnap = await agentDoc.ref
        .collection('actionItems')
        .where('clientPhoneE164', '==', phone)
        .get();
      for (const doc of actionItemsSnap.docs) {
        ops.push({
          kind: 'doc-delete',
          collection: 'actionItems',
          path: doc.ref.path,
          reason: `actionItem.clientPhoneE164 == ${phone}`,
        });
      }
    } catch {
      // Per-agent actionItems missing index — skip silently.
    }
  }

  // Also: leadInbox (per agent).
  for (const agentDoc of agentsSnap.docs) {
    try {
      const leadInboxSnap = await agentDoc.ref
        .collection('leadInbox')
        .where('fromPhoneE164', '==', phone)
        .get();
      for (const doc of leadInboxSnap.docs) {
        ops.push({
          kind: 'doc-delete',
          collection: 'leadInbox',
          path: doc.ref.path,
          reason: `leadInbox.fromPhoneE164 == ${phone}`,
        });
      }
    } catch {
      // skip
    }
  }

  // ── Plan ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`PLAN — ${ops.length} operation(s)`);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('');

  if (ops.length === 0) {
    console.log('No occurrences found. Nothing to purge.');
    return;
  }

  for (const op of ops) {
    if (op.kind === 'doc-delete') {
      console.log(`  DELETE  ${op.path}`);
      console.log(`          reason: ${op.reason}`);
    } else {
      console.log(`  REWRITE ${op.path}`);
      console.log(`          field: beneficiaries[]`);
      console.log(`          before: ${op.beforeCount}, after: ${op.afterCount}`);
      console.log(`          removed: ${op.removedNames.map((n) => n ?? '(unnamed)').join(', ')}`);
    }
    console.log('');
  }

  if (!apply) {
    console.log('══════════════════════════════════════════════════════════════════');
    console.log('  DRY RUN. No writes performed.');
    console.log('  Re-run with --apply to execute the plan above.');
    console.log('══════════════════════════════════════════════════════════════════');
    return;
  }

  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  APPLYING ...');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('');

  let applied = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      if (op.kind === 'doc-delete') {
        await db.doc(op.path).delete();
        console.log(`  ✓ deleted: ${op.path}`);
      } else {
        const docRef = db.doc(op.path);
        const snap = await docRef.get();
        if (!snap.exists) {
          console.log(`  ⚠ skipped (doc no longer exists): ${op.path}`);
          continue;
        }
        const data = snap.data() as Record<string, unknown>;
        const beneficiaries = Array.isArray(data.beneficiaries)
          ? (data.beneficiaries as Array<Record<string, unknown>>)
          : [];
        const next = beneficiaries.filter(
          (b) => !(typeof b.phone === 'string' && normalizePhone(b.phone) === phone),
        );
        await docRef.update({ beneficiaries: next });
        console.log(`  ✓ rewrote beneficiaries on: ${op.path}`);
      }
      applied++;
    } catch (e) {
      console.log(`  ✗ FAILED on ${op.path}: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  Done. Applied: ${applied}, failed: ${failed}, planned: ${ops.length}.`);
  console.log('══════════════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('purge-phone-occurrences failed:', err);
  process.exit(1);
});
