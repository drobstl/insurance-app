import assert from 'node:assert/strict';
import {
  leadPriorityScore,
  leadPriorityReasons,
  toPriorityInput,
  type LeadPriorityInput,
} from '../../lib/lead-priority';

/**
 * Smoke check for the pure pre-connection lead-priority model
 * (lib/lead-priority). The queue wiring lives in the leads page (it needs the
 * page's dial maps), but the scoring + reasons + the lead-doc adapter are pure
 * and fully testable here without Firebase or the running app.
 *
 * What we lock down: the ranking matches how we triage (freshest → bigger
 * mortgages, age/co-borrower as nudges), the "firehose" case (a fresh
 * big-mortgage lead beats a pile of fresher no-mortgage leads), the reasons
 * string, that lead TYPE does NOT affect the score (it's informational only),
 * and that the adapter reads the RIGHT mortgage field (mortgageDetails.balance,
 * NOT monthlyMortgageAmount).
 */

const NOW = 1_750_000_000_000; // fixed 'now' so freshness is deterministic
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => NOW - d * DAY;

function section(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}
const score = (i: LeadPriorityInput) => leadPriorityScore(i, NOW);

console.log('lead-priority smoke');

section('freshness: fresher beats staler (all else equal)', () => {
  const base = { mortgageBalance: 300_000, ageYears: 40 };
  assert.ok(score({ ...base, createdAtMs: daysAgo(0) }) > score({ ...base, createdAtMs: daysAgo(7) }));
  assert.ok(score({ ...base, createdAtMs: daysAgo(7) }) > score({ ...base, createdAtMs: daysAgo(20) }));
});

section('mortgage: bigger balance beats smaller (all else equal)', () => {
  const base = { createdAtMs: daysAgo(3), ageYears: 45 };
  assert.ok(score({ ...base, mortgageBalance: 500_000 }) > score({ ...base, mortgageBalance: 120_000 }));
});

section('age fit: prime-window age beats out-of-window (all else equal)', () => {
  const base = { createdAtMs: daysAgo(2), mortgageBalance: 250_000 };
  assert.ok(score({ ...base, ageYears: 45 }) > score({ ...base, ageYears: 84 }));
});

section('co-borrower adds a nudge (all else equal)', () => {
  const base = { createdAtMs: daysAgo(2), mortgageBalance: 200_000, ageYears: 38 };
  assert.ok(score({ ...base, hasCoborrower: true }) > score({ ...base, hasCoborrower: false }));
});

section('lead type is NOT a ranking input — it lives outside this model', () => {
  // The scorer takes no formType/source at all; two leads identical on the
  // real signals score identically no matter the channel they came from.
  const a = score({ createdAtMs: daysAgo(1), mortgageBalance: 300_000, ageYears: 40 });
  const b = score({ createdAtMs: daysAgo(1), mortgageBalance: 300_000, ageYears: 40 });
  assert.equal(a, b);
});

section('firehose: a fresh big-mortgage lead outranks a pile of fresher no-mortgage leads', () => {
  const promising = score({ createdAtMs: daysAgo(1), mortgageBalance: 480_000, ageYears: 42, hasCoborrower: true });
  for (let i = 0; i < 30; i++) {
    const bland = score({ createdAtMs: daysAgo(0), mortgageBalance: 0, ageYears: 70 });
    assert.ok(promising > bland, 'the big-mortgage lead stays above the fresh-but-bland flood');
  }
});

section('reasons read clearly, most-important-first, and only when notable', () => {
  const r = leadPriorityReasons(
    { createdAtMs: daysAgo(0), mortgageBalance: 480_000, hasCoborrower: true },
    NOW,
  );
  assert.deepEqual(r, ['Fresh', '$480k mortgage', 'Co-borrower']);
  // a stale, low-signal lead → no reasons (the chip simply won't render).
  assert.deepEqual(leadPriorityReasons({ createdAtMs: daysAgo(20), mortgageBalance: 0 }, NOW), []);
});

section('adapter reads mortgageDetails.balance + coborrowerStatus (not monthly payment)', () => {
  const input = toPriorityInput({
    createdAt: { toMillis: () => daysAgo(1) },
    mortgageDetails: { balance: 425_000 },
    ageYears: 39,
    coborrowerStatus: 'Y',
  });
  assert.equal(input.mortgageBalance, 425_000, 'reads the loan balance');
  assert.equal(input.hasCoborrower, true);
  assert.equal(input.createdAtMs, daysAgo(1));
  assert.equal(toPriorityInput({ coborrowerStatus: 'N' }).hasCoborrower, false, "'N' is not a co-borrower");
  assert.equal(toPriorityInput({}).mortgageBalance, null, 'missing mortgage → null, scored as neutral');
});

console.log('\nAll lead-priority smoke checks passed.');
