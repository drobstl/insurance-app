import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseLeadFile, MAX_IMPORT_ROWS } from '../../lib/lead-csv-parse';

/**
 * Smoke check for the browser-side lead-list parser (lib/lead-csv-parse).
 *
 * Node 18+ exposes a global `File`, so we can feed the real `parseLeadFile`
 * the same inputs an agent's browser would: CSV, TSV, and an XLSX workbook
 * built with the same SheetJS lib the app bundles. This covers the riskiest
 * logic (delimiter detection, claim-once header aliasing, DOB normalization,
 * single-`address`→street mapping, first/last name join) without needing
 * Firebase auth or the running app.
 */

// Header order intentionally mixes a single `address` column + a separate
// `state` column, plus vendor-y header names, to exercise alias matching.
const HEADER = 'Full Name,Cell Phone,Email Address,Date of Birth,Mailing Address,State';
const ROWS = [
  'Jane Clean,(555) 123-4567,jane@example.com,3/5/1985,123 Main St,TX',
  'Phil Nophone,,phil@example.com,1990-12-01,456 Oak Ave,CA', // phone-less
  'Dupe Dan,555-123-4567,dan@example.com,,789 Pine Rd,FL',     // dup phone of row 1
];
const CSV = [HEADER, ...ROWS].join('\n');

function csvFile(text: string, name = 'leads.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

function xlsxFile(name = 'leads.xlsx'): File {
  const aoa = [HEADER.split(','), ...ROWS.map((r) => r.split(','))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function assertRows(label: string, rows: Awaited<ReturnType<typeof parseLeadFile>>['rows']) {
  assert.equal(rows.length, 3, `${label}: expected 3 rows, got ${rows.length}`);

  const [jane, phil, dan] = rows;

  assert.equal(jane.name, 'Jane Clean', `${label}: full name`);
  assert.equal(jane.phone, '(555) 123-4567', `${label}: phone kept raw (server normalizes)`);
  assert.equal(jane.email, 'jane@example.com', `${label}: email`);
  assert.equal(jane.dateOfBirth, '1985-03-05', `${label}: DOB slash→ISO`);
  assert.equal(jane.address.street, '123 Main St', `${label}: single address col → street`);
  assert.equal(jane.address.state, 'TX', `${label}: separate state col`);

  assert.equal(phil.name, 'Phil Nophone', `${label}: phone-less row still parses`);
  assert.equal(phil.phone, '', `${label}: phone-less phone empty`);
  assert.equal(phil.dateOfBirth, '1990-12-01', `${label}: ISO DOB passthrough`);

  assert.equal(dan.name, 'Dupe Dan', `${label}: dup-phone row name`);
  assert.equal(dan.phone, '555-123-4567', `${label}: dup phone kept raw`);
  assert.equal(dan.dateOfBirth, '', `${label}: unparseable/empty DOB → empty`);
}

async function testCsv() {
  const { rows, error } = await parseLeadFile(csvFile(CSV));
  assert.equal(error, undefined, `csv: unexpected error ${error}`);
  assertRows('csv', rows);
}

async function testTsv() {
  const tsv = [HEADER, ...ROWS].map((line) => line.split(',').join('\t')).join('\n');
  const { rows, error } = await parseLeadFile(csvFile(tsv, 'leads.tsv'));
  assert.equal(error, undefined, `tsv: unexpected error ${error}`);
  assertRows('tsv', rows);
}

async function testXlsx() {
  const { rows, error } = await parseLeadFile(xlsxFile());
  assert.equal(error, undefined, `xlsx: unexpected error ${error}`);
  assertRows('xlsx', rows);
}

async function testNoNameColumn() {
  const { rows, error } = await parseLeadFile(csvFile('phone,email\n555,a@b.com'));
  assert.equal(rows.length, 0, 'no-name: expected 0 rows');
  assert.ok(error && /Name column/i.test(error), `no-name: expected name error, got ${error}`);
}

async function testFirstLastSplit() {
  const csv = 'First Name,Last Name,Phone\nMary,Major,555-0001';
  const { rows, error } = await parseLeadFile(csvFile(csv));
  assert.equal(error, undefined, `first/last: unexpected error ${error}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Mary Major', 'first/last: first+last joined');
}

async function testRowCap() {
  const many = ['name', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Person ${i}`)].join('\n');
  const { rows, error } = await parseLeadFile(csvFile(many));
  assert.equal(rows.length, 0, 'cap: expected 0 rows on overflow');
  assert.ok(error && /max/i.test(error), `cap: expected max-rows error, got ${error}`);
}

async function main() {
  console.log('[lead-csv-parse-smoke] Running lead CSV/Excel parser smoke checks...');
  await testCsv();
  await testTsv();
  await testXlsx();
  await testNoNameColumn();
  await testFirstLastSplit();
  await testRowCap();
  console.log('[lead-csv-parse-smoke] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[lead-csv-parse-smoke] FAIL:', message);
  process.exit(1);
});
