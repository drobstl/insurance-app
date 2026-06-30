import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';
import {
  getActivityStats,
  type ActivityStats,
  type ActivityRange,
} from './activity-stats';

/**
 * Agency layer — the "lightweight" model (NOT pooled-seat billing).
 *
 * An agency owner is just an agent flagged `isAgencyOwner: true`. Their
 * downline = every agent whose `agencyOwnerId` points at the owner's uid:
 * `agents.where('agencyOwnerId', '==', ownerUid)`. `agencyOwnerId` is a
 * dedicated team-membership field (set by a link signup OR an admin
 * assignment) — deliberately SEPARATE from `referredByAgent`, which is
 * referral/affiliate credit and must not be entangled with team structure.
 * Each downline agent keeps their own individual subscription; nothing is
 * pooled.
 *
 * This module is the read-only data layer for the owner's "My Team"
 * dashboard: each member's headline metrics (reused from getActivityStats)
 * + an AI coaching radar (aggregated from the per-call coaching scores the
 * coaching feature already produces), plus the owner's own pen and an
 * agency-wide rollup.
 *
 * PRIVACY: this returns PERFORMANCE METRICS ONLY — never the downline's
 * client/beneficiary PII. getActivityStats yields counts/rates/APV; the
 * coaching radar yields dimension scores + the agent's own coaching
 * priorities. No client records cross the owner boundary here.
 */

// R.E.A.L. coaching dimensions — mirrors REAL_CATEGORIES in
// lib/coaching-playbook.ts (the rubric the scorer grades against).
export const REAL_DIMENSIONS = ['rapport', 'emotion', 'assumption', 'lock_it_down'] as const;
export type RealDimension = (typeof REAL_DIMENSIONS)[number];

const REAL_LABELS: Record<RealDimension, string> = {
  rapport: 'Rapport',
  emotion: 'Emotion',
  assumption: 'Assumption',
  lock_it_down: 'Lock it down',
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function tsMillis(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === 'object' && typeof (v as { _seconds?: number })._seconds === 'number') {
    return (v as { _seconds: number })._seconds * 1000;
  }
  return null;
}

// ── Downline ─────────────────────────────────────────────────────────

export interface DownlineMember {
  uid: string;
  name: string;
}

/** Agents on this owner's team (agencyOwnerId == ownerUid). */
export async function getDownlineMembers(ownerUid: string): Promise<DownlineMember[]> {
  const snap = await getAdminFirestore()
    .collection('agents')
    .where('agencyOwnerId', '==', ownerUid)
    .get();
  return snap.docs.map((d) => {
    const data = d.data() ?? {};
    const name =
      typeof data.name === 'string' && data.name.trim().length > 0
        ? data.name.trim()
        : 'Unnamed agent';
    return { uid: d.id, name };
  });
}

// ── Coaching radar ───────────────────────────────────────────────────

interface CoachingRealEntry {
  key?: string;
  score?: number;
}
interface CoachingPriority {
  priority?: string;
}
interface CoachingReport {
  overallScore?: number;
  real?: CoachingRealEntry[];
  coachingPriorities?: CoachingPriority[];
}

export interface CoachingRadar {
  scoredCalls: number;
  overallAvg: number | null;
  /** Each scored R.E.A.L. dimension's average over the window, weakest first. */
  dimensions: Array<{ key: RealDimension; label: string; avgScore: number; calls: number }>;
  /** The weakest dimension = the headline "coach on X" for this agent. */
  focus: { key: RealDimension; label: string; avgScore: number } | null;
  /** Most-frequent AI-generated coaching priorities across the window. */
  topPriorities: Array<{ text: string; count: number }>;
}

const WINDOW_SCORES_LIMIT = 50;

/** Read an agent's scored calls in the last `days` and aggregate the
 *  already-AI-ranked dimension scores + coaching priorities into a radar.
 *  Volume is low (≈4–16 scored calls per agent per 2–4 weeks), so reading
 *  raw scores and aggregating on-demand is cheap — no pre-aggregation. */
export async function getCoachingRadar(uid: string, days: number): Promise<CoachingRadar> {
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const snap = await getAdminFirestore()
    .collection('agents')
    .doc(uid)
    .collection('coachingScores')
    .orderBy('createdAt', 'desc')
    .limit(WINDOW_SCORES_LIMIT)
    .get();

  const reports: CoachingReport[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const ms = tsMillis(data.createdAt);
    if (ms !== null && ms < sinceMs) continue; // outside the window
    if (data.report && typeof data.report === 'object') {
      reports.push(data.report as CoachingReport);
    }
  }
  return buildCoachingRadar(reports);
}

