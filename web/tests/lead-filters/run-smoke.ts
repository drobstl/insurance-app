import assert from 'node:assert/strict';
import {
  EMPTY_LEAD_FILTERS,
  coerceLeadFilters,
  activeFilterChips,
  activeFilterCount,
  hasActiveFilters,
  type LeadFilters,
} from '../../lib/lead-filters';

/**
 * Smoke check for the pure lead-filter model (lib/lead-filters).
 *
 * The filter predicates themselves live in the leads page (they need the
 * page's appointment maps), but the safety-critical pure logic — coercing
 * untrusted JSON from a saved segment or the natural-language translator, and
 * turning a filter into removable chips — lives here and is fully testable
 * without Firebase or the running app.
 */

function section(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log('lead-filters smoke');

section('empty value coerces to EMPTY', () => {
  assert.deepEqual(coerceLeadFilters(null), EMPTY_LEAD_FILTERS);
  assert.deepEqual(coerceLeadFilters(undefined), EMPTY_LEAD_FILTERS);
  assert.deepEqual(coerceLeadFilters('garbage'), EMPTY_LEAD_FILTERS);
  assert.equal(hasActiveFilters(EMPTY_LEAD_FILTERS), false);
});

section('legacy single `state` migrates to states[]', () => {
  const c = coerceLeadFilters({ state: 'tx' });
  assert.deepEqual(c.states, ['TX'], 'lowercased legacy state upcased into array');
});

section('states array: validates 2-letter, dedupes, upcases', () => {
  const c = coerceLeadFilters({ states: ['tx', 'TX', 'Florida', 'fl', 12, null] });
  assert.deepEqual(c.states, ['TX', 'FL'], 'only 2-letter codes, deduped, upcased');
});

section('age + recency clamp out-of-range / non-numeric', () => {
  assert.equal(coerceLeadFilters({ ageMin: -5 }).ageMin, null, 'negative age dropped');
  assert.equal(coerceLeadFilters({ ageMax: 200 }).ageMax, null, 'age > 130 dropped');
  assert.equal(coerceLeadFilters({ ageMin: 79.6 }).ageMin, 80, 'age rounded');
  assert.equal(coerceLeadFilters({ notContactedDays: 0 }).notContactedDays, null, 'non-positive days dropped');
  assert.equal(coerceLeadFilters({ notContactedDays: 30 }).notContactedDays, 30);
  assert.equal(coerceLeadFilters({ notContactedDays: 'soon' }).notContactedDays, null, 'string days dropped');
});

section('tri-state + enum fields only accept valid values', () => {
  assert.equal(coerceLeadFilters({ appDownloaded: 'yes' }).appDownloaded, 'yes');
  assert.equal(coerceLeadFilters({ appDownloaded: 'maybe' }).appDownloaded, null, 'invalid tri → null');
  assert.equal(coerceLeadFilters({ smoker: 'Y' }).smoker, 'Y');
  assert.equal(coerceLeadFilters({ smoker: 'yes' }).smoker, null, 'invalid smoker → null');
  assert.equal(coerceLeadFilters({ gender: 'M' }).gender, 'M');
  assert.deepEqual(
    coerceLeadFilters({ temperatures: ['hot', 'lukewarm', 'cool'] }).temperatures,
    ['hot', 'cool'],
    'unknown temperature dropped',
  );
  assert.deepEqual(
    coerceLeadFilters({ statuses: ['booked', 'nonsense', 'converted'] }).statuses,
    ['booked', 'converted'],
    'unknown status dropped',
  );
});

section('booleans require literal true', () => {
  assert.equal(coerceLeadFilters({ creditEligible: true }).creditEligible, true);
  assert.equal(coerceLeadFilters({ creditEligible: 'true' }).creditEligible, false, 'string "true" is not true');
  assert.equal(coerceLeadFilters({ hasMortgage: 1 }).hasMortgage, false, '1 is not true');
});

section('a realistic NL payload round-trips', () => {
  // What the translator might emit for "hot 80+ leads in Texas I haven't
  // called in 30 days, downloaded the app".
  const c = coerceLeadFilters({
    temperatures: ['hot'],
    creditEligible: true,
    states: ['TX'],
    notContactedDays: 30,
    appDownloaded: 'yes',
    searchQuery: 'ignored here',
  });
  assert.deepEqual(c.temperatures, ['hot']);
  assert.equal(c.creditEligible, true);
  assert.deepEqual(c.states, ['TX']);
  assert.equal(c.notContactedDays, 30);
  assert.equal(c.appDownloaded, 'yes');
  assert.equal(activeFilterCount(c), 5, 'five distinct active filters');
});

section('activeFilterChips: one chip per value, removal narrows', () => {
  const f: LeadFilters = coerceLeadFilters({
    statuses: ['booked'],
    states: ['TX', 'FL'],
    creditEligible: true,
    tagIds: ['tag_a'],
    ageMin: 70,
    ageMax: 85,
  });
  const chips = activeFilterChips(f, (id) => (id === 'tag_a' ? 'VIP' : null));

  const labels = chips.map((c) => c.label);
  assert.ok(labels.includes('Booked'), 'status label');
  assert.ok(labels.includes('TX') && labels.includes('FL'), 'one chip per state');
  assert.ok(labels.includes('Lead credit · 80+'), 'credit chip');
  assert.ok(labels.includes('VIP'), 'tag resolves to label');
  assert.ok(labels.includes('Age 70–85'), 'age range label');

  // Removing the FL chip leaves TX and everything else intact.
  const flChip = chips.find((c) => c.label === 'FL')!;
  assert.deepEqual(flChip.next.states, ['TX'], 'removing FL keeps TX');
  assert.equal(flChip.next.creditEligible, true, 'removing one chip preserves others');

  // Removing the age chip clears both ends in one go.
  const ageChip = chips.find((c) => c.label === 'Age 70–85')!;
  assert.equal(ageChip.next.ageMin, null);
  assert.equal(ageChip.next.ageMax, null);
});

section('unknown tag id still yields a removable chip', () => {
  const f = coerceLeadFilters({ tagIds: ['ghost'] });
  const chips = activeFilterChips(f, () => null);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, 'Tag', 'falls back to generic label');
  assert.deepEqual(chips[0].next.tagIds, [], 'still removable');
});

console.log('lead-filters smoke: all passed');
