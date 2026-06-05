#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import { quietHoursCheck, isWithinQuietHoursWindow } from '../../lib/quiet-hours';

// All instants below use WINTER dates so US offsets are fixed (no DST):
//   PST = UTC-8, EST = UTC-5. That keeps the expected local hour exact.
const at = (iso: string) => new Date(iso);

function run() {
  // ── California (America/Los_Angeles), default 8am-9pm window ──
  // 2am PST = 10:00 UTC → blocked (before start)
  assert.equal(quietHoursCheck({ stateCode: 'CA', now: at('2026-01-15T10:00:00Z') }).allowed, false, 'CA 2am blocked');
  assert.equal(quietHoursCheck({ stateCode: 'CA', now: at('2026-01-15T10:00:00Z') }).reason, 'before_start', 'CA 2am reason');
  // 8:00am PST = 16:00 UTC → allowed (start is inclusive)
  assert.equal(isWithinQuietHoursWindow('CA', at('2026-01-15T16:00:00Z')), true, 'CA 8am boundary allowed');
  // 1pm PST = 21:00 UTC → allowed
  assert.equal(isWithinQuietHoursWindow('CA', at('2026-01-15T21:00:00Z')), true, 'CA 1pm allowed');
  // 9:30pm PST = 05:30 UTC next day → blocked (after end, hour 21 >= 21)
  assert.equal(quietHoursCheck({ stateCode: 'CA', now: at('2026-01-16T05:30:00Z') }).allowed, false, 'CA 9:30pm blocked');
  assert.equal(quietHoursCheck({ stateCode: 'CA', now: at('2026-01-16T05:30:00Z') }).reason, 'after_end', 'CA 9:30pm reason');
  // 8:30pm PST = 04:30 UTC next day → allowed (hour 20 < 21)
  assert.equal(isWithinQuietHoursWindow('CA', at('2026-01-16T04:30:00Z')), true, 'CA 8:30pm allowed');

  // ── New York (America/New_York) ──
  // 9am EST = 14:00 UTC → allowed
  assert.equal(isWithinQuietHoursWindow('NY', at('2026-01-15T14:00:00Z')), true, 'NY 9am allowed');
  // 11pm EST = 04:00 UTC next day → blocked
  assert.equal(isWithinQuietHoursWindow('NY', at('2026-01-16T04:00:00Z')), false, 'NY 11pm blocked');

  // ── Florida strict end (8pm) ──
  // 8:30pm EST = 01:30 UTC next day → FL blocks (hour 20 >= 20)
  assert.equal(isWithinQuietHoursWindow('FL', at('2026-01-16T01:30:00Z')), false, 'FL 8:30pm blocked (strict 8pm)');
  // same instant in NY (non-strict) is allowed (20 < 21)
  assert.equal(isWithinQuietHoursWindow('NY', at('2026-01-16T01:30:00Z')), true, 'NY 8:30pm allowed (9pm)');
  // 7:30pm EST = 00:30 UTC next day → FL allows (hour 19 < 20)
  assert.equal(isWithinQuietHoursWindow('FL', at('2026-01-16T00:30:00Z')), true, 'FL 7:30pm allowed');

  // ── Unknown state → conservative continental-US window ──
  // 9am ET / 6am PT (14:00 UTC): 6am PT < 8 start → blocked
  assert.equal(isWithinQuietHoursWindow(null, at('2026-01-15T14:00:00Z')), false, 'unknown 6am PT blocked');
  assert.equal(quietHoursCheck({ stateCode: null, now: at('2026-01-15T14:00:00Z') }).reason, 'unknown_zone_blocked', 'unknown reason');
  // 2pm ET / 11am PT (19:00 UTC): 11am PT >= 8 and 2pm ET < 21 → allowed
  assert.equal(isWithinQuietHoursWindow(undefined, at('2026-01-15T19:00:00Z')), true, 'unknown midday allowed');
  // 8:30pm ET / 5:30pm PT (01:30 UTC next day): ET 20 < 21 and PT 17 >= 8 → allowed
  assert.equal(isWithinQuietHoursWindow('', at('2026-01-16T01:30:00Z')), true, 'unknown 8:30pmET allowed');
  // 10pm ET / 7pm PT (03:00 UTC next day): ET 22 >= 21 → blocked
  assert.equal(isWithinQuietHoursWindow('ZZ', at('2026-01-16T03:00:00Z')), false, 'unknown 10pmET blocked');

  console.log('quiet-hours smoke: all assertions passed');
}

run();