export function buildCoachingRadar(reports: CoachingReport[]): CoachingRadar {
  const dimAgg = new Map<RealDimension, { sum: number; count: number }>();
  const priorityCounts = new Map<string, number>();
  let overallSum = 0;
  let overallCount = 0;

  for (const r of reports) {
    if (typeof r.overallScore === 'number') {
      overallSum += r.overallScore;
      overallCount += 1;
    }
    for (const entry of r.real ?? []) {
      const key = entry.key;
      if (typeof key !== 'string' || !(REAL_DIMENSIONS as readonly string[]).includes(key)) continue;
      if (typeof entry.score !== 'number') continue;
      const dim = key as RealDimension;
      const cur = dimAgg.get(dim) ?? { sum: 0, count: 0 };
      cur.sum += entry.score;
      cur.count += 1;
      dimAgg.set(dim, cur);
    }
    for (const p of r.coachingPriorities ?? []) {
      const text = (p.priority ?? '').trim();
      if (!text) continue;
      priorityCounts.set(text, (priorityCounts.get(text) ?? 0) + 1);
    }
  }

  const dimensions: CoachingRadar['dimensions'] = [];
  for (const k of REAL_DIMENSIONS) {
    const a = dimAgg.get(k);
    if (!a) continue;
    dimensions.push({ key: k, label: REAL_LABELS[k], avgScore: round1(a.sum / a.count), calls: a.count });
  }
  dimensions.sort((a, b) => a.avgScore - b.avgScore); // weakest first

  const topPriorities = [...priorityCounts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    scoredCalls: reports.length,
    overallAvg: overallCount > 0 ? round1(overallSum / overallCount) : null,
    dimensions,
    focus:
      dimensions.length > 0
        ? { key: dimensions[0].key, label: dimensions[0].label, avgScore: dimensions[0].avgScore }
        : null,
    topPriorities,
  };
}

// ── Team overview ────────────────────────────────────────────────────

export interface TeamMemberRow {
  uid: string;
  name: string;
  sales: { count: number; apv: number };
  netPlacedApv: number;
  chargebacks: number; // count in the window
  chargebackRate: number;
  showRate: number;
  referralsReceived: number;
  rewrites: number;
  coaching: CoachingRadar;
}

export interface TeamOverview {
  range: ActivityRange;
  coachingWindowDays: number;
  /** The owner's own pen (their personal performance), same shape as a member. */
  owner: TeamMemberRow;
  memberCount: number;
  /** True if the downline exceeded MAX_DOWNLINE and was capped (see note). */
  truncated: boolean;
  members: TeamMemberRow[];
  agency: {
    totalSales: number;
    totalSalesApv: number;
    totalNetPlacedApv: number;
    totalChargebacks: number;
    avgShowRate: number;
  };
}

// On-demand stats are fine for small downlines; cap the fan-out so a
// pathological owner with a huge referral count can't trigger hundreds of
// getActivityStats() calls per request. Past this, Phase 2 needs
// precomputed per-agent rollup docs + a cron.
const MAX_DOWNLINE = 50;

async function buildRow(uid: string, name: string, range: ActivityRange, coachingDays: number): Promise<TeamMemberRow> {
  const [stats, coaching] = await Promise.all([
    getActivityStats(uid, range),
    getCoachingRadar(uid, coachingDays),
  ]);
  return rowFromStats(uid, name, stats, coaching);
}

function rowFromStats(uid: string, name: string, stats: ActivityStats, coaching: CoachingRadar): TeamMemberRow {
  return {
    uid,
    name,
    sales: { count: stats.sales.count, apv: stats.sales.apv },
    netPlacedApv: stats.apvLifecycle.netPlaced,
    chargebacks: stats.chargebacks.count,
    chargebackRate: stats.chargebacks.rate,
    showRate: stats.appointments.showRate,
    referralsReceived: stats.referralsActivity.received,
    rewrites: stats.rewrites.count,
    coaching,
  };
}

/** Full "My Team" payload: the owner's own pen + each downline member's
 *  headline metrics and coaching radar + an agency-wide rollup. */
export async function getTeamOverview(
  ownerUid: string,
  ownerName: string,
  range: ActivityRange,
  coachingWindowDays: number,
): Promise<TeamOverview> {
  const allMembers = await getDownlineMembers(ownerUid);
  const truncated = allMembers.length > MAX_DOWNLINE;
  const members = truncated ? allMembers.slice(0, MAX_DOWNLINE) : allMembers;

  const [owner, rows] = await Promise.all([
    buildRow(ownerUid, ownerName, range, coachingWindowDays),
    Promise.all(members.map((m) => buildRow(m.uid, m.name, range, coachingWindowDays))),
  ]);

  let totalSales = 0;
  let totalSalesApv = 0;
  let totalNetPlacedApv = 0;
  let totalChargebacks = 0;
  let showRateSum = 0;
  for (const r of rows) {
    totalSales += r.sales.count;
    totalSalesApv += r.sales.apv;
    totalNetPlacedApv += r.netPlacedApv;
    totalChargebacks += r.chargebacks;
    showRateSum += r.showRate;
  }

  return {
    range,
    coachingWindowDays,
    owner,
    memberCount: rows.length,
    truncated,
    members: rows,
    agency: {
      totalSales,
      totalSalesApv,
      totalNetPlacedApv,
      totalChargebacks,
      avgShowRate: rows.length > 0 ? round1(showRateSum / rows.length) : 0,
    },
  };
}
