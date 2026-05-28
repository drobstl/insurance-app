import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';
import { computeAPV } from './apv';

/**
 * Agent activity stats.
 *
 * On-demand aggregation across an agent's leads / appointments / clients /
 * policies / conservationAlerts. Computed at request time — no
 * denormalized rollup docs yet. When per-agent book sizes climb past
 * 500 clients or the page feels slow, swap this for daily aggregate
 * docs at `agents/{uid}/activityStats/{YYYY-MM-DD}`; the endpoint
 * signature stays the same.
 *
 * Source attribution for "new APV" is inferred from existing fields,
 * not stamped explicitly on policies (yet):
 *   - bought_lead: client has `convertedFromLeadId` AND policy.createdAt
 *     within 60 days of client.createdAt.
 *   - referral: client has `sourceReferralId` AND policy.createdAt
 *     within 60 days of client.createdAt.
 *   - rewrite: policy.createdAt > 60 days after client.createdAt
 *     (the agent added a new policy on a client already on the book).
 *   - manual_add: client has neither source flag AND policy.createdAt
 *     within 60 days of client.createdAt.
 *
 * The 60-day window is a heuristic — close enough to "initial sale on
 * a fresh client" vs "later expansion" without needing to instrument
 * the policy-add UI. Push this to an explicit `source` field on the
 * policy in Phase 2 if the heuristic drifts.
 */

export type ActivityRange = 'today' | 'week' | 'month' | 'last30' | 'ytd';

export const ACTIVITY_RANGE_LABELS: Record<ActivityRange, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  last30: 'Last 30 days',
  ytd: 'Year to date',
};

export type PolicySource = 'bought_lead' | 'referral' | 'rewrite' | 'manual_add';

export const POLICY_SOURCE_LABELS: Record<PolicySource, string> = {
  bought_lead: 'Bought leads',
  referral: 'Referrals',
  rewrite: 'Rewrites',
  // "Earned lead" = leads you sourced yourself, outside the lead-vendor
  // pipeline. Networking contacts, friends/family, inbound calls,
  // marketing inquiries, re-engaged aged-out leads, cold prospecting,
  // referrals you logged manually instead of through the referral flow.
  // They were leads in spirit — just not bought — so they count as
  // sales activity but live in their own bucket.
  manual_add: 'Earned leads',
};

/** Brand-aligned color per source for chart tints. */
export const POLICY_SOURCE_COLORS: Record<PolicySource, string> = {
  bought_lead: '#005851',  // brand deep teal — primary acquisition channel
  referral: '#44bbaa',     // brand teal — AFL-driven, the prize
  rewrite: '#7fd1c4',      // light teal — AFL-driven, expansion
  manual_add: '#9CA3AF',   // neutral grey — cold market
};

const TRANSIENT_OUTCOMES = new Set(['no_answer', 'left_vm']);

interface RangeWindow {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

/** Resolve a range into [from, to) windows (UTC) + a same-length prior
 *  window for period-over-period comparison. */
export function resolveRange(range: ActivityRange, now: Date = new Date()): RangeWindow {
  const to = new Date(now);
  let from: Date;
  switch (range) {
    case 'today': {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      break;
    }
    case 'week': {
      const day = now.getUTCDay(); // 0=Sun..6=Sat
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
      from = start;
      break;
    }
    case 'month': {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      break;
    }
    case 'last30': {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30));
      break;
    }
    case 'ytd': {
      from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      break;
    }
  }
  const windowMs = to.getTime() - from.getTime();
  const prevTo = new Date(from);
  const prevFrom = new Date(from.getTime() - windowMs);
  return { from, to, prevFrom, prevTo };
}

interface DialEntry {
  at: Timestamp | { _seconds: number; _nanoseconds: number } | null;
  outcome: string;
}

function dialEntryMillis(entry: DialEntry): number | null {
  const at = entry.at;
  if (!at) return null;
  if (typeof (at as Timestamp).toMillis === 'function') return (at as Timestamp).toMillis();
  if (typeof (at as { _seconds: number })._seconds === 'number') {
    return (at as { _seconds: number; _nanoseconds: number })._seconds * 1000;
  }
  return null;
}

