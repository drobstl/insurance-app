// Pure logic for the in-app reset reveal (the "advanced market sit" door).
// No firebase / server-only imports so it stays unit-testable: the routes
// fetch the docs and hand the plain data in.
//
// Compliance note: this intentionally exposes only the client's OWN facts —
// their mortgage balance and monthly payment. It never computes or returns a
// projected payoff date, cash value, or rate of return; those are regulated
// illustrations and belong to the licensed specialist, not an auto-played
// card. The reveal copy frames the upside conceptually around these facts.

/** Cadence fields stamped on the client doc — keep the reveal an event, not a nag. */
export const RESET_REVEAL_SHOWN_AT = 'resetRevealShownAt';
export const RESET_REVEAL_DISMISSED_AT = 'resetRevealDismissedAt';
export const RESET_REVEAL_ENGAGED_AT = 'resetRevealEngagedAt';

/** At most one reveal per client per ~quarter (after a show, dismiss, or engage). */
export const RESET_REVEAL_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export interface ResetRevealData {
  firstName: string;
  agentFirstName: string;
  agentPhotoBase64: string;
  /** Their own facts — null when we don't hold them (the concept-only path). */
  mortgageBalance: number | null;
  monthlyPayment: number | null;
  /** True when we have a real mortgage balance → the fully personalized reveal. */
  hasRealNumbers: boolean;
  /** Specialist calendar, else the agent's own calendar, else '' (agent follows up). */
  schedulingUrl: string;
}

export type ResetRevealDecision =
  | { show: false; reason: string }
  | { show: true; reveal: ResetRevealData };

function firstWord(s?: string | null): string {
  return (s || '').trim().split(/\s+/)[0] || '';
}

/** Firestore Timestamp | ISO string | Date → epoch ms (null if unparseable). */
function toMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'object' && v !== null && 'toDate' in v
    && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

/**
 * Where the reveal's "see if my family qualifies" books. The reset hands off to
 * the upline specialist, so a configured SME calendar wins; failing that the
 * agent's own scheduling link; failing that empty (the agent reaches out).
 */
export function resolveResetSchedulingUrl(agentData: Record<string, unknown>): string {
  const smes = Array.isArray(agentData.fifResetSmes) ? agentData.fifResetSmes : [];
  for (const s of smes) {
    if (s && typeof s === 'object') {
      const url = (s as { calendarUrl?: unknown }).calendarUrl;
      if (typeof url === 'string' && url.trim()) return url.trim();
    }
  }
  if (typeof agentData.schedulingUrl === 'string' && agentData.schedulingUrl.trim()) {
    return agentData.schedulingUrl.trim();
  }
  return '';
}

export interface ResetRevealDecisionOpts {
  now?: number;
  cooldownMs?: number;
}

/**
 * Decide whether to show the reveal to this client right now, and with what.
 * Server-owned so the cadence is consistent and tunable in one place.
 */
export function buildResetRevealDecision(
  clientData: Record<string, unknown>,
  agentData: Record<string, unknown>,
  opts: ResetRevealDecisionOpts = {},
): ResetRevealDecision {
  const now = opts.now ?? Date.now();
  const cooldown = opts.cooldownMs ?? RESET_REVEAL_COOLDOWN_MS;

  // Gate 1 — activated clients only. The reveal is a post-activation client
  // experience; unactivated clients are still in the onboarding funnel.
  if (!toMs(clientData.clientActivatedAt)) return { show: false, reason: 'not_activated' };

  // Gate 2 — event, not nag. Cool down after any prior show / dismiss / engage.
  const lastTouch = Math.max(
    toMs(clientData[RESET_REVEAL_SHOWN_AT]) ?? 0,
    toMs(clientData[RESET_REVEAL_DISMISSED_AT]) ?? 0,
    toMs(clientData[RESET_REVEAL_ENGAGED_AT]) ?? 0,
  );
  if (lastTouch && now - lastTouch < cooldown) return { show: false, reason: 'cooldown' };

  const mortgage = clientData.mortgageDetails;
  const mortgageBalance =
    mortgage && typeof mortgage === 'object'
      && typeof (mortgage as { balance?: unknown }).balance === 'number'
      ? (mortgage as { balance: number }).balance
      : null;
  const monthlyPayment =
    typeof clientData.monthlyMortgageAmount === 'number' ? clientData.monthlyMortgageAmount : null;

  return {
    show: true,
    reveal: {
      firstName: firstWord(typeof clientData.name === 'string' ? clientData.name : ''),
      agentFirstName: firstWord(typeof agentData.name === 'string' ? agentData.name : '') || 'your agent',
      agentPhotoBase64: typeof agentData.photoBase64 === 'string' ? agentData.photoBase64 : '',
      mortgageBalance,
      monthlyPayment,
      hasRealNumbers: mortgageBalance != null,
      schedulingUrl: resolveResetSchedulingUrl(agentData),
    },
  };
}
