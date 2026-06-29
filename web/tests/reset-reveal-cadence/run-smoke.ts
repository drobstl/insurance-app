import assert from 'node:assert/strict';
import { buildResetRevealDecision } from '../../lib/reset-reveal';

/**
 * Smoke test for the reset-reveal cadence.
 *
 * Run: node --import tsx ./tests/reset-reveal-cadence/run-smoke.ts
 *
 * The reveal is a gentle, repeated nudge (not a quarterly event):
 *   - re-surfaces ~weekly after a show/dismiss until the client bites;
 *   - backs off ~60 days once they engage ("see if I qualify").
 *
 * No Firestore. Pure logic with an injected `now`.
 */

function ok(label: string) {

  console.log(`  ✓ ${label}`);
}
function section(name: string) {

  console.log(`\n${name}`);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000;
const agoDays = (n: number) => new Date(NOW - n * DAY);

const agent = { resetRevealEnabled: true, name: 'Dana Agent', schedulingUrl: 'https://cal.example/dana' };
const client = (extra: Record<string, unknown> = {}) => ({
  name: 'Pat Client',
  clientActivatedAt: agoDays(120),
  ...extra,
});
const opts = { now: NOW };

// ─────────────────────────────────────────────────────────────────
section('1. base gates still hold');

(() => {
  assert.equal(buildResetRevealDecision(client(), {}, opts).show, false, 'agent flag off → no show');
  assert.equal((buildResetRevealDecision(client(), {}, opts) as { reason: string }).reason, 'disabled');
  assert.equal(buildResetRevealDecision({ name: 'x' }, agent, opts).show, false, 'unactivated → no show');
  ok('disabled + not_activated still block');
})();

// ─────────────────────────────────────────────────────────────────
section('2. fresh client (no cadence stamps) shows');

(() => {
  const d = buildResetRevealDecision(client(), agent, opts);
  assert.equal(d.show, true, 'never seen → shows');
  if (d.show) assert.ok(['DFL', 'Annuity', 'QFA', 'IUL', 'IBC'].includes(d.reveal.product), 'carries a product');
  ok('first-ever reveal shows with a matched product');
})();

// ─────────────────────────────────────────────────────────────────
section('3. weekly nudge after show / dismiss');

(() => {
  assert.equal(
    buildResetRevealDecision(client({ resetRevealShownAt: agoDays(3) }), agent, opts).show,
    false,
    'shown 3d ago → still cooling',
  );
  assert.equal(
    buildResetRevealDecision(client({ resetRevealDismissedAt: agoDays(2) }), agent, opts).show,
    false,
    'dismissed 2d ago → still cooling',
  );
  assert.equal(
    buildResetRevealDecision(client({ resetRevealShownAt: agoDays(8) }), agent, opts).show,
    true,
    'shown 8d ago → past the weekly nudge, re-surfaces',
  );
  ok('re-nudges about a week after a show/dismiss');
})();

// ─────────────────────────────────────────────────────────────────
section('4. engaging earns a long rest (and wins over the nudge)');

(() => {
  // Engaged recently — even though the last show is older than the weekly nudge.
  const blocked = buildResetRevealDecision(
    client({ resetRevealEngagedAt: agoDays(10), resetRevealShownAt: agoDays(8) }),
    agent,
    opts,
  );
  assert.equal(blocked.show, false, 'engaged 10d ago → still resting');
  assert.equal((blocked as { reason: string }).reason, 'engaged_recently');

  // Engagement long past — back in the nudge rotation.
  assert.equal(
    buildResetRevealDecision(
      client({ resetRevealEngagedAt: agoDays(70), resetRevealShownAt: agoDays(8) }),
      agent,
      opts,
    ).show,
    true,
    'engaged 70d ago → eligible again',
  );
  ok('engaged backoff is ~60d and takes precedence over the weekly nudge');
})();

// ─────────────────────────────────────────────────────────────────

console.log('\nReset-reveal-cadence smoke test: all checks passed.');
