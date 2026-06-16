import assert from 'node:assert/strict';
import { deriveLeadCode } from '../../lib/lead-code-derive';
import {
  buildLeadPhoneIndex,
  type ExistingLeadForIndex,
} from '../../lib/lead-phone-index';

/**
 * Smoke test for lead-import phone dedup.
 *
 * Run: node --require ./scripts/server-only-shim.cjs --import tsx ./tests/lead-dedup/run-smoke.ts
 *
 * Covers:
 *   1. deriveLeadCode normalization across the formats a vendor list and
 *      a re-import can disagree on (the key to matching the two)
 *   2. buildLeadPhoneIndex — the duplicate-on-re-import fix: a lead stored
 *      under a random `L…` fallback code is still found BY PHONE
 *   3. Re-import simulation — replays Daniel's Jun 2026 scenario (a list
 *      first imported as fallback codes, re-uploaded as derived codes) and
 *      asserts the fallback leads dedup instead of doubling
 *
 * Pure logic only — no Firestore. The route's I/O wrapper
 * (loadLeadPhoneIndex) just reads the leads and calls buildLeadPhoneIndex.
 */

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ─────────────────────────────────────────────────────────────────
section('1. deriveLeadCode normalization');

(() => {
  const cases: Array<{ raw: string; want: string | null }> = [
    { raw: '1-256-478-7899', want: '2564787899' }, // stored format (11 digits, leading 1)
    { raw: '2564787899', want: '2564787899' }, // re-import bare 10-digit
    { raw: '(256) 478-7899', want: '2564787899' }, // human-typed
    { raw: '+1 256 478 7899', want: '2564787899' }, // E.164-ish
    { raw: '256.478.7899', want: '2564787899' }, // dotted
    { raw: '2055162065', want: '2055162065' }, // Daniel's derived example
    { raw: '256-478-789', want: null }, // 9 digits → no code
    { raw: '', want: null },
    { raw: 'no digits here', want: null },
  ];
  for (const c of cases) {
    assert.equal(deriveLeadCode(c.raw), c.want, `deriveLeadCode("${c.raw}")`);
  }
  // All the valid formats collapse to the same key — that's what lets a
  // refreshed vendor list match the originally-imported rows.
  const variants = ['1-256-478-7899', '2564787899', '(256) 478-7899', '+1 256 478 7899'];
  const keys = new Set(variants.map((v) => deriveLeadCode(v)));
  assert.equal(keys.size, 1, 'all formats of one number derive to one key');
  ok(`${cases.length} formats normalize; variants collapse to one key`);
})();

// ─────────────────────────────────────────────────────────────────
section('2. buildLeadPhoneIndex — fallback-coded leads are found by phone');

(() => {
  // The bug: this lead got a random `L…` code, so the global
  // leadCodes/{derived} index has NO doc at "2564787899". A derived-code
  // lookup misses it. The phone index keys off the phone itself.
  const veronica: ExistingLeadForIndex = {
    id: 'lead_veronica',
    phone: '1-256-478-7899',
    leadCode: 'L7UVTAMN',
    name: 'Veronica Grissom',
  };
  const derivedLead: ExistingLeadForIndex = {
    id: 'lead_derived',
    phone: '2055162065',
    leadCode: '2055162065',
    name: 'Phone Coded',
  };
  const phoneOnlyInArray: ExistingLeadForIndex = {
    id: 'lead_arr',
    phone: '', // empty top-level field — phone lives in the structured list
    phones: [{ number: '816-382-1302' }],
    leadCode: 'LARRAY00',
    name: 'Array Phone',
  };
  const noPhone: ExistingLeadForIndex = {
    id: 'lead_nophone',
    phone: '',
    leadCode: 'LNOPHONE',
    name: 'No Phone',
  };

  const index = buildLeadPhoneIndex([veronica, derivedLead, phoneOnlyInArray, noPhone]);

  // Fallback-coded lead is reachable by EITHER the import's bare phone or a
  // reformatted one — both derive to the same key.
  assert.equal(index.get('2564787899')?.leadId, 'lead_veronica', 'fallback lead found by phone');
  assert.equal(index.get(deriveLeadCode('(256) 478-7899')!)?.leadId, 'lead_veronica', 'reformatted phone matches');
  assert.equal(index.get('2564787899')?.leadCode, 'L7UVTAMN', 'carries the existing (fallback) leadCode for the banner');

  assert.equal(index.get('2055162065')?.leadId, 'lead_derived', 'derived-coded lead also indexed');
  assert.equal(index.get('8163821302')?.leadId, 'lead_arr', 'phone from phones[] array is used when phone field is empty');
  assert.equal(index.has('LNOPHONE'), false, 'no-phone lead is not indexed under its random code');
  assert.equal(index.size, 3, 'exactly the three phone-bearing leads are indexed');
  ok('fallback + derived + array-phone leads indexed by phone; no-phone skipped');
})();

