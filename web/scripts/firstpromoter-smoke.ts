#!/usr/bin/env npx tsx
/**
 * FirstPromoter earnings smoke test — READ-ONLY.
 *
 * Confirms that the in-app earnings summary (GET /api/affiliate/stats →
 * getPromoterEarningsSummary) matches what FirstPromoter actually shows,
 * BEFORE we trust any dollar figure in front of agents.
 *
 * It does three things, all GET (never writes):
 *   1. Resolves a promoter (by email or numeric id).
 *   2. Dumps a couple of RAW commission objects so we can eyeball the
 *      field names and — critically — whether `amount` is in cents or
 *      whole dollars (the v2 docs don't say).
 *   3. Prints our computed summary BOTH ways (as-cents and as-dollars)
 *      so you can match it against the FirstPromoter dashboard and tell
 *      which interpretation is right.
 *
 * Usage (from web/):
 *   npm run smoke:firstpromoter -- daniel@crosswindsfg.com
 *   npm run smoke:firstpromoter -- 12345        # a promoter id
 *
 * Requires FIRSTPROMOTER_API_KEY + FIRSTPROMOTER_ACCOUNT_ID in
 * .env.local (the same keys the app needs — if these are missing,
 * that's also why the Refer & Earn page shows "coming soon").
 */

import * as fs from 'fs';
import * as path from 'path';

// Load env the way Next.js does (no dotenv dependency needed).
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

import {
  getFirstPromoterPromoterByEmail,
  getPromoterEarningsSummary,
  extractAffiliateFields,
  isFirstPromoterConfigured,
} from '../lib/firstpromoter';

const API_BASE = 'https://api.firstpromoter.com/api/v2';

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.FIRSTPROMOTER_API_KEY?.trim() || ''}`,
    'Account-ID': process.env.FIRSTPROMOTER_ACCOUNT_ID?.trim() || '',
    Accept: 'application/json',
  };
}

function asMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function main() {
  if (!isFirstPromoterConfigured()) {
    console.error(
      '\n✗ FIRSTPROMOTER_API_KEY / FIRSTPROMOTER_ACCOUNT_ID are not set in .env.local.\n' +
        '  (This is the same reason the Refer & Earn page shows "coming soon".)\n',
    );
    process.exit(1);
  }

  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run smoke:firstpromoter -- <email | promoterId>');
    process.exit(1);
  }

  // --- Resolve the promoter ---
  let promoterId: number | undefined;
  if (arg.includes('@')) {
    console.log(`Looking up promoter by email: ${arg}`);
    const promoter = await getFirstPromoterPromoterByEmail(arg.trim().toLowerCase());
    if (!promoter) {
      console.error(`✗ No FirstPromoter promoter found for ${arg}`);
      process.exit(1);
    }
    promoterId = promoter.id;
    const fields = extractAffiliateFields(promoter);
    console.log(`✓ Promoter id ${promoter.id} — ref_link: ${fields.refLink ?? '(none)'}`);
  } else {
    promoterId = Number(arg);
    if (!Number.isFinite(promoterId)) {
      console.error(`✗ "${arg}" is neither an email nor a numeric promoter id`);
      process.exit(1);
    }
  }

  // --- 1. Dump a couple of raw commissions to confirm the field shape ---
  console.log('\n── Raw commissions (first 3) — confirm field names + unit ──');
  const url = new URL(`${API_BASE}/company/commissions`);
  url.searchParams.set('filters[promoter_id]', String(promoterId));
  url.searchParams.set('per_page', '3');
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  let raw: unknown = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    console.log('(non-JSON body)');
  }
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] })?.data)
      ? (raw as { data: unknown[] }).data
      : [];
  for (const c of list.slice(0, 3)) {
    const o = c as Record<string, unknown>;
    console.log(
      `  id=${o.id} amount=${o.amount} status=${o.status} is_paid=${o.is_paid} unit=${o.unit}`,
    );
  }
  if (list.length === 0) {
    console.log('  (no commissions yet for this promoter)');
  }

  // --- 2. Our computed summary, shown BOTH ways ---
  const s = await getPromoterEarningsSummary(promoterId);
  console.log('\n── Computed summary (raw integer totals) ──');
  console.log(
    `  owed=${s.owedCents} pending=${s.pendingCents} paid=${s.paidCents} ` +
      `lifetime=${s.earnedCents} commissions=${s.commissionsCount} truncated=${s.truncated}`,
  );
  console.log('\n── If amount is in CENTS (our assumption) ──');
  console.log(
    `  Owed ${asMoney(s.owedCents / 100)} · Pending ${asMoney(s.pendingCents / 100)} · ` +
      `Paid ${asMoney(s.paidCents / 100)} · Lifetime ${asMoney(s.earnedCents / 100)}`,
  );
  console.log('── If amount is in WHOLE DOLLARS instead ──');
  console.log(
    `  Owed ${asMoney(s.owedCents)} · Pending ${asMoney(s.pendingCents)} · ` +
      `Paid ${asMoney(s.paidCents)} · Lifetime ${asMoney(s.earnedCents)}`,
  );
  console.log(
    '\n→ Compare these to the FirstPromoter dashboard. Whichever line matches\n' +
      '  tells us the unit. If CENTS matches, the app is already correct. If\n' +
      '  WHOLE DOLLARS matches, drop the /100 in lib/firstpromoter + the page.\n',
  );
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