interface DialBucket {
  total: number;
  contacts: number;
  byOutcome: Record<string, number>;
}

function emptyDialBucket(): DialBucket {
  return { total: 0, contacts: 0, byOutcome: {} };
}

function countDialsInWindow(
  dialLog: DialEntry[] | undefined,
  fromMs: number,
  toMs: number,
  bucket: DialBucket,
): void {
  if (!Array.isArray(dialLog)) return;
  for (const entry of dialLog) {
    const ms = dialEntryMillis(entry);
    if (ms === null || ms < fromMs || ms >= toMs) continue;
    bucket.total += 1;
    bucket.byOutcome[entry.outcome] = (bucket.byOutcome[entry.outcome] || 0) + 1;
    // Contact = dial that reached a human. Excludes no_answer / left_vm.
    // Includes wrong_number (we did reach a human, just not the lead).
    if (!TRANSIENT_OUTCOMES.has(entry.outcome)) bucket.contacts += 1;
  }
}

export interface ActivityStats {
  range: { from: string; to: string; label: string; key: ActivityRange };
  dials: { total: number; contacts: number; contactRate: number; deltaPct: number | null };
  appointments: {
    // All five counts are unique-entity (lead or client). Reschedules
    // of the same lead don't double-count.
    //
    // Rate-math definitions (May 27 — Daniel's call):
    //  - A sale-in-window implies the entity showed. You can't sell
    //    someone who didn't sit.
    //  - Cancellations are NOT counted as no-shows. A cancel is a
    //    pre-meeting scrub; a no-show is a ghosting. Cancellations are
    //    excluded from showRate's denominator.
    //  - Unresolved (still-pending) appointments are excluded from
    //    showRate's denominator until they actually resolve.
    booked: number;         // booked in window, OR sold in window even if booked earlier
    showed: number;         // status flipped to completed/sit, OR any sale in window
    noShowed: number;       // status === 'no_show' only (cancellations live in their own bucket)
    cancelled: number;      // status === 'cancelled' AND no sale on the entity — excluded from rates
    unresolved: number;     // still scheduled, no outcome yet — excluded from rates
    showRate: number;       // showed / (showed + noShowed) — cancellations + pending excluded
    bookRate: number;       // booked / contacts (current window)
    deltaPct: number | null;
  };
  sales: {
    count: number;
    apv: number;
    closeRate: number;      // salesCount / showed (households-sold ≤ showed by construction)
    deltaPct: number | null;
    bySource: Array<{ source: PolicySource; label: string; color: string; count: number; apv: number; pct: number }>;
  };
  saved: { apv: number; count: number; deltaPct: number | null };
  // Business-health metrics (May 27 — Daniel's add). The funnel rates
  // above describe "is the lead-to-sale machine working this period."
  // These three describe "is the business actually compounding" —
  // matching AFL's leaky-bucket pitch: fewer losses (chargeback),
  // more referrals (per-close), more rewrites (share of sales).
  chargebacks: {
    count: number;          // lost conservation alerts in window where isChargebackRisk=true
    rate: number;           // chargebacks / salesCount this period — period view (mathematically loose, agent-intuitive)
  };
  referralsActivity: {
    received: number;       // referrals received in window (createdAt)
    perClose: number;       // received / salesCount — gold-standard generation rate
  };
  rewrites: {
    count: number;          // rewrite-tagged policies in window (already in sales.bySource)
    rate: number;           // rewrites / salesCount this period
  };
  funnel: Array<{ stage: string; count: number; pctOfPrev: number | null }>;
  recentWins: Array<{
    at: string;
    kind: 'sale' | 'save';
    clientName: string;
    amount: number;
    source: PolicySource | 'save';
  }>;
}

interface InferenceContext {
  clientCreatedAtMs: number | null;
  hasConvertedFromLeadId: boolean;
  hasSourceReferralId: boolean;
}

