import 'server-only';

/**
 * Server-side client for FirstPromoter's admin API v2.
 *
 * Docs: https://docs.firstpromoter.com/api-reference-v2/api-admin/
 *
 * Auth: API key + Account-ID, both from FP dashboard
 *   Settings → Integrations → Manage API Keys.
 *
 * The two env vars are independent. If either is missing,
 * `isFirstPromoterConfigured()` returns false and the routes that
 * depend on it should respond with `affiliate_program_unavailable`
 * (the dashboard surface treats that as a "Coming soon" state without
 * breaking).
 */

const API_BASE = 'https://api.firstpromoter.com/api/v2';

export interface FirstPromoterPromoter {
  id: number;
  email: string;
  // Top-level campaign tracking fields. The v2 docs return these on
  // the promoter object when it has a single campaign association.
  ref_token?: string | null;
  ref_link?: string | null;
  coupon?: string | null;
  // Multi-campaign cases — the response also has a
  // `promoter_campaigns` array with per-campaign tokens/links. We
  // pull the first entry as a fallback.
  promoter_campaigns?: Array<{
    ref_token?: string | null;
    ref_link?: string | null;
    coupon?: string | null;
    campaign?: { id?: number; name?: string } | null;
  }>;
}

export interface FirstPromoterCreatePayload {
  email: string;
  /** Optional human-readable id, e.g. our agent uid. */
  cust_id?: string;
  /** Optional initial campaign — falls through to FP's default when omitted. */
  initial_campaign_id?: number;
  /** Send FP's welcome email to the affiliate. */
  drip_emails?: boolean;
  profile?: {
    first_name?: string;
    last_name?: string;
    company_name?: string;
  };
}

/** Returns true if both required env vars are present. */
export function isFirstPromoterConfigured(): boolean {
  return Boolean(
    process.env.FIRSTPROMOTER_API_KEY?.trim() &&
      process.env.FIRSTPROMOTER_ACCOUNT_ID?.trim(),
  );
}

function authHeaders(): Record<string, string> {
  const key = process.env.FIRSTPROMOTER_API_KEY?.trim() || '';
  const accountId = process.env.FIRSTPROMOTER_ACCOUNT_ID?.trim() || '';
  return {
    Authorization: `Bearer ${key}`,
    'Account-ID': accountId,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function resolveCampaignId(): number | undefined {
  const raw = process.env.FIRSTPROMOTER_CAMPAIGN_ID?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Extract the tracking link + token from a promoter response. v2
 * sometimes returns it on the top-level object, sometimes inside
 * `promoter_campaigns[0]` — handle both.
 */
export function extractAffiliateFields(promoter: FirstPromoterPromoter): {
  refLink: string | null;
  refToken: string | null;
  coupon: string | null;
} {
  const refLink =
    promoter.ref_link ||
    promoter.promoter_campaigns?.[0]?.ref_link ||
    null;
  const refToken =
    promoter.ref_token ||
    promoter.promoter_campaigns?.[0]?.ref_token ||
    null;
  const coupon =
    promoter.coupon || promoter.promoter_campaigns?.[0]?.coupon || null;
  return { refLink, refToken, coupon };
}

/**
 * Create a new promoter in FirstPromoter. Returns the promoter
 * object. Throws on non-2xx with a `FirstPromoterApiError`.
 */
export async function createFirstPromoterPromoter(
  payload: FirstPromoterCreatePayload,
): Promise<FirstPromoterPromoter> {
  if (!isFirstPromoterConfigured()) {
    throw new FirstPromoterApiError(
      'FirstPromoter API key + Account-ID are not configured.',
      503,
      'not_configured',
    );
  }
  const body = JSON.stringify({
    ...payload,
    initial_campaign_id: payload.initial_campaign_id ?? resolveCampaignId(),
  });
  const response = await fetch(`${API_BASE}/company/promoters`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response body — fall through with parsed=null
  }
  if (!response.ok) {
    const errorMessage =
      (parsed as { error?: string; message?: string } | null)?.error ||
      (parsed as { error?: string; message?: string } | null)?.message ||
      `FirstPromoter create failed (HTTP ${response.status})`;
    const code = inferErrorCode(response.status, errorMessage);
    throw new FirstPromoterApiError(errorMessage, response.status, code, parsed);
  }
  return parsed as FirstPromoterPromoter;
}

/**
 * Look up an existing promoter by email. Returns null if none found.
 * Used to recover from "already exists" when creating, and to refresh
 * an affiliate's ref_link if the local cache is missing.
 */
export async function getFirstPromoterPromoterByEmail(
  email: string,
): Promise<FirstPromoterPromoter | null> {
  if (!isFirstPromoterConfigured()) {
    throw new FirstPromoterApiError(
      'FirstPromoter API key + Account-ID are not configured.',
      503,
      'not_configured',
    );
  }
  const url = new URL(`${API_BASE}/company/promoters`);
  url.searchParams.set('email', email);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON
  }
  if (!response.ok) {
    const errorMessage =
      (parsed as { error?: string; message?: string } | null)?.error ||
      `FirstPromoter lookup failed (HTTP ${response.status})`;
    throw new FirstPromoterApiError(
      errorMessage,
      response.status,
      inferErrorCode(response.status, errorMessage),
      parsed,
    );
  }
  // The list endpoint typically returns either a single object or an
  // array of matches — normalize.
  if (Array.isArray(parsed)) {
    return (parsed[0] as FirstPromoterPromoter) || null;
  }
  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    const arr = (parsed as { data?: unknown[] }).data;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr[0] as FirstPromoterPromoter;
    }
    return null;
  }
  return (parsed as FirstPromoterPromoter) || null;
}

