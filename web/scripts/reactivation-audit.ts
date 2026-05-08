#!/usr/bin/env npx tsx
/**
 * Reactivation audit — READ-ONLY.
 *
 * Surveys Firestore for every doc state that would resume Linq outbound
 * dispatch when crons begin running again on May 12. Maps directly to
 * the four crons that have drain modes:
 *
 *   - referral-drip               → agents/{id}/referrals
 *   - conservation-outreach       → agents/{id}/conservationAlerts
 *   - policy-review-drip          → agents/{id}/policyReviews
 *   - beneficiary-followups       → agents/{id}/beneficiaryFollowups
 *
 * Also counts:
 *   - welcome action items created during the maintenance window
 *     (`agents/{id}/actionItems` lane=welcome status=pending) — for the
 *     "nuke whatever the founding 34 generated during the window" pass.
 *   - welcome activation rollbacks: clients with welcomeActivationInboundAt
 *     UNSET but a placeholder thread that was archived (signal of the
 *     LinqOutboundDisabledError rollback path having fired).
 *
 * Excludes any doc with `linqPausedSkippedAt` set (those are already
 * drained and will be ignored by every normal-mode cron loop).
 *
 * Default maintenance-window start: 2026-05-06T00:00:00Z. Override with
 * `--window-start=ISO`. Default per-agent sample size: 3 doc IDs per
 * status. Override with `--sample=N`.
 *
 * Run: `node --import tsx ./scripts/reactivation-audit.ts` from `web/`.
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
  windowStartIso: string;
  sample: number;
}

function parseArgs(): Args {
  const args: Args = {
    windowStartIso: '2026-05-06T00:00:00Z',
    sample: 3,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--window-start=')) {
      args.windowStartIso = arg.slice('--window-start='.length);
    } else if (arg.startsWith('--sample=')) {
      args.sample = Math.max(0, parseInt(arg.slice('--sample='.length), 10) || 0);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: reactivation-audit.ts [--window-start=ISO] [--sample=N]\n' +
          '  --window-start  Maintenance window start; defaults to 2026-05-06T00:00:00Z\n' +
          '  --sample        Doc ID sample size per status; defaults to 3',
      );
      process.exit(0);
    }
  }
  return args;
}

const REFERRAL_ACTIVE_STATUSES = ['outreach-sent', 'drip-1', 'drip-2'] as const;
const POLICY_REVIEW_ACTIVE_STATUSES = ['outreach-sent', 'drip-1', 'drip-2'] as const;
const CONSERVATION_ACTIVE_STATUSES = ['outreach_scheduled', 'outreach_sent', 'drip_1', 'drip_2'] as const;

interface PerAgentReport {
  agentId: string;
  agentName: string;
  agentEmail: string | null;
  referrals: Record<string, { active: number; sampleIds: string[] }>;
  conservationAlerts: Record<string, { active: number; sampleIds: string[] }>;
  policyReviews: Record<string, { active: number; sampleIds: string[] }>;
  beneficiaryFollowupsQueued: { count: number; sampleIds: string[] };
  welcomeActionItemsDuringWindow: { count: number; sampleIds: string[] };
  welcomeActivationRollbacks: { count: number; sampleIds: string[] };
  totalAtRisk: number;
}

function tsToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

async function auditAgent(agentId: string, windowStart: Date, sampleSize: number): Promise<PerAgentReport> {
  const db = getAdminFirestore();
  const agentSnap = await db.collection('agents').doc(agentId).get();
  const agentData = agentSnap.data() || {};

  const report: PerAgentReport = {
    agentId,
    agentName: (agentData.name as string) || '<unknown>',
    agentEmail: (agentData.email as string) || null,
    referrals: {},
    conservationAlerts: {},
    policyReviews: {},
    beneficiaryFollowupsQueued: { count: 0, sampleIds: [] },
    welcomeActionItemsDuringWindow: { count: 0, sampleIds: [] },
    welcomeActivationRollbacks: { count: 0, sampleIds: [] },
    totalAtRisk: 0,
  };

  // Referrals
  for (const status of REFERRAL_ACTIVE_STATUSES) {
    const snap = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .where('status', '==', status)
      .get();
    let active = 0;
    const sampleIds: string[] = [];
    for (const doc of snap.docs) {
      if (doc.data().linqPausedSkippedAt) continue;
      active += 1;
      if (sampleIds.length < sampleSize) sampleIds.push(doc.id);
    }
    report.referrals[status] = { active, sampleIds };
    report.totalAtRisk += active;
  }

  // Conservation alerts
  for (const status of CONSERVATION_ACTIVE_STATUSES) {
    const snap = await db
      .collection('agents')
      .doc(agentId)
      .collection('conservationAlerts')
      .where('status', '==', status)
      .get();
    let active = 0;
    const sampleIds: string[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.linqPausedSkippedAt) continue;
      if (data.lastClientReplyAt) continue;
      active += 1;
      if (sampleIds.length < sampleSize) sampleIds.push(doc.id);
    }
    report.conservationAlerts[status] = { active, sampleIds };
    report.totalAtRisk += active;
  }

  // Policy reviews
  for (const status of POLICY_REVIEW_ACTIVE_STATUSES) {
    const snap = await db
      .collection('agents')
      .doc(agentId)
      .collection('policyReviews')
      .where('status', '==', status)
      .get();
    let active = 0;
    const sampleIds: string[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.linqPausedSkippedAt) continue;
      if (data.lastClientReplyAt) continue;
      if (data.aiEnabled === false) continue;
      active += 1;
      if (sampleIds.length < sampleSize) sampleIds.push(doc.id);
    }
    report.policyReviews[status] = { active, sampleIds };
    report.totalAtRisk += active;
  }

  // Beneficiary followups (queued)
  const benSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('beneficiaryFollowups')
    .where('status', '==', 'queued')
    .get();
  for (const doc of benSnap.docs) {
    report.beneficiaryFollowupsQueued.count += 1;
    if (report.beneficiaryFollowupsQueued.sampleIds.length < sampleSize) {
      report.beneficiaryFollowupsQueued.sampleIds.push(doc.id);
    }
  }
  report.totalAtRisk += report.beneficiaryFollowupsQueued.count;

  // Welcome action items written during the maintenance window
  const aiSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('actionItems')
    .where('lane', '==', 'welcome')
    .where('status', '==', 'pending')
    .get();
  for (const doc of aiSnap.docs) {
    const data = doc.data();
    const createdIso = tsToIso(data.createdAt);
    if (!createdIso) continue;
    if (new Date(createdIso) < windowStart) continue;
    report.welcomeActionItemsDuringWindow.count += 1;
    if (report.welcomeActionItemsDuringWindow.sampleIds.length < sampleSize) {
      report.welcomeActionItemsDuringWindow.sampleIds.push(doc.id);
    }
  }

  // Welcome activation rollbacks: archived placeholders whose target client
  // never stamped clientActivatedAt. Signals the LinqOutboundDisabledError
  // rollback path having fired during the window.
  const archivedSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('conversationThreads')
    .where('lifecycleStatus', '==', 'archived')
    .get();
  for (const threadDoc of archivedSnap.docs) {
    if (!threadDoc.id.startsWith('welcome_pending_')) continue;
    const data = threadDoc.data();
    if (data.upgradedToProviderThreadId) continue; // healthy upgrade, not a rollback
    const clientId = threadDoc.id.slice('welcome_pending_'.length);
    if (!clientId) continue;
    const clientSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .get();
    const clientData = clientSnap.data();
    if (clientData?.clientActivatedAt) continue;
    report.welcomeActivationRollbacks.count += 1;
    if (report.welcomeActivationRollbacks.sampleIds.length < sampleSize) {
      report.welcomeActivationRollbacks.sampleIds.push(clientId);
    }
  }

  return report;
}

function printAgentReport(report: PerAgentReport): void {
  if (report.totalAtRisk === 0 && report.welcomeActionItemsDuringWindow.count === 0 && report.welcomeActivationRollbacks.count === 0) {
    return;
  }
  const label = `${report.agentName} <${report.agentEmail ?? '?'}> (${report.agentId})`;
  console.log(`\n${label}`);

  for (const status of REFERRAL_ACTIVE_STATUSES) {
    const r = report.referrals[status];
    if (r && r.active > 0) {
      console.log(`  referrals(${status}): ${r.active} [sample: ${r.sampleIds.join(', ')}]`);
    }
  }
  for (const status of CONSERVATION_ACTIVE_STATUSES) {
    const r = report.conservationAlerts[status];
    if (r && r.active > 0) {
      console.log(`  conservationAlerts(${status}): ${r.active} [sample: ${r.sampleIds.join(', ')}]`);
    }
  }
  for (const status of POLICY_REVIEW_ACTIVE_STATUSES) {
    const r = report.policyReviews[status];
    if (r && r.active > 0) {
      console.log(`  policyReviews(${status}): ${r.active} [sample: ${r.sampleIds.join(', ')}]`);
    }
  }
  if (report.beneficiaryFollowupsQueued.count > 0) {
    console.log(
      `  beneficiaryFollowups(queued): ${report.beneficiaryFollowupsQueued.count} [sample: ${report.beneficiaryFollowupsQueued.sampleIds.join(', ')}]`,
    );
  }
  if (report.welcomeActionItemsDuringWindow.count > 0) {
    console.log(
      `  welcomeActionItems(during window): ${report.welcomeActionItemsDuringWindow.count} [sample: ${report.welcomeActionItemsDuringWindow.sampleIds.join(', ')}]`,
    );
  }
  if (report.welcomeActivationRollbacks.count > 0) {
    console.log(
      `  welcomeActivationRollbacks: ${report.welcomeActivationRollbacks.count} [client sample: ${report.welcomeActivationRollbacks.sampleIds.join(', ')}]`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const windowStart = new Date(args.windowStartIso);
  if (isNaN(windowStart.getTime())) {
    console.error(`Invalid --window-start: ${args.windowStartIso}`);
    process.exit(1);
  }

  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();

  console.log('Reactivation audit — READ-ONLY');
  console.log(`Window start: ${windowStart.toISOString()}`);
  console.log(`Agents scanned: ${agentsSnap.docs.length}`);
  console.log(`Sample size: ${args.sample} per status`);

  const reports: PerAgentReport[] = [];
  for (const agentDoc of agentsSnap.docs) {
    const report = await auditAgent(agentDoc.id, windowStart, args.sample);
    reports.push(report);
    printAgentReport(report);
  }

  // Aggregate totals
  const totals = {
    agents: agentsSnap.docs.length,
    agentsWithAtRiskState: reports.filter((r) => r.totalAtRisk > 0).length,
    agentsWithWindowState:
      reports.filter((r) => r.welcomeActionItemsDuringWindow.count > 0 || r.welcomeActivationRollbacks.count > 0).length,
    referrals: { 'outreach-sent': 0, 'drip-1': 0, 'drip-2': 0 } as Record<string, number>,
    conservationAlerts: {
      outreach_scheduled: 0,
      outreach_sent: 0,
      drip_1: 0,
      drip_2: 0,
    } as Record<string, number>,
    policyReviews: { 'outreach-sent': 0, 'drip-1': 0, 'drip-2': 0 } as Record<string, number>,
    beneficiaryFollowupsQueued: 0,
    welcomeActionItemsDuringWindow: 0,
    welcomeActivationRollbacks: 0,
  };
  for (const r of reports) {
    for (const status of REFERRAL_ACTIVE_STATUSES) totals.referrals[status] += r.referrals[status]?.active ?? 0;
    for (const status of CONSERVATION_ACTIVE_STATUSES)
      totals.conservationAlerts[status] += r.conservationAlerts[status]?.active ?? 0;
    for (const status of POLICY_REVIEW_ACTIVE_STATUSES)
      totals.policyReviews[status] += r.policyReviews[status]?.active ?? 0;
    totals.beneficiaryFollowupsQueued += r.beneficiaryFollowupsQueued.count;
    totals.welcomeActionItemsDuringWindow += r.welcomeActionItemsDuringWindow.count;
    totals.welcomeActivationRollbacks += r.welcomeActivationRollbacks.count;
  }

  console.log('\n========================================');
  console.log('TOTALS');
  console.log('========================================');
  console.log(JSON.stringify(totals, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