function inferPolicySource(policyCreatedAtMs: number, ctx: InferenceContext): PolicySource {
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const withinInitialWindow =
    ctx.clientCreatedAtMs !== null &&
    policyCreatedAtMs - ctx.clientCreatedAtMs <= SIXTY_DAYS_MS;
  if (withinInitialWindow) {
    if (ctx.hasConvertedFromLeadId) return 'bought_lead';
    if (ctx.hasSourceReferralId) return 'referral';
    return 'manual_add';
  }
  // Policy added more than 60 days after client creation — they were
  // already on the book. Counts as expansion business / rewrite.
  return 'rewrite';
}

function timestampMillis(t: unknown): number | null {
  if (!t) return null;
  if (typeof t === 'object' && t !== null) {
    if (typeof (t as Timestamp).toMillis === 'function') return (t as Timestamp).toMillis();
    if (typeof (t as { _seconds: number })._seconds === 'number') {
      return (t as { _seconds: number; _nanoseconds: number })._seconds * 1000;
    }
  }
  return null;
}

/** Parse a YYYY-MM-DD string into UTC midnight millis. */
function ymdMillis(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return Date.UTC(year, month, day);
}

/** Determine the date a sale actually happened from a policy doc.
 *  Agent commissions accrue from when the client signed the application —
 *  NOT when the policy row was written to Firestore (which can be much
 *  later, e.g. when the application PDF was imported into AFL). Order:
 *    1. applicationSignedDate (the signature on the application)
 *    2. effectiveDate (carrier issue date)
 *    3. createdAt (Firestore write — last-resort fallback for legacy /
 *       manual entries where neither extracted date exists)
 *
 *  This is the single source of truth for "when was this sale earned"
 *  across all activity stats. Don't filter policies by createdAt
 *  anywhere in this module. */
export function policySaleDateMillis(policy: {
  applicationSignedDate?: unknown;
  effectiveDate?: unknown;
  createdAt?: unknown;
}): number | null {
  return ymdMillis(policy.applicationSignedDate) ?? ymdMillis(policy.effectiveDate) ?? timestampMillis(policy.createdAt);
}

