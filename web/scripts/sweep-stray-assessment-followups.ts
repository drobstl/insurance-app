#!/usr/bin/env npx tsx
/**
 * One-time cleanup: clear the stray follow-up that the assessment-completed
 * handler wrongly auto-set on leads (added in PR #259, reverted in PR #325).
 *
 * The bug: finishing the in-app assessment stamped
 *     followUpAt  = now
 *     followUpNote = 'Just finished the in-app assessment — reach out while warm'
 * onto the lead. But a lead can only take the in-app assessment AFTER the
 * agent has already reached them and handed over the app — so they're already
 * in conversation, often already booked (this surfaced on Philip Lawal, who
 * had an appointment that night). The flag is therefore always wrong.
 *
 * PR #325 stops writing it and hides it in the UI for booked/converted leads;
 * this script removes the rows the bug already wrote, so the stale field is
 * gone for good (and won't resurface if an appointment is later cancelled).
 *
 * SAFETY: targets ONLY leads whose followUpNote EXACTLY equals the bug string,
 * so it can never touch a follow-up an agent set by hand. It clears followUpAt
 * + followUpNote on each matching lead and nothing else.
 *
 * Default: DRY RUN — prints every affected lead, writes nothing.
 *   --apply   Actually clear followUpAt + followUpNote on the matches.
 *
 * Run from web/:
 *   node --require ./scripts/server-only-shim.cjs --import tsx \
 *     ./scripts/sweep-stray-assessment-followups.ts [--apply]
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

// The exact string the buggy handler wrote. Matching on this (not on
// followUpAt presence) is what makes the sweep safe: a manually-set follow-up
// has a different note (or none), so it is never a candidate.
const BUG_NOTE = 'Just finished the in-app assessment — reach out while warm';
const APPLY = process.argv.includes('--apply');

async function main() {
  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();
  console.log(`Scanning ${agentsSnap.size} agents for stray assessment follow-ups…\n`);

  let found = 0;
  let cleared = 0;
  for (const agent of agentsSnap.docs) {
    const leadsSnap = await agent.ref
      .collection('leads')
      .where('followUpNote', '==', BUG_NOTE)
      .get();
    if (leadsSnap.empty) continue;
    for (const lead of leadsSnap.docs) {
      found++;
      const d = lead.data();
      console.log(
        `  ${APPLY ? 'CLEAR     ' : 'WOULD CLEAR'}  agent=${agent.id}  lead=${lead.id}  name=${d.name ?? '(no name)'}  phone=${d.phone ?? '—'}`,
      );
      if (APPLY) {
        await lead.ref.update({
          followUpAt: FieldValue.delete(),
          followUpNote: FieldValue.delete(),
        });
        cleared++;
      }
    }
  }

  console.log('');
  console.log(`Affected leads: ${found}`);
  if (APPLY) {
    console.log(`Cleared: ${cleared}`);
  } else if (found > 0) {
    console.log('DRY RUN — nothing written. Re-run with --apply to clear these.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('sweep failed:', e);
  process.exit(1);
});
