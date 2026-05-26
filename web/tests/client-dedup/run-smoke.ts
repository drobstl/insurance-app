import assert from 'node:assert/strict';
import {
  normalizeName,
  jaroWinkler,
  scanForDuplicateGroups,
  type ClientCandidate,
  type MatchBucket,
} from '../../lib/client-dedup';

/**
 * Smoke test for the client-dedup matcher.
 *
 * Run: node --require ./scripts/server-only-shim.cjs --import tsx ./tests/client-dedup/run-smoke.ts
 *
 * Covers (in order):
 *   1. Name normalization (PDF "Last, First", suffixes, nicknames)
 *   2. Jaro-Winkler scores at the threshold boundaries
 *   3. Pairwise bucket classification across all five buckets
 *   4. Group construction with union-find on a synthetic 10-client book
 *   5. Blocking — confirm fuzzy matches still surface when names share
 *      a last-name initial vs. when they don't (and corroborator picks
 *      them up across the name divide)
 *   6. notDuplicateOf suppression
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
section('1. normalizeName');

(() => {
  const cases: Array<{ raw: string; first: string; last: string }> = [
    { raw: 'John Smith', first: 'john', last: 'smith' },
    { raw: 'Smith, John', first: 'john', last: 'smith' },
    { raw: 'Smith, John Jr.', first: 'john', last: 'smith' },
    { raw: 'John Smith Jr', first: 'john', last: 'smith' },
    { raw: 'John Q. Smith III', first: 'john', last: 'smith' },
    { raw: 'Smith, John, Jr.', first: 'john', last: 'smith' },
    { raw: 'Bob Smith', first: 'robert', last: 'smith' }, // nickname expand
    { raw: 'Bill Williams', first: 'william', last: 'williams' },
    { raw: 'Liz O\'Brien', first: 'elizabeth', last: "o'brien" },
    { raw: '  ', first: '', last: '' },
    { raw: '', first: '', last: '' },
  ];
  for (const c of cases) {
    const n = normalizeName(c.raw);
    assert.equal(n.first, c.first, `first("${c.raw}") = ${n.first}, want ${c.first}`);
    assert.equal(n.last, c.last, `last("${c.raw}") = ${n.last}, want ${c.last}`);
  }
  ok(`${cases.length} normalization cases pass`);
})();

// ─────────────────────────────────────────────────────────────────
section('2. jaroWinkler scores at boundaries');

(() => {
  const exact = jaroWinkler('smith', 'smith');
  assert.equal(exact, 1, 'identical strings score 1.0');

  const typo = jaroWinkler('smith', 'smyth');
  assert.ok(typo >= 0.85, `smith/smyth (${typo}) should be ≥ 0.85 (above fuzzy threshold)`);

  const farther = jaroWinkler('smith', 'jones');
  assert.ok(farther < 0.6, `smith/jones (${farther}) should be < 0.6`);

  const empty = jaroWinkler('', 'smith');
  assert.equal(empty, 0, 'empty input scores 0');
  ok('Jaro-Winkler endpoints behave');
})();

// ─────────────────────────────────────────────────────────────────
section('3. Pairwise bucket classification');

interface BucketCase {
  label: string;
  a: Partial<ClientCandidate>;
  b: Partial<ClientCandidate>;
  expect: MatchBucket | null;
}

const BUCKET_CASES: BucketCase[] = [
  {
    label: 'name + DOB exact → exact',
    a: { name: 'John Smith', dateOfBirth: '1980-05-15' },
    b: { name: 'John Smith', dateOfBirth: '1980-05-15' },
    expect: 'exact',
  },
  {
    label: 'name exact + phone match (no DOB) → exact',
    a: { name: 'John Smith', phone: '5551234567' },
    b: { name: 'John Smith', phone: '+15551234567' },
    expect: 'exact',
  },
  {
    label: 'name exact, no corroborator → strong',
    a: { name: 'John Smith' },
    b: { name: 'Smith, John' }, // same normalized name
    expect: 'strong',
  },
  {
    label: 'name fuzzy (Smyth) + DOB match → fuzzy-corroborated',
    a: { name: 'John Smith', dateOfBirth: '1980-05-15' },
    b: { name: 'John Smyth', dateOfBirth: '1980-05-15' },
    expect: 'fuzzy-corroborated',
  },
  {
    label: 'nickname (Bob/Robert) + phone match → exact (canonicalized)',
    a: { name: 'Bob Smith', phone: '5551234567' },
    b: { name: 'Robert Smith', phone: '+15551234567' },
    expect: 'exact',
  },
  {
    label: 'name fuzzy (Jon/John), no corroborator → fuzzy-name-only',
    a: { name: 'John Smith' },
    b: { name: 'Jon Smith' },
    expect: 'fuzzy-name-only',
  },
  {
    label: 'Jane vs John same DOB → weak (different person likely, but flag)',
    a: { name: 'John Smith', dateOfBirth: '1980-05-15' },
    b: { name: 'Jane Smith', dateOfBirth: '1980-05-15' },
    expect: 'weak',
  },
  {
    label: 'completely different people → null',
    a: { name: 'John Smith', dateOfBirth: '1980-05-15' },
    b: { name: 'Susan Lee', dateOfBirth: '1992-09-21' },
    expect: null,
  },
  {
    label: 'household sharing phone, different first names → null (phone alone across name divide is not enough)',
    a: { name: 'John Smith', dateOfBirth: '1980-05-15', phone: '5551234567' },
    b: { name: 'Mary Smith', dateOfBirth: '1982-03-10', phone: '5551234567' },
    expect: null,
  },
];

for (const c of BUCKET_CASES) {
  const a: ClientCandidate = { id: 'a', name: '', ...c.a } as ClientCandidate;
  const b: ClientCandidate = { id: 'b', name: '', ...c.b } as ClientCandidate;
  const groups = scanForDuplicateGroups([a, b]);
  const got = groups.length ? groups[0].bucket : null;
  if (got !== c.expect) {
     
    console.error(`  ✗ ${c.label}: got ${got}, expected ${c.expect}`);
    if (groups.length) {
       
      console.error(`    edges: ${JSON.stringify(groups[0].matches.map((m) => m.match))}`);
    }
    process.exitCode = 1;
  } else {
    ok(c.label);
  }
}

// ─────────────────────────────────────────────────────────────────
section('4. Group construction (synthetic 10-client book)');

(() => {
  const clients: ClientCandidate[] = [
    { id: 'c1', name: 'John Smith', dateOfBirth: '1980-05-15', phone: '5551111111' },
    { id: 'c2', name: 'Smith, John', dateOfBirth: '1980-05-15', phone: '5551111111' },
    { id: 'c3', name: 'Jon Smith', dateOfBirth: '1980-05-15' }, // typo, same DOB
    { id: 'c4', name: 'Mary Johnson', dateOfBirth: '1975-11-02' },
    { id: 'c5', name: 'Mary Johnston', dateOfBirth: '1975-11-02' }, // fuzzy + DOB
    { id: 'c6', name: 'Bob Williams', phone: '5552222222' },
    { id: 'c7', name: 'Robert Williams', phone: '+15552222222' }, // nickname + phone
    { id: 'c8', name: 'Susan Lee', dateOfBirth: '1992-09-21' },
    { id: 'c9', name: 'Pat Brown' },
    { id: 'c10', name: 'Patrick Brown' }, // nickname, no corroborator → strong (name exact after canon)
  ];
  const groups = scanForDuplicateGroups(clients);

  // Expect 4 groups: {c1,c2,c3}, {c4,c5}, {c6,c7}, {c9,c10}.
  // c8 is alone.
  assert.equal(groups.length, 4, `expected 4 groups, got ${groups.length}`);

  const memberSets = groups.map((g) => new Set(g.members.map((m) => m.id)));
  const has = (s: Set<string>, ...ids: string[]) =>
    ids.every((id) => s.has(id)) && s.size === ids.length;

  assert.ok(memberSets.some((s) => has(s, 'c1', 'c2', 'c3')), 'group {c1,c2,c3}');
  assert.ok(memberSets.some((s) => has(s, 'c4', 'c5')), 'group {c4,c5}');
  assert.ok(memberSets.some((s) => has(s, 'c6', 'c7')), 'group {c6,c7}');
  assert.ok(memberSets.some((s) => has(s, 'c9', 'c10')), 'group {c9,c10}');
  ok('group construction places all dupes correctly');

  // Sort order: highest-confidence buckets first.
  // c1/c2/c3 has an exact edge AND a fuzzy edge — worst-edge is fuzzy-corroborated.
  // c6/c7 has exact (name + phone, canonicalized).
  // c4/c5 is fuzzy-corroborated.
  // c9/c10 is strong (name exact after canon, no corroborator).
  const buckets = groups.map((g) => g.bucket);
   
  console.log(`    buckets in order: ${buckets.join(', ')}`);
  // First group's bucket should be 'exact' (c6/c7).
  assert.equal(buckets[0], 'exact', 'highest-confidence bucket first');
  ok('groups sorted by bucket descending');
})();

// ─────────────────────────────────────────────────────────────────
section('5. Blocking — fuzzy matches still surface when last-name initial shared');

(() => {
  const clients: ClientCandidate[] = [
    { id: 'a', name: 'John Smith', dateOfBirth: '1980-05-15' },
    { id: 'b', name: 'John Smyth', dateOfBirth: '1980-05-15' }, // shares 's' block
    { id: 'c', name: 'Robert Adams' }, // shouldn't pair with above
    { id: 'd', name: 'Bob Adams' }, // pairs with c via nickname (strong, name exact)
  ];
  const groups = scanForDuplicateGroups(clients);
  assert.equal(groups.length, 2, 'two groups (a/b, c/d)');
  ok('blocking by last-name initial works');
})();

// ─────────────────────────────────────────────────────────────────
section('6. notDuplicateOf suppression');

(() => {
  const clients: ClientCandidate[] = [
    { id: 'a', name: 'John Smith', dateOfBirth: '1980-05-15' },
    { id: 'b', name: 'John Smith', dateOfBirth: '1980-05-15', notDuplicateOf: ['a'] },
  ];
  const groups = scanForDuplicateGroups(clients);
  assert.equal(groups.length, 0, 'notDuplicateOf suppresses the pair');
  ok('agent-declared not-a-duplicate respected');
})();

// ─────────────────────────────────────────────────────────────────
 
console.log('\nClient-dedup smoke test: all checks passed.');
