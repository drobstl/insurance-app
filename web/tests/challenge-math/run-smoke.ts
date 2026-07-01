#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import {
  computeDailyChallenge,
  computeWeeklyChallenge,
  computeStreak,
  DAILY_FIXED_GOAL,
  WEEK_FIXED_GOAL,
} from '../../lib/challenges';

function run() {
  // ── Daily: literal "beat yesterday" ──────────────────────────
  // Yesterday 17, steady book → target 18, not yet won at 14.
  {
    const d = computeDailyChallenge(14, 17, 17);
    assert.equal(d.target, 18, 'beat 17 → target 18');
    assert.equal(d.won, false, '14 of 18 not won');
    assert.equal(d.toGo, 4, '4 to go');
    assert.equal(d.isFixedGoal, false, 'self-referential, not fixed');
  }
  // Crossing the bar wins; toGo floors at 0.
  {
    const d = computeDailyChallenge(19, 17, 17);
    assert.equal(d.won, true, '19 beats 18');
    assert.equal(d.toGo, 0, 'toGo floors at 0 once won');
  }

  // ── Daily: floor / fixed-goal fallback (cold start) ──────────
  // Last active day below the floor → round fixed goal, not "beat 0→1".
  {
    const d = computeDailyChallenge(0, 0, 0);
    assert.equal(d.isFixedGoal, true, 'cold start is a fixed goal');
    assert.equal(d.target, DAILY_FIXED_GOAL, 'fixed daily goal');
  }
  {
    const d = computeDailyChallenge(3, 2, 2); // 2 < floor(5)
    assert.equal(d.isFixedGoal, true, 'sub-floor last day → fixed goal');
    assert.equal(d.target, DAILY_FIXED_GOAL, 'fixed daily goal');
  }

  // ── Daily: climb cap (freak day doesn't brick tomorrow) ──────
  // Norm ~10/day, one 40-dial day. Bar capped at round(10×1.2)+1 = 13,
  // NOT 41 — so the streak survives the outlier.
  {
    const d = computeDailyChallenge(0, 40, 10);
    assert.equal(d.target, 13, 'climb-capped to recentAvg×1.2 + 1');
    assert.ok(d.target < 41, 'cap keeps the bar reachable');
  }
  // Without an outlier the cap is inert (lastActive ≈ recentAvg).
  {
    const d = computeDailyChallenge(0, 12, 12);
    assert.equal(d.target, 13, 'no outlier → plain beat-yesterday');
  }

  // ── Weekly ───────────────────────────────────────────────────
  {
    const w = computeWeeklyChallenge(64, 71);
    assert.equal(w.target, 72, 'beat last week 71 → 72');
    assert.equal(w.won, false, '64 of 72 not won');
    assert.equal(w.toGo, 8, '8 to go this week');
  }
  {
    const w = computeWeeklyChallenge(5, 4); // 4 < week floor(20)
    assert.equal(w.isFixedGoal, true, 'sub-floor last week → fixed goal');
    assert.equal(w.target, WEEK_FIXED_GOAL, 'fixed weekly goal');
  }

  // ── Hot streak ───────────────────────────────────────────────
  // Strictly increasing recent active days → full streak.
  assert.equal(computeStreak([20, 18, 15, 12]), 3, 'three consecutive beats');
  // First (most recent) day didn't beat the prior → streak 0.
  assert.equal(computeStreak([14, 18, 15]), 0, 'most recent broke the chain');
  // Break partway: 22>19 (win), 19>21? no → stop at 1.
  assert.equal(computeStreak([22, 19, 21, 10]), 1, 'breaks at the first non-beat');
  // Single active day can't have beaten a prior one.
  assert.equal(computeStreak([9]), 0, 'one day → no streak');
  assert.equal(computeStreak([]), 0, 'no active days → no streak');

  console.log('challenge-math smoke: all assertions passed');
}

run();
