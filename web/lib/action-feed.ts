import type { Timestamp } from 'firebase/firestore';

// ── Interfaces ───────────────────────────────────────────────────────────────

export type ActionType =
  | 'conservation'
  | 'birthday-followup'
  | 'holiday-followup'
  | 'referral'
  | 'anniversary-rewrite'
  | 'warm-list';

export interface ActionItem {
  id: string;
  type: ActionType;
  score: number;
  urgent: boolean;
  headline: string;
  reason: string;
  revenue?: number;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  route: string;
  pushData?: { clientId: string; title: string; body: string };
  smsBody?: string;
}

export interface ActionClient {
  id: string;
  name: string;
  dateOfBirth?: string;
  pushToken?: string;
  birthdayNotifiedAt?: string;
  birthdayCardSentAt?: unknown;
  sourceReferralId?: string;
  email?: string;
  phone?: string;
  createdAt?: Timestamp;
}

export interface ActionPolicy {
  id: string;
  policyType: string;
  policyNumber: string;
  coverageAmount: number;
  premiumAmount: number;
  effectiveDate?: string;
  status: 'Active' | 'Pending' | 'Lapsed';
  createdAt: Timestamp;
}

export interface ActionConservationAlert {
  id: string;
  clientName: string;
  carrier: string;
  reason: string;
  priority: string;
  status: string;
  isChargebackRisk: boolean;
  policyType: string | null;
  premiumAmount?: number;
  aiInsight: string | null;
  createdAt: Timestamp;
}

export interface ActionReferral {
  id: string;
  referralName: string;
  clientName: string;
  status: string;
  appointmentBooked: boolean;
  createdAt: unknown;
}

export interface ActionAnniversaryAlert {
  clientName: string;
  clientId: string;
  policy: ActionPolicy;
  anniversaryDate: Date;
}

// ── Score helpers ────────────────────────────────────────────────────────────

function isBirthdayToday(dob: string | undefined): boolean {
  if (!dob) return false;
  const now = new Date();
  const m = now.getMonth();
  const d = now.getDate();

  const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return parseInt(iso[2], 10) - 1 === m && parseInt(iso[3], 10) === d;

  const us = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return parseInt(us[1], 10) - 1 === m && parseInt(us[2], 10) === d;

  return false;
}

function isBirthdayThisWeek(dob: string | undefined): boolean {
  if (!dob) return false;
  const now = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const check = new Date(now);
    check.setDate(check.getDate() + offset);
    const m = check.getMonth();
    const d = check.getDate();

    const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso && parseInt(iso[2], 10) - 1 === m && parseInt(iso[3], 10) === d) return true;

    const us = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us && parseInt(us[1], 10) - 1 === m && parseInt(us[2], 10) === d) return true;
  }
  return false;
}

// ── Build the feed ──────────────────────────────────────────────────────────