export interface FirstPromoterCommission {
  id?: number;
  amount?: number;
  status?: 'pending' | 'approved' | 'denied' | string;
  is_paid?: boolean;
  unit?:
    | 'cash'
    | 'credits'
    | 'points'
    | 'free_months'
    | 'mon_discount'
    | 'discount_per'
    | string;
}

export interface PromoterEarningsSummary {
  /** Approved AND already paid out. */
  paidCents: number;
  /** Approved but not yet paid — the money the agent is owed. */
  owedCents: number;
  /** Not yet approved (signed up, still in the hold window). */
  pendingCents: number;
  /** paidCents + owedCents — lifetime approved earnings. */
  earnedCents: number;
  /** Count of cash commissions summed (not distinct referrals). */
  commissionsCount: number;
  /** True if the page cap was hit and totals are a lower bound. */
  truncated: boolean;
}

/**
 * Sum a single promoter's cash commissions into a small earnings
 * summary for in-app display. Pages through the admin commissions
 * endpoint filtered to one promoter. Non-cash rewards
 * (credits/points/discounts) are skipped — we only surface dollars.
 *
 * Robustness notes:
 *  - Commissions are de-duped by `id` across pages, so the totals stay
 *    correct even if FP ignores our pagination params and re-serves the
 *    same page (we stop as soon as a page adds nothing new).
 *  - FP returns `amount` as an integer; the v2 docs don't state the unit
 *    explicitly. We treat it as CENTS. Confirm against a live promoter
 *    before trusting the figures (see scripts/firstpromoter-smoke).
 */
export async function getPromoterEarningsSummary(
  promoterId: number,
): Promise<PromoterEarningsSummary> {
  if (!isFirstPromoterConfigured()) {
    throw new FirstPromoterApiError(
      'FirstPromoter API key + Account-ID are not configured.',
      503,
      'not_configured',
    );
  }
  const PER_PAGE = 100;
  const MAX_PAGES = 25; // safety backstop (~2,500 commissions)
  const seen = new Set<number>();
  let paidCents = 0;
  let owedCents = 0;
  let pendingCents = 0;
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${API_BASE}/company/commissions`);
    url.searchParams.set('filters[promoter_id]', String(promoterId));
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('page', String(page));
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: authHeaders(),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON body
    }
    if (!response.ok) {
      const message =
        (parsed as { error?: string } | null)?.error ||
        `FirstPromoter commissions fetch failed (HTTP ${response.status})`;
      throw new FirstPromoterApiError(
        message,
        response.status,
        inferErrorCode(response.status, message),
        parsed,
      );
    }
    const list: FirstPromoterCommission[] = Array.isArray(parsed)
      ? (parsed as FirstPromoterCommission[])
      : Array.isArray((parsed as { data?: unknown[] } | null)?.data)
        ? (parsed as { data: FirstPromoterCommission[] }).data
        : [];

    let addedThisPage = 0;
    for (const c of list) {
      // De-dupe by id so a non-advancing paginator can't double-count.
      if (typeof c.id === 'number') {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
      }
      addedThisPage += 1;
      // Only count monetary commissions. `unit` absent → treat as cash.
      if (c.unit && c.unit !== 'cash') continue;
      const amount = typeof c.amount === 'number' ? c.amount : 0;
      if (c.status === 'approved') {
        if (c.is_paid) paidCents += amount;
        else owedCents += amount;
      } else if (c.status === 'pending') {
        pendingCents += amount;
      }
      // `denied` → ignored
    }

    if (list.length < PER_PAGE) break; // reached the last page
    if (addedThisPage === 0) break; // paginator not advancing — stop
    if (page === MAX_PAGES) truncated = true;
  }

  return {
    paidCents,
    owedCents,
    pendingCents,
    earnedCents: paidCents + owedCents,
    commissionsCount: seen.size,
    truncated,
  };
}

function inferErrorCode(status: number, message: string): string {
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 422 || lower.includes('already') || lower.includes('exists')) {
    return 'already_exists';
  }
  if (status >= 500) return 'upstream_server_error';
  return 'request_failed';
}

export class FirstPromoterApiError extends Error {
  status: number;
  code: string;
  body: unknown;
  constructor(message: string, status: number, code: string, body: unknown = null) {
    super(message);
    this.name = 'FirstPromoterApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}
