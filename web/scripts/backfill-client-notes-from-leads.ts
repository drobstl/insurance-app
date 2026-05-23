#!/usr/bin/env npx tsx
/**
 * Backfill client.notes from the source lead.notes for clients that
 * were converted before the notes-carryover behavior shipped.
 *
 * Daniel asked for this as a nice-to-have for his own agent account —
 * he had meaningful notes content on leads that didn't carry over when
 * he converted them. New conversions copy notes automatically (see
 * web/app/api/leads/[leadId]/convert/route.ts); this script handles
 * the historical population.
 *
 * Safe to re-run. Idempotent: skips clients that already have notes.
 *
 * Defaults to dry-run. Pass `--apply` to actually write.
 *
 * Run from web/:
 *   node --import tsx ./scripts/backfill-client-notes-from-leads.ts \
 *     --agent <AGENT_ID> [--apply]
 */
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';

interface Args {
  agentId: string;
  apply: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const agentIdx = argv.indexOf('--agent');
  if (agentIdx === -1 || !argv[agentIdx + 1]) {
    console.error('Missing required --agent <AGENT_ID>');
    process.exit(2);
  }
  return {
    agentId: argv[agentIdx + 1],
    apply: argv.includes('--apply'),
  };
}

async function main() {
  const { agentId, apply } = parseArgs();
  const db = getAdminFirestore();

  console.log(`[backfill-notes] agent=${agentId} apply=${apply}`);

  const clientsSnap = await db
    .collection('agents').doc(agentId)
    .collection('clients')
    .get();

  let scanned = 0;
  let skippedNoLead = 0;
  let skippedAlreadyHas = 0;
  let skippedSourceEmpty = 0;
  let toUpdate = 0;
  let updated = 0;

  for (const clientDoc of clientsSnap.docs) {
    scanned++;
    const data = clientDoc.data();
    const leadId = typeof data.convertedFromLeadId === 'string' ? data.convertedFromLeadId : null;
    const existingNotes = typeof data.notes === 'string' ? data.notes.trim() : '';

    if (!leadId) {
      // Client wasn't converted from a lead (e.g. directly added).
      continue;
    }
    if (existingNotes.length > 0) {
      skippedAlreadyHas++;
      continue;
    }

    const leadSnap = await db
      .collection('agents').doc(agentId)
      .collection('leads').doc(leadId)
      .get();

    if (!leadSnap.exists) {
      skippedNoLead++;
      console.warn(`  ⚠ client ${clientDoc.id} (${data.name}) — source lead ${leadId} missing`);
      continue;
    }

    const leadData = leadSnap.data() ?? {};
    const sourceNotes = typeof leadData.notes === 'string' ? leadData.notes : '';

    if (!sourceNotes.trim()) {
      skippedSourceEmpty++;
      continue;
    }

    toUpdate++;
    console.log(`  → ${clientDoc.id} (${data.name}): ${sourceNotes.length} chars from lead ${leadId}`);

    if (apply) {
      await clientDoc.ref.update({
        notes: sourceNotes,
        notesUpdatedAt: Timestamp.now(),
        notesBackfilledFromLeadAt: Timestamp.now(),
      });
      updated++;
    }
  }

  console.log('');
  console.log(`Scanned:                ${scanned}`);
  console.log(`Skipped (no source lead): ${skippedNoLead}`);
  console.log(`Skipped (already had notes): ${skippedAlreadyHas}`);
  console.log(`Skipped (source lead notes empty): ${skippedSourceEmpty}`);
  console.log(`Eligible for backfill:  ${toUpdate}`);
  console.log(`Actually written:       ${updated}`);
  if (!apply && toUpdate > 0) {
    console.log('');
    console.log('Dry run — re-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error('[backfill-notes] failed:', err);
  process.exit(1);
});