export async function getActivityStats(
  agentId: string,
  range: ActivityRange,
): Promise<ActivityStats> {
  const db = getAdminFirestore();
  const win = resolveRange(range);
  const fromMs = win.from.getTime();
  const toMs = win.to.getTime();
  const prevFromMs = win.prevFrom.getTime();
  const prevToMs = win.prevTo.getTime();

  // ── Dials: walk every lead doc once, scan dialLog ──
  const leadsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('leads')
    .get();
  const dialsCurr = emptyDialBucket();
  const dialsPrev = emptyDialBucket();
  for (const leadDoc of leadsSnap.docs) {
    const data = leadDoc.data() as { dialLog?: DialEntry[] };
    countDialsInWindow(data.dialLog, fromMs, toMs, dialsCurr);
    countDialsInWindow(data.dialLog, prevFromMs, prevToMs, dialsPrev);
  }

  // ── Appointments: per-lead, NOT per-appointment doc ──
  // Daniel's mental model: "I get 30 leads/week, the goal is to book
  // 20–25 of them." Booked counts uniquely per lead/client. Reschedules
  // of the same lead don't add to the count (they create new appt docs
  // but share the same entity ID).
  //
  // Rate math (May 27 — Daniel's call):
  //   - A sale on this entity in-window implies they showed. We can't
  //     sell someone who didn't sit. So `showed` is the union of
  //     (status-flipped) AND (sold-in-window).
  //   - Cancellations are NOT no-shows. A cancel is a pre-meeting
  //     scrub; a no-show is a ghosting. Cancellations get their own
  //     bucket, excluded from showRate's denominator.
  //   - Unresolved (still-scheduled) appointments are also excluded
  //     from showRate's denominator. Rate judges resolved meetings.
  //   - If an entity sold in-window but has no booking in-window (or
  //     no appointment doc at all), we still count them as booked
  //     AND showed this window — a sale is proof of both.
  //
  // The actual `booked` / `showed` / `noShowed` / `cancelled` /
  // `unresolved` numbers are tallied later (after the policy walk
  // populates `soldEntitiesCurr`), in the "reconcile appointments
  // with sales" block.
  interface ApptDoc {
    createdAt?: unknown;
    scheduledAt?: unknown;
    status?: string;
    leadId?: string;
    clientId?: string;
  }
  const apptsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('appointments')
    .get();
  // Group all appointments by the underlying entity (leadId, falling
  // back to clientId when the lead has converted). Multiple appointment
  // docs for one entity = reschedules; we collapse them.
  const apptsByEntity = new Map<string, ApptDoc[]>();
  for (const apptDoc of apptsSnap.docs) {
    const data = apptDoc.data() as ApptDoc;
    const entityId = data.leadId || data.clientId;
    if (!entityId) continue;
    const arr = apptsByEntity.get(entityId);
    if (arr) arr.push(data);
    else apptsByEntity.set(entityId, [data]);
  }
  // Pre-compute first-booked + latest-status per entity. We need this
  // available before the reconciliation step below, which also needs
  // to know which entities sold in window — populated by the policy
  // walk further down.
  interface EntityApptInfo {
    firstBookedMs: number;
    latestStatus: string;
  }
  const entityAppts = new Map<string, EntityApptInfo>();
  for (const [entityId, appts] of apptsByEntity) {
    const firstBookedMs = appts
      .map((a) => timestampMillis(a.createdAt))
      .filter((ms): ms is number => ms !== null)
      .reduce((min, ms) => (ms < min ? ms : min), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(firstBookedMs)) continue;
    // Latest = most recent agent action by createdAt. If a lead's
    // original appt was cancelled but they got rebooked and showed,
    // the latest doc reflects that.
    const latest = [...appts].sort((a, b) => {
      const aMs = timestampMillis(a.createdAt) ?? 0;
      const bMs = timestampMillis(b.createdAt) ?? 0;
      return bMs - aMs;
    })[0];
    entityAppts.set(entityId, {
      firstBookedMs,
      latestStatus: latest?.status || 'scheduled',
    });
  }

  // ── Sales / APV / source breakdown ──
  // Walk every client + policy. Client doc gives us source-attribution
  // signals (convertedFromLeadId, sourceReferralId, createdAt).
  const clientsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .get();

  const sourceBuckets: Record<PolicySource, { count: number; apv: number }> = {
    bought_lead: { count: 0, apv: 0 },
    referral: { count: 0, apv: 0 },
    rewrite: { count: 0, apv: 0 },
    manual_add: { count: 0, apv: 0 },
  };
  let salesCount = 0;
  let salesApv = 0;
  let salesCountPrev = 0;
  const recentWins: ActivityStats['recentWins'] = [];
  // Track which entities (leadId-or-clientId, matching the appt-doc
  // keying) had a sale in each window. Used downstream by the
  // appointment-reconciliation step to enforce "sale implies show"
  // and to bring sold-without-appt entities into the booked count.
  const soldEntitiesCurr = new Set<string>();
  const soldEntitiesPrev = new Set<string>();

  for (const clientDoc of clientsSnap.docs) {
    const clientData = clientDoc.data() as {
      name?: string;
      createdAt?: unknown;
      convertedFromLeadId?: string;
      sourceReferralId?: string;
    };
    const ctx: InferenceContext = {
      clientCreatedAtMs: timestampMillis(clientData.createdAt),
      hasConvertedFromLeadId: Boolean(clientData.convertedFromLeadId),
      hasSourceReferralId: Boolean(clientData.sourceReferralId),
    };
    // Appointments are keyed by leadId when one exists; fall back to
    // clientId. We track BOTH so the reconciliation step downstream
    // can match either way (leads that converted have appt docs keyed
    // by leadId but live under the client).
    const apptKeyA = clientData.convertedFromLeadId;
    const apptKeyB = clientDoc.id;
    const policiesSnap = await clientDoc.ref.collection('policies').get();
    for (const policyDoc of policiesSnap.docs) {
      const p = policyDoc.data() as {
        createdAt?: unknown;
        applicationSignedDate?: unknown;
        effectiveDate?: unknown;
        premiumAmount?: number | null;
        premiumFrequency?: string | null;
        source?: PolicySource;
      };
      // Sale date = when the policy was sold, not when Firestore got
      // the doc. See policySaleDateMillis for the field precedence.
      // Agent commissions are first-year only, so we only count a
      // policy in a period when the SALE happened in that period.
      const saleMs = policySaleDateMillis(p);
      if (saleMs === null) continue;
      const apv = computeAPV(p.premiumAmount, p.premiumFrequency);
      // Honor an explicit source field if a future phase stamps one;
      // otherwise infer from context. Inference still uses the sale
      // date vs the client's createdAt to decide rewrite vs initial.
      const source: PolicySource = p.source || inferPolicySource(saleMs, ctx);
      if (saleMs >= fromMs && saleMs < toMs) {
        salesCount += 1;
        salesApv += apv;
        sourceBuckets[source].count += 1;
        sourceBuckets[source].apv += apv;
        if (apptKeyA) soldEntitiesCurr.add(apptKeyA);
        soldEntitiesCurr.add(apptKeyB);
        recentWins.push({
          at: new Date(saleMs).toISOString(),
          kind: 'sale',
          clientName: clientData.name || 'Unnamed client',
          amount: apv,
          source,
        });
      } else if (saleMs >= prevFromMs && saleMs < prevToMs) {
        salesCountPrev += 1;
        if (apptKeyA) soldEntitiesPrev.add(apptKeyA);
        soldEntitiesPrev.add(apptKeyB);
      }
    }
  }

  // ── Reconcile appointments with sales ──
  // Now that we know which entities sold in each window, walk the
  // per-entity appt info and produce the final booked / showed /
  // noShowed / cancelled / unresolved counts. Sale-implies-show
  // overrides whatever status the appt doc carries, and entities
  // that sold-but-weren't-booked-in-window get pulled in too.
  let booked = 0;
  let showed = 0;
  let noShowed = 0;
  let cancelled = 0;
  let unresolved = 0;
  let bookedPrev = 0;
  const accountedCurr = new Set<string>();
  const accountedPrev = new Set<string>();
  for (const [entityId, info] of entityAppts) {
    const inCurr = info.firstBookedMs >= fromMs && info.firstBookedMs < toMs;
    const inPrev = info.firstBookedMs >= prevFromMs && info.firstBookedMs < prevToMs;
    const soldCurr = soldEntitiesCurr.has(entityId);
    if (inCurr) {
      booked += 1;
      accountedCurr.add(entityId);
      if (soldCurr) {
        showed += 1;  // sale-implies-show overrides any appt status
      } else {
        const s = info.latestStatus;
        if (s === 'completed' || s === 'sit_no_sale' || s === 'sit_think_about_it') showed += 1;
        else if (s === 'no_show') noShowed += 1;
        else if (s === 'cancelled') cancelled += 1;
        else unresolved += 1;
      }
    } else if (soldCurr) {
      // Booking pre-dates the window but the sale lands in-window.
      // Count them as booked AND showed in this period — without
      // doing so, sales/showed math breaks across period boundaries.
      booked += 1;
      showed += 1;
      accountedCurr.add(entityId);
    }
    if (inPrev) {
      bookedPrev += 1;
      accountedPrev.add(entityId);
    } else if (soldEntitiesPrev.has(entityId)) {
      bookedPrev += 1;
      accountedPrev.add(entityId);
    }
  }
  // Entities that sold-in-window with no appointment doc at all
  // (informal close, no calendar booking). A sale implies the meeting
  // happened, so count them as +1 booked and +1 showed.
  for (const entityId of soldEntitiesCurr) {
    if (!accountedCurr.has(entityId)) {
      booked += 1;
      showed += 1;
    }
  }
  for (const entityId of soldEntitiesPrev) {
    if (!accountedPrev.has(entityId)) {
      bookedPrev += 1;
    }
  }
  // Show rate denominator = resolved meetings only. Pending and
  // cancelled live outside the rate. "Did the people I sat with show
  // up?" not "out of everyone I ever scheduled, what fraction has
  // resolved as a show?"
  const resolvedMeetings = showed + noShowed;
  const showRate = resolvedMeetings > 0 ? showed / resolvedMeetings : 0;
  const bookRate = dialsCurr.contacts > 0 ? booked / dialsCurr.contacts : 0;

  // ── Saved APV ── conservationAlerts marked status='saved' in window.
  // alertData.premiumAmount is monthly; multiply × 12 (we don't store a
  // frequency on conservation alerts — they're always monthly per the
  // ingestion contract).
  const alertsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('conservationAlerts')
    .where('status', '==', 'saved')
    .get();
  let savedApv = 0;
  let savedCount = 0;
  let savedApvPrev = 0;
  for (const alertDoc of alertsSnap.docs) {
    const data = alertDoc.data() as {
      premiumAmount?: number;
      clientName?: string;
      updatedAt?: unknown;
      savedAt?: unknown;
    };
    const savedMs = timestampMillis(data.savedAt) ?? timestampMillis(data.updatedAt);
    if (savedMs === null) continue;
    const apv = (data.premiumAmount || 0) * 12;
    if (savedMs >= fromMs && savedMs < toMs) {
      savedApv += apv;
      savedCount += 1;
      recentWins.push({
        at: new Date(savedMs).toISOString(),
        kind: 'save',
        clientName: data.clientName || 'Unnamed client',
        amount: apv,
        source: 'save',
      });
    } else if (savedMs >= prevFromMs && savedMs < prevToMs) {
      savedApvPrev += apv;
    }
  }

  // ── Chargebacks ── conservation alerts where the campaign ended in
  // 'lost' status AND the policy was within the chargeback window
  // (isChargebackRisk=true, meaning < 365 days old when the alert
  // fired). A 'lost' campaign on an older policy is still a lapse but
  // not a commission clawback, so it doesn't count here.
  const lostAlertsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('conservationAlerts')
    .where('status', '==', 'lost')
    .get();
  let chargebacksCount = 0;
  for (const alertDoc of lostAlertsSnap.docs) {
    const data = alertDoc.data() as {
      isChargebackRisk?: boolean;
      updatedAt?: unknown;
      campaignEndedAt?: unknown;
    };
    if (!data.isChargebackRisk) continue;
    // Use the campaign-ended stamp when present (canonical "this
    // became a chargeback at"); fall back to updatedAt for older
    // alerts that pre-date that field.
    const lostMs = timestampMillis(data.campaignEndedAt) ?? timestampMillis(data.updatedAt);
    if (lostMs === null) continue;
    if (lostMs >= fromMs && lostMs < toMs) {
      chargebacksCount += 1;
    }
  }

  // ── Referrals received in window ──
  // Each referral has its own doc under agents/{id}/referrals/{id}
  // with a createdAt timestamp (server-stamped at creation).
  const referralsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('referrals')
    .get();
  let referralsReceived = 0;
  for (const refDoc of referralsSnap.docs) {
    const data = refDoc.data() as {
      createdAt?: unknown;
      receivedAt?: unknown;
    };
    // createdAt is the canonical Firestore stamp; some legacy paths
    // (early Linq webhook) used receivedAt as an ISO string instead.
    // Try the canonical one first, then parse the ISO string.
    let createdMs: number | null = timestampMillis(data.createdAt);
    if (createdMs === null && typeof data.receivedAt === 'string') {
      const parsed = Date.parse(data.receivedAt);
      if (Number.isFinite(parsed)) createdMs = parsed;
    }
    if (createdMs === null) continue;
    if (createdMs >= fromMs && createdMs < toMs) {
      referralsReceived += 1;
    }
  }

  // ── Business-health rates ──
  // All three use salesCount this period as the denominator. Period
  // view is mathematically loose (chargebacks may be on policies sold
  // months ago) but matches agent intuition: "of my sales this month,
  // what's my chargeback ratio." Same shape for the other two.
  const chargebackRate = salesCount > 0 ? chargebacksCount / salesCount : 0;
  const referralsPerClose = salesCount > 0 ? referralsReceived / salesCount : 0;
  const rewriteCount = sourceBuckets.rewrite.count;
  const rewriteRate = salesCount > 0 ? rewriteCount / salesCount : 0;

  // ── Period-over-period deltas ──
  const pct = (curr: number, prev: number): number | null => {
    if (prev === 0) return curr > 0 ? 100 : null;
    return ((curr - prev) / prev) * 100;
  };

  // ── Funnel + source breakdown shaping ──
  // Each row's pctOfPrev is "what fraction of the previous stage's
  // count advanced to this one." For Dials/Contacts/Booked we use the
  // raw count ratio. For Showed we use `showRate` instead of the raw
  // showed/booked so the funnel matches the Show Rate tile (which
  // correctly excludes pending + cancelled from the denominator).
  // Closed already uses showed as its base, which matches the Close
  // Rate tile. Net effect: every rate on the page agrees with itself.
  const funnel = [
    { stage: 'Dials', count: dialsCurr.total, pctOfPrev: null as number | null },
    { stage: 'Contacts', count: dialsCurr.contacts, pctOfPrev: dialsCurr.total > 0 ? dialsCurr.contacts / dialsCurr.total : null },
    { stage: 'Booked', count: booked, pctOfPrev: dialsCurr.contacts > 0 ? booked / dialsCurr.contacts : null },
    { stage: 'Showed', count: showed, pctOfPrev: showRate || null },
    { stage: 'Closed', count: salesCount, pctOfPrev: showed > 0 ? salesCount / showed : null },
  ];

  const totalApv = salesApv || 1; // avoid div-by-zero in pct calc
  const bySource = (Object.keys(sourceBuckets) as PolicySource[]).map((source) => {
    const bucket = sourceBuckets[source];
    return {
      source,
      label: POLICY_SOURCE_LABELS[source],
      color: POLICY_SOURCE_COLORS[source],
      count: bucket.count,
      apv: bucket.apv,
      pct: salesApv > 0 ? (bucket.apv / totalApv) * 100 : 0,
    };
  });

  // Sort recent wins newest-first, cap at 10.
  recentWins.sort((a, b) => (b.at > a.at ? 1 : -1));
  const recentWinsCapped = recentWins.slice(0, 10);

  return {
    range: {
      from: win.from.toISOString(),
      to: win.to.toISOString(),
      label: ACTIVITY_RANGE_LABELS[range],
      key: range,
    },
    dials: {
      total: dialsCurr.total,
      contacts: dialsCurr.contacts,
      contactRate: dialsCurr.total > 0 ? dialsCurr.contacts / dialsCurr.total : 0,
      deltaPct: pct(dialsCurr.total, dialsPrev.total),
    },
    appointments: {
      booked,
      showed,
      noShowed,
      cancelled,
      unresolved,
      showRate,
      bookRate,
      deltaPct: pct(booked, bookedPrev),
    },
    sales: {
      count: salesCount,
      apv: salesApv,
      closeRate: showed > 0 ? salesCount / showed : 0,
      deltaPct: pct(salesCount, salesCountPrev),
      bySource,
    },
    saved: {
      apv: savedApv,
      count: savedCount,
      deltaPct: pct(savedApv, savedApvPrev),
    },
    chargebacks: {
      count: chargebacksCount,
      rate: chargebackRate,
    },
    referralsActivity: {
      received: referralsReceived,
      perClose: referralsPerClose,
    },
    rewrites: {
      count: rewriteCount,
      rate: rewriteRate,
    },
    funnel,
    recentWins: recentWinsCapped,
  };
}
