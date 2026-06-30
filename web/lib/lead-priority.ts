/**
 * Pre-connection "promise" score for a fresh lead — how promising a lead
 * looks BEFORE the agent has spoken to them, from data known at ingestion.
 *
 * Why this exists: the call queue's never-dialed tier orders fresh leads by
 * recency alone (newest first), so a hot call-in with a big mortgage sits at
 * the same level as a cold mail-in card from the same afternoon. When a batch
 * of leads lands, the good ones get buried by volume. This score ranks the
 * never-dialed pile so "Start calling" works the most promising leads first.
 *
 * Signals + weighting mirror how we actually triage (Daniel, Jun 30):
 * call-ins first → freshest → bigger mortgages, with age-fit and a co-borrower
 * as light nudges. App-engagement is deliberately NOT a signal: a lead can't
 * open the app until after we've reached them, so it can never tell us who to
 * call first.
 *
 * The score is in [0,1]. It is the sub-sort inside the never-dialed queue tier
 * (see `queueLeads` in the leads page). `leadPriorityReasons` explains the
 * score to the agent so the ordering is never a black box.
 *
 * Pure module: it takes plain primitives (see `LeadPriorityInput`) so it can
 * be unit-tested without Firestore Timestamps. `toPriorityInput` adapts a lead
 * doc into that shape.
 */

export interface LeadPriorityInput {
  /** Lead source / form type, e.g. 'Call-In' | 'Digital' | 'Mail-In'. */
  formType?: string | null;
  /** Lead creation time in epoch ms (speed-to-lead / freshness). */
  createdAtMs?: number | null;
  /** Mortgage LOAN amount (mortgageDetails.balance), USD — NOT the monthly payment. */
  mortgageBalance?: number | null;
  /** Lead age in years (mortgage-protection / final-expense fit). */
  ageYears?: number | null;
  /** A co-borrower on the mortgage = a second insurable life. */
  hasCoborrower?: boolean;
}

