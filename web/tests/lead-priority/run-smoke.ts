import assert from 'node:assert/strict';
import {
  leadPriorityScore,
  leadPriorityReasons,
  leadPriorityTier,
  toPriorityInput,
  type LeadPriorityInput,
} from '../../lib/lead-priority';

/**
 * Smoke check for the pure pre-connection lead-priority model
 * (lib/lead-priority). The queue wiring lives in the leads page (it needs the
 * page's dial maps), but the scoring + reasons + the lead-doc adapter are pure
 * and fully testable here without Firebase or the running app.
 *
 * What we lock down: the ranking matches how we triage (call-ins → freshest →
 * bigger mortgages), the "firehose" case (a promising call-in beats a pile of
 * fresh junk mail-ins), the reasons string, and that the adapter reads the
 * RIGHT mortgage field (mortgageDetails.balance, NOT monthlyMortgageAmount).
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

section('source: call-in > digital > mail-in > unknown (all else equal)', () => {
  const base = { createdAtMs: daysAgo(0), mortgageBalance: 0, ageYears: 40 };
  const callIn = score({ ...base, formType: 'Call-In' });
  const digital = score({ ...base, formType: 'Digital' });
  const mailIn = score({ ...base, formType: 'Mail-In' });
  const unknown = score({ ...base, formType: 'CSV Import' });
  assert.ok(callIn > digital, 'call-in beats digital');
  assert.ok(digital > mailIn, 'digital beats mail-in');
  assert.ok(mailIn > unknown, 'mail-in beats unknown/import');
});

section('freshness: fresher beats staler (all else equal)', () => {
  const base = { formType: 'Call-In', mortgageBalance: 300_000, ageYears: 40 };
  assert.ok(score({ ...base, createdAtMs: daysAgo(0) }) > score({ ...base, createdAtMs: daysAgo(7) }));
  assert.ok(score({ ...base, createdAtMs: daysAgo(7) }) > score({ ...base, createdAtMs: daysAgo(20) }));
});

section('mortgage: bigger balance beats smaller (all else equal)', () => {
  const base = { formType: 'Mail-In', createdAtMs: daysAgo(3), ageYears: 45 };
  assert.ok(score({ ...base, mortgageBalance: 500_000 }) > score({ ...base, mortgageBalance: 120_000 }));
});

section('co-borrower adds a nudge (all else equal)', () => {
  const base = { formType: 'Digital', createdAtMs: daysAgo(2), mortgageBalance: 200_000, ageYears: 38 };
  assert.ok(score({ ...base, hasCoborrower: true }) > score({ ...base, hasCoborrower: false }));
});

section('firehose: a promising call-in outranks a pile of fresher mail-ins', () => {
  const promising = score({
    formType: 'Call-In',
    createdAtMs: daysAgo(1),
    mortgageBalance: 480_000,
    ageYears: 42,
    hasCoborrower: true,
  });
  // 30 cold mail-ins, even slightly newer than the call-in — none should beat it.
  for (let i = 0; i < 30; i++) {
    const junk = score({ formType: 'Mail-In', createdAtMs: daysAgo(0), mortgageBalance: 0, ageYears: 70 });
    assert.ok(promising > junk, 'the call-in stays above the fresh mail-in flood');
  }
});

section('reasons read clearly, most-important-first, and only when notable', () => {
  const r = leadPriorityReasons(
    { formType: 'Call-In', createdAtMs: daysAgo(0), mortgageBalance: 480_000, hasCoborrower: true },
    NOW,
  );
  assert.deepEqual(r, ['Called in', 'Fresh', '$480k mortgage', 'Co-borrower']);
  // a stale, low-signal lead → no reasons (the chip simply won't render).
  assert.deepEqual(leadPriorityReasons({ formType: 'Mail-In', createdAtMs: daysAgo(20), mortgageBalance: 0 }, NOW), []);
});

section('tier: fresh call-in = top, stale junk = standard', () => {
  assert.equal(leadPriorityTier(score({ formType: 'Call-In', createdAtMs: daysAgo(0), ageYears: 40 })), 'top');
  assert.equal(
    leadPriorityTier(score({ formType: 'Mail-In', createdAtMs: daysAgo(20), mortgageBalance: 0, ageYears: 75 })),
    'standard',
  );
});

section('adapter reads mortgageDetails.balance + coborrowerStatus (not monthly payment)', () => {
  const input = toPriorityInput({
    formType: 'Call-In',
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