// ─────────────────────────────────────────────────────────────────
section('3. buildLeadPhoneIndex — shared phone: first write wins');

(() => {
  // Household landline shared by two leads — keep the index stable.
  const a: ExistingLeadForIndex = { id: 'lead_a', phone: '5551234567', leadCode: '5551234567' };
  const b: ExistingLeadForIndex = { id: 'lead_b', phone: '(555) 123-4567', leadCode: 'LSHARED0' };
  const index = buildLeadPhoneIndex([a, b]);
  assert.equal(index.size, 1, 'one entry for a shared phone');
  assert.equal(index.get('5551234567')?.leadId, 'lead_a', 'first occurrence wins');
  ok('shared phone collapses to first lead');
})();

// ─────────────────────────────────────────────────────────────────
section('4. Re-import simulation — refreshed list does NOT double leads');

(() => {
  // Existing book: 3 leads imported earlier as FALLBACK codes (the Jun 1
  // state) + 1 unrelated derived lead.
  const existing: ExistingLeadForIndex[] = [
    { id: 'l1', phone: '1-256-478-7899', leadCode: 'L7UVTAMN', name: 'Veronica Grissom' },
    { id: 'l2', phone: '1-205-516-2065', leadCode: 'LAB12CDE', name: 'Marcus Webb' },
    { id: 'l3', phone: '816-382-1302', leadCode: 'LZZ99YYX', name: 'Dana Hill' },
    { id: 'l4', phone: '404-555-0101', leadCode: '4045550101', name: 'Unrelated Derived' },
  ];
  const phoneIndex = buildLeadPhoneIndex(existing);

  // Re-import the same three people (different phone formatting) + one
  // genuinely new lead. Mirror the route's per-row decision.
  const reimport = [
    { name: 'Veronica Grissom', phone: '2564787899' }, // bare — same person
    { name: 'Marcus Webb', phone: '(205) 516-2065' }, // formatted — same person
    { name: 'Dana Hill', phone: '+1 816 382 1302' }, // e164 — same person
    { name: 'Brand New', phone: '678-555-0199' }, // never seen
  ];

  const dupes: string[] = [];
  const fresh: string[] = [];
  for (const row of reimport) {
    const derived = deriveLeadCode(row.phone);
    if (derived && phoneIndex.has(derived)) {
      dupes.push(row.name);
    } else {
      fresh.push(row.name);
      // route seeds the index after creating, so a same-phone row later in
      // the batch would dedup against it.
      if (derived) phoneIndex.set(derived, { leadId: `new_${row.name}`, leadCode: derived });
    }
  }

  assert.deepEqual(dupes, ['Veronica Grissom', 'Marcus Webb', 'Dana Hill'], 'all three prior leads dedup');
  assert.deepEqual(fresh, ['Brand New'], 'only the genuinely new lead is created');
  ok('re-importing a refreshed list dedups the fallback-coded leads (no doubling)');
})();

// ─────────────────────────────────────────────────────────────────
section('5. Within-batch dedup — two rows, same phone, no prior lead');

(() => {
  const phoneIndex = buildLeadPhoneIndex([]); // empty book
  const rows = [
    { name: 'First Touch', phone: '305-555-7777' },
    { name: 'Dup In Same File', phone: '(305) 555-7777' },
  ];
  const dupes: string[] = [];
  const fresh: string[] = [];
  for (const row of rows) {
    const derived = deriveLeadCode(row.phone);
    if (derived && phoneIndex.has(derived)) {
      dupes.push(row.name);
    } else {
      fresh.push(row.name);
      if (derived) phoneIndex.set(derived, { leadId: `new_${row.name}`, leadCode: derived });
    }
  }
  assert.deepEqual(fresh, ['First Touch'], 'first occurrence creates');
  assert.deepEqual(dupes, ['Dup In Same File'], 'second occurrence in the same batch dedups');
  ok('within-batch duplicate phone is caught by the seeded index');
})();

console.log('\nAll lead-dedup smoke checks passed.\n');