// Relative weights — they sum to 1.0. Order mirrors how we triage: source
// dominates, then freshness, then mortgage size; age + co-borrower are light
// nudges. Tune the blend here.
export const PRIORITY_WEIGHTS = {
  source: 0.38,
  freshness: 0.26,
  mortgage: 0.2,
  ageFit: 0.1,
  coborrower: 0.06,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
// Past this, a lead is no longer "fresh" — it's at/after the ~2-week
// exclusivity window where speed-to-lead has stopped mattering.
const FRESH_FLOOR_DAYS = 14;
// Mortgage balance at which the size signal saturates — beyond this, bigger
// doesn't keep adding priority (a $1.2M and a $600k loan are both "big").
const MORTGAGE_SATURATION = 600_000;

/** Source intent: a call-in dialed the number on the mailer themselves
 *  (highest intent); a digital form is mid; a returned mail card is passive;
 *  CSV/manual/unknown imports are neutral-low. */
function sourceScore(formType?: string | null): number {
  switch ((formType || '').trim().toLowerCase()) {
    case 'call-in':
      return 1.0;
    case 'digital':
      return 0.65;
    case 'mail-in':
      return 0.45;
    default:
      return 0.3;
  }
}

/** Freshness: full credit for the first 24h, decaying to near-zero by the
 *  ~2-week exclusivity floor. Unknown created time → neutral-ish (don't
 *  punish a lead just because the timestamp is missing). */
function freshnessScore(createdAtMs: number | null | undefined, nowMs: number): number {
  if (!createdAtMs) return 0.3;
  const ageDays = Math.max(0, (nowMs - createdAtMs) / DAY_MS);
  if (ageDays <= 1) return 1.0;
  if (ageDays >= FRESH_FLOOR_DAYS) return 0.05;
  // Linear decay 1.0 → 0.05 across days 1..FRESH_FLOOR_DAYS.
  return 1 - ((ageDays - 1) / (FRESH_FLOOR_DAYS - 1)) * 0.95;
}

/** Mortgage size: bigger balance = bigger potential policy. Floors at 0.3 for
 *  unknown/zero (neutral, not penalized), rising to 1.0 at the saturation cap. */
function mortgageScore(balance?: number | null): number {
  if (!balance || balance <= 0) return 0.3;
  const capped = Math.min(balance, MORTGAGE_SATURATION);
  return 0.3 + 0.7 * (capped / MORTGAGE_SATURATION);
}

/** Age fit: prime window for mortgage protection / final expense is ~30–62,
 *  tapering to the edges; unknown age → neutral 0.5. Light weight. */
function ageFitScore(ageYears?: number | null): number {
  if (ageYears == null || ageYears <= 0) return 0.5;
  if (ageYears >= 30 && ageYears <= 62) return 1.0;
  if (ageYears < 30) {
    if (ageYears < 18) return 0.2;
    return 0.2 + ((ageYears - 18) / 12) * 0.8; // 18→0.2 .. 30→1.0
  }
  if (ageYears <= 80) return 1.0 - ((ageYears - 62) / 18) * 0.6; // 62→1.0 .. 80→0.4
  return 0.2;
}

/** Combined pre-connection promise score in [0,1]. */
export function leadPriorityScore(input: LeadPriorityInput, nowMs: number): number {
  const w = PRIORITY_WEIGHTS;
  return (
    w.source * sourceScore(input.formType) +
    w.freshness * freshnessScore(input.createdAtMs, nowMs) +
    w.mortgage * mortgageScore(input.mortgageBalance) +
    w.ageFit * ageFitScore(input.ageYears) +
    w.coborrower * (input.hasCoborrower ? 1 : 0)
  );
}

export type LeadPriorityTier = 'top' | 'strong' | 'standard';

/** Bucket a score for UI emphasis. Thresholds chosen so a fresh call-in (any
 *  mortgage) lands in 'top', a decent digital/mail-in lands 'strong', and a
 *  stale or low-signal lead is 'standard'. */
export function leadPriorityTier(score: number): LeadPriorityTier {
  if (score >= 0.66) return 'top';
  if (score >= 0.45) return 'strong';
  return 'standard';
}

/** Short, agent-facing "why this is near the top" — only genuinely positive
 *  contributors, most important first. Empty for unremarkable leads, so the
 *  chip simply doesn't render. */
export function leadPriorityReasons(input: LeadPriorityInput, nowMs: number): string[] {
  const out: string[] = [];
  const ft = (input.formType || '').trim().toLowerCase();
  if (ft === 'call-in') out.push('Called in');
  else if (ft === 'digital') out.push('Online form');
  if (freshnessScore(input.createdAtMs, nowMs) >= 0.8) out.push('Fresh');
  if (input.mortgageBalance && input.mortgageBalance >= 200_000) {
    out.push(`$${Math.round(input.mortgageBalance / 1000)}k mortgage`);
  }
  if (input.hasCoborrower) out.push('Co-borrower');
  return out;
}

/** Adapt a lead doc (Firestore-shaped) into the pure scoring input. Accepts a
 *  client Timestamp (toMillis/toDate) on createdAt. Mortgage size reads
 *  `mortgageDetails.balance` (the loan amount) — NOT `monthlyMortgageAmount`,
 *  which is the monthly payment and usually absent on fresh leads. */
export function toPriorityInput(lead: {
  formType?: string;
  createdAt?: { toMillis?: () => number; toDate?: () => Date } | null;
  mortgageDetails?: { balance?: number } | null;
  ageYears?: number;
  coborrowerStatus?: 'Y' | 'N' | null;
}): LeadPriorityInput {
  const createdAtMs =
    lead.createdAt?.toMillis?.() ?? lead.createdAt?.toDate?.().getTime() ?? null;
  return {
    formType: lead.formType ?? null,
    createdAtMs,
    mortgageBalance: lead.mortgageDetails?.balance ?? null,
    ageYears: lead.ageYears ?? null,
    hasCoborrower: lead.coborrowerStatus === 'Y',
  };
}