export function buildActionFeed(
  clients: ActionClient[],
  policies: ActionPolicy[],
  conservationAlerts: ActionConservationAlert[],
  referrals: ActionReferral[],
  anniversaryAlerts: ActionAnniversaryAlert[],
  agentName: string,
): ActionItem[] {
  const items: ActionItem[] = [];

  // 1. Conservation alerts → base 90, +10 chargeback
  const activeAlerts = conservationAlerts.filter(
    (a) => a.status !== 'saved' && a.status !== 'lost',
  );
  for (const alert of activeAlerts) {
    const base = 90;
    const chargebackBonus = alert.isChargebackRisk ? 10 : 0;
    const score = base + chargebackBonus;
    items.push({
      id: `conservation-${alert.id}`,
      type: 'conservation',
      score,
      urgent: score >= 80,
      headline: `${alert.clientName} — ${alert.carrier}`,
      reason: alert.isChargebackRisk
        ? 'Chargeback risk — act now'
        : alert.reason === 'lapsed_payment'
          ? 'Lapsed payment — policy at risk'
          : 'Policy at risk',
      revenue: alert.premiumAmount,
      clientName: alert.clientName,
      route: '/dashboard/conservation',
    });
  }

  // 2. Birthday follow-ups → base 60, +5 no referrals, +5 has pushToken
  const currentYear = new Date().getFullYear().toString();
  for (const client of clients) {
    if (!isBirthdayThisWeek(client.dateOfBirth)) continue;
    if (client.birthdayCardSentAt === currentYear) continue;

    let score = 60;
    const hasReferrals = referrals.some((r) => r.clientName === client.name);
    if (!hasReferrals) score += 5;
    if (client.pushToken) score += 5;

    const isToday = isBirthdayToday(client.dateOfBirth);
    const firstName = client.name.split(' ')[0];

    items.push({
      id: `birthday-${client.id}`,
      type: 'birthday-followup',
      score,
      urgent: score >= 80,
      headline: `${client.name} — Birthday${isToday ? ' Today!' : ' This Week'}`,
      reason: isToday
        ? 'Send a birthday message now'
        : 'Upcoming birthday — great touchpoint',
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      route: '/dashboard/clients',
      smsBody: `Happy Birthday, ${firstName}! Hope you have an amazing day. — ${agentName}`,
      pushData: client.pushToken
        ? {
            clientId: client.id,
            title: 'Happy Birthday! 🎂',
            body: `Happy Birthday, ${firstName}! Wishing you a wonderful day. — ${agentName}`,
          }
        : undefined,
    });
  }

  // 3. Referrals → base 70
  const activeReferrals = referrals.filter(
    (r) =>
      r.status === 'active' ||
      r.status === 'outreach-sent' ||
      r.status === 'drip-1' ||
      r.status === 'drip-2',
  );
  for (const ref of activeReferrals) {
    items.push({
      id: `referral-${ref.id}`,
      type: 'referral',
      score: 70,
      urgent: false,
      headline: ref.referralName,
      reason: `Referred by ${ref.clientName} — in conversation`,
      route: '/dashboard/referrals',
    });
  }

  // 4. Anniversary rewrites → base 65
  for (const alert of anniversaryAlerts.slice(0, 5)) {
    const daysUntil = Math.ceil(
      (alert.anniversaryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    items.push({
      id: `anniversary-${alert.clientId}-${alert.policy.id}`,
      type: 'anniversary-rewrite',
      score: 65,
      urgent: false,
      headline: `${alert.clientName} — ${alert.policy.policyType}`,
      reason:
        daysUntil === 0
          ? '1-year anniversary is today — review for rewrite'
          : daysUntil === 1
            ? '1-year anniversary tomorrow'
            : `1-year anniversary in ${daysUntil} days`,
      revenue: alert.policy.premiumAmount,
      clientId: alert.clientId,
      clientName: alert.clientName,
      route: '/dashboard/clients',
    });
  }

  // 5. Warm-list (clients with no recent touchpoint and no referrals)
  const referralClientNames = new Set(referrals.map((r) => r.clientName));
  const alertClientNames = new Set(conservationAlerts.map((a) => a.clientName));
  const anniversaryClientIds = new Set(anniversaryAlerts.map((a) => a.clientId));
  const birthdayClientIds = new Set(
    items.filter((i) => i.type === 'birthday-followup').map((i) => i.clientId),
  );

  for (const client of clients) {
    if (alertClientNames.has(client.name)) continue;
    if (anniversaryClientIds.has(client.id)) continue;
    if (birthdayClientIds.has(client.id)) continue;

    const noReferrals = !referralClientNames.has(client.name);
    const hasPush = !!client.pushToken;
    let score = 30;
    if (noReferrals) score += 10;
    if (hasPush) score += 10;

    if (score < 35) continue;

    const firstName = client.name.split(' ')[0];
    items.push({
      id: `warm-${client.id}`,
      type: 'warm-list',
      score,
      urgent: false,
      headline: client.name,
      reason: noReferrals
        ? 'No referrals yet — check in and ask'
        : 'Good time for a check-in',
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      route: '/dashboard/clients',
      smsBody: `Hi ${firstName}, just checking in — how's everything going? Let me know if you have any questions about your coverage. — ${agentName}`,
      pushData: hasPush
        ? {
            clientId: client.id,
            title: 'Check-In',
            body: `Hi ${firstName}, just wanted to check in and see how things are going. — ${agentName}`,
          }
        : undefined,
    });
  }

  // Sort descending by score
  items.sort((a, b) => b.score - a.score);

  return items;
}
