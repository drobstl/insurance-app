#!/usr/bin/env npx tsx
/**
 * Purge fake / test bookings from an agent's activity data.
 *
 * Heuristic: a "real" booking has at least one dial entry on the
 * underlying lead's `dialLog`. Real workflow is dial → book → meet.
 * If the lead has zero dials and the appointment exists, it's almost
 * certainly a manual test booking from Daniel exercising the calendar
 * flow before relaunch. Those inflate the activity dashboard's
 * `Booked` count without contributing any real prospect data.
 *
 * Only `leadId`-keyed appointments are considered. Client-only
 * appointments (post-conversion follow-up meetings) are skipped —
 * different category, different concern.
 *
 * Default: dry-run (lists what would be deleted, writes nothing).
 * Pass `--apply` to actually delete.
 *
 * Required: `--agent-email=<email>` so we only ever touch one agent's
 * data. The script refuses to run without it.
 *
 * Optional: `--from=<ISO>` and `--to=<ISO>` to scope by appointment
 * createdAt window. Default = all time.
 *
 * Run: `npm run purge:fake-bookings -- --agent-email=you@example.com`
 *      `npm run purge:fake-bookings -- --agent-email=you@example.com --apply`
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
  apply: boolean;
  fromMs: number | null;
  toMs: number | null;
}

function parseArgs(): Args {
  const args: Args = { agentEmail: '', apply: false, fromMs: null, toMs: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--agent-email=')) {
      args.agentEmail = arg.slice('--agent-email='.length).toLowerCase();
    } else if (arg.startsWith('--from=')) {
      const ms = Date.parse(arg.slice('--from='.length));
      if (Number.isFinite(ms)) args.fromMs = ms;
    } else if (arg.startsWith('--to=')) {
      const ms = Date.parse(arg.slice('--to='.length));
      if (Number.isFinite(ms)) args.toMs = ms;
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: purge-fake-bookings.ts --agent-email=<email> [--from=ISO] [--to=ISO] [--apply]\n' +
          '  --agent-email   Required. Scopes the cleanup to one agent.\n' +
          '  --from / --to   Optional ISO timestamps to scope appointments by createdAt.\n' +
          '  --apply         Actually delete (default is dry-run).',
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

interface Flagged {
  apptId: string;
  leadId: string;
  leadName: string | null;
  createdAtIso: string;
  scheduledAtIso: string | null;
  status: string;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.agentEmail) {
    console.error('--agent-email is required. Run with --help for usage.');
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
  if (agentsSnap.docs.length > 1) {
    console.error(`More than one agent matches email ${args.agentEmail}. Refusing to guess.`);
    process.exit(1);
  }
  const agentDoc = agentsSnap.docs[0];
  const agentId = agentDoc.id;

  console.log(`Agent: ${args.agentEmail} (${agentId})`);
  console.log(`Mode:  ${args.apply ? 'APPLY (deletes will happen)' : 'dry-run'}`);
  if (args.fromMs !== null) console.log(`From:  ${new Date(args.fromMs).toISOString()}`);
  if (args.toMs !== null) console.log(`To:    ${new Date(args.toMs).toISOString()}`);

  const apptsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('appointments')
    .get();
  console.log(`Appointments scanned: ${apptsSnap.docs.length}`);

  // Cache lead lookups — multiple appts can share the same lead.
  const leadsCache = new Map<string, { dialLog?: unknown[]; name?: string }>();
  async function getLead(
    leadId: string,
  ): Promise<{ dialLog?: unknown[]; name?: string }> {
    const cached = leadsCache.get(leadId);
    if (cached) return cached;
    const doc = await db
      .collection('agents')
      .doc(agentId)
      .collection('leads')
      .doc(leadId)
      .get();
    const data = doc.exists
      ? (doc.data() as { dialLog?: unknown[]; name?: string })
      : {};
    leadsCache.set(leadId, data);
    return data;
  }

  const flagged: Flagged[] = [];
  for (const apptDoc of apptsSnap.docs) {
    const data = apptDoc.data() as {
      leadId?: string;
      clientId?: string;
      createdAt?: unknown;
      scheduledAt?: unknown;
      status?: string;
    };
    const createdMs = tsToMillis(data.createdAt);
    if (createdMs === null) continue;
    if (args.fromMs !== null && createdMs < args.fromMs) continue;
    if (args.toMs !== null && createdMs >= args.toMs) continue;
    // Client-only appointments are post-conversion follow-ups — not
    // the category we're cleaning here.
    if (!data.leadId) continue;

    const lead = await getLead(data.leadId);
    const dialCount = Array.isArray(lead.dialLog) ? lead.dialLog.length : 0;
    if (dialCount > 0) continue;

    const scheduledMs = tsToMillis(data.scheduledAt);
    flagged.push({
      apptId: apptDoc.id,
      leadId: data.leadId,
      leadName: lead.name ?? null,
      createdAtIso: new Date(createdMs).toISOString(),
      scheduledAtIso: scheduledMs !== null ? new Date(scheduledMs).toISOString() : null,
      status: data.status ?? 'unknown',
    });
  }

  if (flagged.length === 0) {
    console.log('\nNo fake bookings found. Nothing to do.');
    return;
  }

  console.log(`\nFound ${flagged.length} appointment(s) with no preceding dial activity:`);
  for (const f of flagged) {
    console.log(
      `  apptId=${f.apptId}  lead=${f.leadName ?? f.leadId}  created=${f.createdAtIso}  status=${f.status}`,
    );
  }

  if (!args.apply) {
    console.log(`\nDry run — no writes. Re-run with --apply to delete these ${flagged.length} appointment(s).`);
    return;
  }

  let deleted = 0;
  for (const f of flagged) {
    await db
      .collection('agents')
      .doc(agentId)
      .collection('appointments')
      .doc(f.apptId)
      .delete();
    deleted += 1;
    console.log(`  ✓ deleted ${f.apptId}`);
  }
  console.log(`\nDeleted ${deleted} appointment(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Purge failed:', err);
    process.exit(1);
  });
