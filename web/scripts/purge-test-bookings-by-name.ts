#!/usr/bin/env npx tsx
/**
 * Purge test bookings (and optionally the leads themselves) by exact
 * lead-name match. Built for cleaning up dev-test bookings on REAL
 * leads — `purge-fake-bookings.ts` assumes leads have zero dial
 * activity, which doesn't apply here since these are leads with real
 * dial history that just happen to have test bookings on them.
 *
 * For each lead matched by name:
 *   - Find every appointment in `agents/{id}/appointments` where
 *     `leadId === <this lead>.id` and delete it.
 *   - On the lead's `dialLog`, remove every entry whose
 *     `outcome === 'booked'` and whose `at` is within 5 seconds of
 *     a deleted appointment's `createdAt`. That precisely targets
 *     the auto-created dial entries from the booking endpoint
 *     without touching unrelated history.
 *   - Recompute `lastDialAt` + `lastDialOutcome` from the most recent
 *     remaining dial entry. If no entries remain, clear both fields.
 *   - If the lead's name is also passed via `--delete-leads`, delete
 *     the lead doc itself after the appointments are removed.
 *
 * Default: dry-run (lists everything that WOULD happen, writes nothing).
 * Pass `--apply` to actually delete.
 *
 * Required:
 *   --agent-email=<email>             Scope to one agent.
 *   --names=<name1,name2,...>         Leads whose appointments to wipe.
 *
 * Optional:
 *   --delete-leads=<name1,name2,...>  Subset of --names whose lead docs
 *                                     to also delete. Must be a strict
 *                                     subset of --names.
 *   --apply                           Actually write.
 *
 * Run:
 *   npm run purge:test-bookings -- \
 *     --agent-email=you@example.com \
 *     --names="Dewey Jeffcoat,Anita Gray,Tina Jones,Aaron Warren,Michael Hamilton,Test testing" \
 *     --delete-leads="Test testing"
 *
 * Add --apply when ready.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../lib/firebase-admin';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

interface Args {
  agentEmail: string;
  names: string[];
  deleteLeadNames: Set<string>;
  apply: boolean;
}

function parseArgs(): Args {
  const args: Args = {
    agentEmail: '',
    names: [],
    deleteLeadNames: new Set(),
    apply: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--agent-email=')) {
      args.agentEmail = arg.slice('--agent-email='.length).toLowerCase();
    } else if (arg.startsWith('--names=')) {
      args.names = arg
        .slice('--names='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--delete-leads=')) {
      const names = arg
        .slice('--delete-leads='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const n of names) args.deleteLeadNames.add(n.toLowerCase());
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: purge-test-bookings-by-name.ts --agent-email=<email> --names=<csv> [--delete-leads=<csv>] [--apply]',
      );
      process.exit(0);
    }
  }
  return args;
}

function tsToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

interface DialEntry {
  at?: unknown;
  outcome?: string;
  notes?: string;
  [k: string]: unknown;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.agentEmail) {
    console.error('--agent-email is required. Run with --help for usage.');
    process.exit(1);
  }
  if (args.names.length === 0) {
    console.error('--names is required (comma-separated lead names).');
    process.exit(1);
  }
  for (const n of args.deleteLeadNames) {
    const matches = args.names.some((listed) => listed.toLowerCase() === n);
    if (!matches) {
      console.error(`--delete-leads name "${n}" is not in --names. Refusing to run.`);
      process.exit(1);
    }
  }

  const db = getAdminFirestore();
  const agentsSnap = await db
    .collection('agents')
    .where('email', '==', args.agentEmail)
    .get();
  if (agentsSnap.empty) {
    console.error(`No agent found with email ${args.agentEmail}.`);
    process.exit(1);
  }
  if (agentsSnap.docs.length > 1) {
    console.error(`More than one agent matches ${args.agentEmail}. Refusing to guess.`);
    process.exit(1);
  }
  const agentDoc = agentsSnap.docs[0];
  const agentId = agentDoc.id;

  console.log(`Agent: ${args.agentEmail} (${agentId})`);
  console.log(`Mode:  ${args.apply ? 'APPLY (deletes will happen)' : 'DRY RUN (no writes)'}`);
  console.log(`Names: ${args.names.join(', ')}`);
  if (args.deleteLeadNames.size > 0) {
    console.log(`Delete leads: ${[...args.deleteLeadNames].join(', ')}`);
  }
  console.log('');

  for (const name of args.names) {
    const nameLower = name.toLowerCase();
    const shouldDeleteLead = args.deleteLeadNames.has(nameLower);

    // Match leads where name field equals the requested name. Case-
    // insensitive comparison via fetching all then filtering — the
    // leads collection per agent is small (few hundred max in
    // production reality), and Firestore doesn't support
    // case-insensitive equality queries natively.
    const leadsSnap = await db
      .collection('agents').doc(agentId)
      .collection('leads')
      .get();
    const matchingLeads = leadsSnap.docs.filter((d) => {
      const data = d.data() as { name?: string };
      return typeof data.name === 'string' && data.name.trim().toLowerCase() === nameLower;
    });

    if (matchingLeads.length === 0) {
      console.log(`[${name}] no matching lead found.`);
      continue;
    }
    if (matchingLeads.length > 1) {
      console.log(`[${name}] ${matchingLeads.length} leads share this exact name — operating on ALL of them.`);
    }

    for (const leadDoc of matchingLeads) {
      const leadData = leadDoc.data() as { name?: string; dialLog?: DialEntry[] };
      const leadId = leadDoc.id;
      console.log(`[${name}] lead ${leadId}`);

      // Find appointments
      const apptsSnap = await db
        .collection('agents').doc(agentId)
        .collection('appointments')
        .where('leadId', '==', leadId)
        .get();
      if (apptsSnap.empty) {
        console.log(`  no appointments.`);
      } else {
        console.log(`  ${apptsSnap.size} appointment(s) to delete:`);
        for (const a of apptsSnap.docs) {
          const d = a.data() as { scheduledAt?: unknown; status?: string; createdAt?: unknown };
          const sMs = tsToMillis(d.scheduledAt);
          const sIso = sMs !== null ? new Date(sMs).toISOString() : '(no scheduled)';
          console.log(`    ${a.id}  scheduled=${sIso}  status=${d.status ?? 'unknown'}`);
        }
      }

      // Compute which dialLog entries to drop: any 'booked' entries
      // whose `at` is within 5 seconds of one of the appointments'
      // createdAt. That's how the booking endpoint orchestrates them.
      const apptCreatedTimestamps = apptsSnap.docs
        .map((a) => tsToMillis((a.data() as { createdAt?: unknown }).createdAt))
        .filter((ms): ms is number => ms !== null);
      const dialLog = Array.isArray(leadData.dialLog) ? leadData.dialLog : [];
      const survivingDialEntries: DialEntry[] = [];
      const droppedDialEntries: DialEntry[] = [];
      for (const entry of dialLog) {
        const atMs = tsToMillis(entry.at);
        const isBooked = entry.outcome === 'booked';
        const matchesAppt = atMs !== null && apptCreatedTimestamps.some(
          (apptMs) => Math.abs(apptMs - atMs) < 5000,
        );
        if (isBooked && matchesAppt) {
          droppedDialEntries.push(entry);
        } else {
          survivingDialEntries.push(entry);
        }
      }
      if (droppedDialEntries.length > 0) {
        console.log(`  ${droppedDialEntries.length} dial-log entr(y/ies) to drop (auto-logged booked outcomes).`);
      }

      // What we'd do
      if (shouldDeleteLead) {
        console.log(`  LEAD WILL BE DELETED.`);
      }

      if (!args.apply) {
        continue;
      }

      // Apply
      for (const a of apptsSnap.docs) {
        await a.ref.delete();
        console.log(`    ✓ deleted appointment ${a.id}`);
      }

      if (droppedDialEntries.length > 0) {
        // Recompute lastDial fields from the most recent surviving entry.
        const sorted = [...survivingDialEntries].sort((a, b) => {
          const aMs = tsToMillis(a.at) ?? 0;
          const bMs = tsToMillis(b.at) ?? 0;
          return bMs - aMs;
        });
        const newest = sorted[0];
        const update: Record<string, unknown> = {
          dialLog: survivingDialEntries,
        };
        if (newest) {
          update.lastDialAt = newest.at ?? null;
          update.lastDialOutcome = newest.outcome ?? null;
        } else {
          update.lastDialAt = FieldValue.delete();
          update.lastDialOutcome = FieldValue.delete();
        }
        await leadDoc.ref.update(update);
        console.log(`    ✓ pruned ${droppedDialEntries.length} dial-log entr(y/ies)`);
      }

      if (shouldDeleteLead) {
        await leadDoc.ref.delete();
        console.log(`    ✓ DELETED lead ${leadId}`);
      }
    }
    console.log('');
  }

  if (!args.apply) {
    console.log('Dry run complete. Re-run with --apply to actually execute.');
  } else {
    console.log('Done.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
