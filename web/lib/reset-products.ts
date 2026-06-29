// Pure, server-safe product matching for the reset reveal's five "Direct to
// Reset" doors (Quility's FIF form types). No firebase / 'use client' imports —
// the mobile decision route (reset-reveal.ts) AND the unit smoke test both
// import this, so it must stay framework-free.
//
// Compliance / naming: the ids + agentLabel below are AGENT-FACING ONLY and are
// never sent to a client. The mobile app maps the id → the client-facing copy +
// concept visual; the words "FIF reset" are never shown to a client.

export type ResetProductId = 'DFL' | 'Annuity' | 'QFA' | 'IUL' | 'IBC';

export const RESET_PRODUCT_IDS: readonly ResetProductId[] = [
  'DFL',
  'Annuity',
  'QFA',
  'IUL',
  'IBC',
] as const;

export function isResetProductId(v: unknown): v is ResetProductId {
  return typeof v === 'string' && (RESET_PRODUCT_IDS as readonly string[]).includes(v);
}

export interface ResetProductMeta {
  id: ResetProductId;
  /** Agent-facing label for the override picker. NEVER shown to a client. */
  agentLabel: string;
  /** One-line agent hint of who it fits (override menu helper). */
  agentHint: string;
  /** 'auto' = the matcher can suggest it from data; 'manual' = agent picks. */
  select: 'auto' | 'manual';
}

export const RESET_PRODUCTS: Record<ResetProductId, ResetProductMeta> = {
  DFL: {
    id: 'DFL',
    agentLabel: 'Debt-Free Life',
    agentHint: 'Has a mortgage / debt',
    select: 'auto',
  },
  Annuity: {
    id: 'Annuity',
    agentLabel: 'Annuity — market-loss protection',
    agentHint: 'Savings, no debt; fears a market drop',
    select: 'auto',
  },
  QFA: {
    id: 'QFA',
    agentLabel: 'Qualified plan (old 401k / IRA)',
    agentHint: 'Idle qualified money; wants guidance',
    select: 'manual',
  },
  IUL: {
    id: 'IUL',
    agentLabel: 'IUL — tax-free retirement income',
    agentHint: 'Wants tax-advantaged retirement income',
    select: 'manual',
  },
  IBC: {
    id: 'IBC',
    agentLabel: 'Be your own bank',
    agentHint: 'Wants to self-finance & keep the interest',
    select: 'manual',
  },
};

// Free-text asset labels (agent-typed in the fact-finder) that read as
// retirement / qualified money. "Savings" deliberately does NOT count — the
// no-debt path is specifically about an old 401k / IRA, not a checking buffer.
const RETIREMENT_LABEL = /401|403\s*b|\bira\b|roth|annuit|pension|retire|\btsp\b|\b457\b/i;

// "$20k in an old 401k" — the FIF screen's threshold for the no-debt asset path.
export const QUALIFYING_RETIREMENT_ASSETS = 20_000;

/** "$50,000" | 50000 → number. Local copy of household.ts toNum (that module is 'use client'). */
function parseAmount(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : 0;
}

interface AssetRow {
  label?: unknown;
  amount?: unknown;
}

/** Sum of the client's retirement-looking household assets (0 when none on file). */
export function retirementAssetsTotal(clientData: Record<string, unknown>): number {
  const hh = clientData?.household as { assets?: unknown } | undefined;
  const assets = Array.isArray(hh?.assets) ? (hh.assets as AssetRow[]) : [];
  return assets.reduce((sum, a) => {
    const label = typeof a?.label === 'string' ? a.label : '';
    return RETIREMENT_LABEL.test(label) ? sum + parseAmount(a?.amount) : sum;
  }, 0);
}

/** True when we hold any mortgage/debt fact for the client. */
export function hasMortgageDebt(clientData: Record<string, unknown>): boolean {
  const mortgage = clientData?.mortgageDetails as { balance?: unknown } | undefined;
  const balance = typeof mortgage?.balance === 'number' ? mortgage.balance : 0;
  const payment =
    typeof clientData?.monthlyMortgageAmount === 'number'
      ? (clientData.monthlyMortgageAmount as number)
      : 0;
  return balance > 0 || payment > 0;
}

export type ResetMatchSource = 'override' | 'debt' | 'assets' | 'default';

export interface ResetMatch {
  product: ResetProductId;
  source: ResetMatchSource;
  /** Agent-facing one-liner explaining the pick (never shown to a client). */
  reason: string;
}

/**
 * Pick the reset product for a client from the facts we already hold:
 *   1. an explicit, valid agent override always wins;
 *   2. a mortgage / debt on file → Debt-Free Life;
 *   3. no debt + retirement savings on file → Annuity;
 *   4. otherwise Annuity as the gentle default (agent can switch in one tap).
 * QFA / IUL / IBC are intent-based — the agent selects those via the override.
 */
export function matchResetProduct(clientData: Record<string, unknown>): ResetMatch {
  const override = clientData?.resetProductOverride;
  if (isResetProductId(override)) {
    return { product: override, source: 'override', reason: 'You chose this for the client.' };
  }
  if (hasMortgageDebt(clientData)) {
    return { product: 'DFL', source: 'debt', reason: 'Has a mortgage on file.' };
  }
  if (retirementAssetsTotal(clientData) >= QUALIFYING_RETIREMENT_ASSETS) {
    return { product: 'Annuity', source: 'assets', reason: 'Retirement savings on file, no debt.' };
  }
  return { product: 'Annuity', source: 'default', reason: 'No mortgage on file — confirm the best fit.' };
}
