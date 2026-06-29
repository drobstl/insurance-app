import assert from 'node:assert/strict';
import {
  matchResetProduct,
  retirementAssetsTotal,
  hasMortgageDebt,
  isResetProductId,
  RESET_PRODUCT_IDS,
  QUALIFYING_RETIREMENT_ASSETS,
} from '../../lib/reset-products';

/**
 * Smoke test for the reset-reveal product matcher.
 *
 * Run: node --import tsx ./tests/reset-product-match/run-smoke.ts
 *
 * Covers (in order):
 *   1. Guard: isResetProductId
 *   2. hasMortgageDebt across balance / payment / neither
 *   3. retirementAssetsTotal — only retirement-looking labels, parses "$"
 *   4. matchResetProduct — override wins, debt→DFL, assets→Annuity, default
 *   5. Compliance: the matched id is always one of the five known doors
 *
 * No Firestore. Pure logic only.
 */

function ok(label: string) {

  console.log(`  ✓ ${label}`);
}
function section(name: string) {

  console.log(`\n${name}`);
}

// ─────────────────────────────────────────────────────────────────
section('1. isResetProductId');

(() => {
  assert.equal(isResetProductId('DFL'), true);
  assert.equal(isResetProductId('Annuity'), true);
  assert.equal(isResetProductId('xyz'), false);
  assert.equal(isResetProductId(undefined), false);
  assert.equal(isResetProductId(42), false);
  ok('accepts the five ids, rejects everything else');
})();

// ─────────────────────────────────────────────────────────────────
section('2. hasMortgageDebt');

(() => {
  assert.equal(hasMortgageDebt({ mortgageDetails: { balance: 312000 } }), true);
  assert.equal(hasMortgageDebt({ monthlyMortgageAmount: 1800 }), true, 'payment-only still counts');
  assert.equal(hasMortgageDebt({ mortgageDetails: { balance: 0 }, monthlyMortgageAmount: 0 }), false);
  assert.equal(hasMortgageDebt({}), false, 'no facts → no debt');
  ok('debt true on balance OR payment, false otherwise');
})();

// ─────────────────────────────────────────────────────────────────
section('3. retirementAssetsTotal');

(() => {
  const hh = {
    household: {
      assets: [
        { id: 'a', label: 'Old 401k - Acme', amount: '$25,000' },
        { id: 'b', label: 'Roth IRA', amount: '15000' },
        { id: 'c', label: 'Savings', amount: '$40,000' }, // NOT retirement → excluded
        { id: 'd', label: 'Checking', amount: '5000' }, // excluded
      ],
    },
  };
  assert.equal(retirementAssetsTotal(hh), 40000, '401k + IRA only, $ parsed; savings excluded');
  assert.equal(retirementAssetsTotal({}), 0, 'no household → 0');
  assert.equal(retirementAssetsTotal({ household: { assets: 'oops' } }), 0, 'malformed assets → 0');
  ok('sums only retirement-labeled rows, parses currency, ignores savings');
})();

// ─────────────────────────────────────────────────────────────────
section('4. matchResetProduct');

(() => {
  // Override always wins — even over a mortgage.
  const overridden = matchResetProduct({
    resetProductOverride: 'IUL',
    mortgageDetails: { balance: 300000 },
  });
  assert.equal(overridden.product, 'IUL');
  assert.equal(overridden.source, 'override');
  ok('valid override wins over auto signals');

  // Invalid override is ignored → falls through to auto.
  const badOverride = matchResetProduct({
    resetProductOverride: 'NOPE',
    mortgageDetails: { balance: 300000 },
  });
  assert.equal(badOverride.product, 'DFL');
  assert.equal(badOverride.source, 'debt');
  ok('invalid override ignored, auto match applies');

  // Debt → DFL.
  assert.equal(matchResetProduct({ monthlyMortgageAmount: 1800 }).product, 'DFL');
  ok('mortgage → DFL');

  // No debt + qualifying retirement assets → Annuity (source: assets).
  const assetMatch = matchResetProduct({
    household: { assets: [{ id: 'a', label: '401k', amount: '50000' }] },
  });
  assert.equal(assetMatch.product, 'Annuity');
  assert.equal(assetMatch.source, 'assets');
  ok('no debt + old 401k ≥ threshold → Annuity (assets)');

  // No debt + sub-threshold retirement assets → default (still Annuity, low confidence).
  const thin = matchResetProduct({
    household: { assets: [{ id: 'a', label: 'IRA', amount: String(QUALIFYING_RETIREMENT_ASSETS - 1) }] },
  });
  assert.equal(thin.product, 'Annuity');
  assert.equal(thin.source, 'default');
  ok('no debt + thin assets → default fallback');

  // Nothing on file → default.
  const empty = matchResetProduct({});
  assert.equal(empty.product, 'Annuity');
  assert.equal(empty.source, 'default');
  ok('empty client → gentle default');
})();

// ─────────────────────────────────────────────────────────────────
section('5. matched id is always a known door');

(() => {
  const cases: Record<string, unknown>[] = [
    {},
    { mortgageDetails: { balance: 100000 } },
    { resetProductOverride: 'QFA' },
    { resetProductOverride: 'garbage' },
    { household: { assets: [{ id: 'x', label: 'pension', amount: '99999' }] } },
  ];
  for (const c of cases) {
    assert.ok(RESET_PRODUCT_IDS.includes(matchResetProduct(c).product), 'product is one of the five');
  }
  ok('every path returns a valid, client-mappable product id');
})();

// ─────────────────────────────────────────────────────────────────

console.log('\nReset-product-match smoke test: all checks passed.');
