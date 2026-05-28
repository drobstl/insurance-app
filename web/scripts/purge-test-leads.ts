#!/usr/bin/env npx tsx
/**
 * Purge appointments tied to explicitly-named test leads.
 *
 * Companion to `purge-fake-bookings.ts`. That script uses a heuristic
 * (lead has zero dial entries → booking is fake). This script trusts
 * the operator: "these named leads are test data, delete all their
 * appointments." Useful when the operator dialed a test lead once
 * (passing the dial-log heuristic) but still wants the bookings gone.
 *
 * Only appointments are deleted — the lead docs themselves are left
 * intact. Deleting the lead doc would orphan downstream artifacts
 * (action items, conversations, etc.) and isn't what we need to fix
 * the activity dashboard.
 *
 * Default: dry-run. Pass `--apply` to actually delete.
 *
 * Required:
 *   --agent-email=<email>   Scopes to one agent.
 *   --names="A,B,C"          Comma-separated lead names (case-insensitive
 *                            exact match, whitespace trimmed).
 *
 * Run:
 *   npm run purge:test-leads -- --agent-email=you@example.com \
 *     --names="Louis Niewald,Michael Boyajian"
 *   npm run purge:test-leads -- --agent-email=you@example.com \
 *     --names="Louis Niewald,Michael Boyajian" --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
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
  apply: boolean;
}

function parseArgs(): Args {
  const args: Args = { agentEmail: '', names: [], apply: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--agent-email=')) {
      args.agentEmail = arg.slice('--agent-email='.length).toLowerCase();
    } else if (arg.startsWith('--names=')) {
      const raw = arg.slice('--names='.length);
      args.names = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: purge-test-leads.ts --agent-email=<email> --names="A,B,C" [--apply]',
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
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.agentEmail) {
    console.error('--agent-email is required.');
    process.exit(1);
  }
  if (args.names.length === 0) {
    console.error('--names is required (comma-separated).');
    process.exit(1);
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
  const agentDoc = agentsSnap.docs[0];
  const agentId = agentDoc.id;

  console.log(`Agent: ${args.agentEmail} (${agentId})`);
  console.log(`Mode:  ${args.apply ? 'APPLY (deletes will happen)' : 'dry-run'}`);
  console.log(`Names: ${args.names.length} requested`);

  // Pull all leads + appointments in two batches; do the matching in memory.
  const [leadsSnap, apptsSnap] = await Promise.all([
    db.collection('agents').doc(agentId).collection('leads').get(),
    db.collection('agents').doc(agentId).collection('appointments').get(),
  ]);

  // Build name → lead lookup (case-insensitive, trimmed).
  const leadByName = new Map<string, { id: string; name: string }>();
  for (const leadDoc of leadsSnap.docs) {
    const data = leadDoc.data() as { name?: string };
    if (typeof data.name !== 'string' || !data.name.trim()) continue;
    leadByName.set(data.name.trim().toLowerCase(), {
      id: leadDoc.id,
      name: data.name.trim(),
    });
  }

  // Group appointments by leadId.
  const apptsByLead = new Map<
    string,
    Array<{ id: string; createdMs: number | null; status: string }>
  >();
  for (const apptDoc of apptsSnap.docs) {
    const data = apptDoc.data() as {
      leadId?: string;
      createdAt?: unknown;
      status?: string;
    };
    if (!data.leadId) continue;
    const arr = apptsByLead.get(data.leadId) ?? [];
    arr.push({
      id: apptDoc.id,
      createdMs: tsToMillis(data.createdAt),
      status: data.status ?? 'unknown',
    });
    apptsByLead.set(data.leadId, arr);
  }

  // Cross-reference: for each requested name, find lead + its appointments.
  let leadsFound = 0;
  let totalAppts = 0;
  const toDelete: Array<{
    apptId: string;
    leadId: string;
    leadName: string;
    createdAtIso: string;
    status: string;
  }> = [];
  for (const requestedName of args.names) {
    const lead = leadByName.get(requestedName.trim().toLowerCase());
    if (!lead) {
      console.log(`  ${requestedName}: LEAD NOT FOUND`);
      continue;
    }
    leadsFound += 1;
    const appts = apptsByLead.get(lead.id) ?? [];
    if (appts.length === 0) {
      console.log(`  ${lead.name} (lead ${lead.id}): 0 appointments`);
      continue;
    }
    console.log(`  ${lead.name} (lead ${lead.id}): ${appts.length} appointment(s)`);
    for (const appt of appts) {
      const createdIso =
        appt.createdMs !== null ? new Date(appt.createdMs).toISOString() : 'unknown';
      console.log(`     apptId=${appt.id}  created=${createdIso}  status=${appt.status}`);
      toDelete.push({
        apptId: appt.id,
        leadId: lead.id,
        leadName: lead.name,
        createdAtIso: createdIso,
        status: appt.status,
      });
      totalAppts += 1;
    }
  }

  console.log(
    `\nLeads found: ${leadsFound}/${args.names.length}. Appointments queued: ${totalAppts}.`,
  );

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  if (!args.apply) {
    console.log('Dry run — no writes. Re-run with --apply to delete.');
    return;
  }

  let deleted = 0;
  for (const d of toDelete) {
    await db
      .collection('agents')
      .doc(agentId)
      .collection('appointments')
      .doc(d.apptId)
      .delete();
    deleted += 1;
    console.log(`  ✓ deleted ${d.apptId} (${d.leadName})`);
  }
  console.log(`\nDeleted ${deleted} appointment(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Purge failed:', err);
    process.exit(1);
  });
