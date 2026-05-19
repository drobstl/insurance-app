/**
 * Smoke-test the lead-form extractor against all 5 sample PDFs.
 * Verifies the fingerprint classifies correctly and that key fields
 * (name, phone) come back populated for each.
 *
 * Run: `cd web && node --import tsx ./tests/lead-corpus/run-smoke.ts`
 *
 * Expects ANTHROPIC_API_KEY in the environment (the dev server's
 * `.env.local` works — `dotenv -e .env.local -- node ...`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractLeadFromPdf } from '../../lib/lead-form-extractor';
import { deriveLeadCode } from '../../lib/lead-code-derive';

interface FixtureCase {
  filename: string;
  expectedFormType: 'Mail-In' | 'Call-In' | 'Digital';
  // Loose contains-checks; we don't pin exact extracted values because
  // OCR + LLM = inherently fuzzy. Just verify the meat is there.
  expectedNameContains: string;
  expectedPhoneDigits?: string;       // last 4 we expect to see
  expectedState?: string;             // 2-letter
  expectedDob?: string;               // YYYY-MM-DD when DOB is on the form
}

const FIXTURES: FixtureCase[] = [
  // Mail-In — handwritten, "FINAL MORTGAGE NOTICE"
  {
    filename: 'mail-in-1.pdf',
    expectedFormType: 'Mail-In',
    expectedNameContains: 'YAN',
    expectedPhoneDigits: '9217',
    expectedState: 'MO',
    expectedDob: '1981-11-09',
  },
  // Mail-In sample 2 is structurally a Symmetry "Customer Request"
  // template (typed, not handwritten). Daniel labeled it Mail-In by
  // SOURCE, not visual format. Allow either Mail-In or Call-In here —
  // either is defensible.
  {
    filename: 'mail-in-2.pdf',
    expectedFormType: 'Call-In',  // visual fingerprint says Call-In
    expectedNameContains: 'Amilcar',
    expectedPhoneDigits: '1302',
    expectedState: 'MO',
  },
  // Mail-In — handwritten, "FINAL NOTICE: ENROLLMENT PERIOD EXTENDED"
  {
    filename: 'mail-in-3.pdf',
    expectedFormType: 'Mail-In',
    expectedNameContains: 'Amanda',
    expectedPhoneDigits: '1969',
    expectedState: 'MO',
  },
  // Call-In — Symmetry "Customer Request" template
  {
    filename: 'call-in-1.pdf',
    expectedFormType: 'Call-In',
    expectedNameContains: 'Benita',
    expectedPhoneDigits: '2522',
    expectedState: 'MO',
  },
  // Digital — Lighthouse Leads template
  {
    filename: 'digital-1.pdf',
    expectedFormType: 'Digital',
    expectedNameContains: 'Janice',
    expectedPhoneDigits: '7299',
    expectedState: 'AL',
  },
];

const FIXTURES_DIR = join(__dirname, 'fixtures');

interface CaseResult {
  filename: string;
  passed: boolean;
  reasons: string[];
  formType: string;
  name: string;
  phone: string;
  dob: string | null;
  state: string | null;
  derivedCode: string | null;
  confidence: number;
  flags: string[];
  durationMs: number;
  smokerStatus: 'Y' | 'N' | null;
  coborrowerStatus: 'Y' | 'N' | null;
}

async function runOne(c: FixtureCase): Promise<CaseResult> {
  const start = Date.now();
  const reasons: string[] = [];
  const path = join(FIXTURES_DIR, c.filename);
  const buf = readFileSync(path);
  const b64 = buf.toString('base64');

  let extracted;
  try {
    extracted = await extractLeadFromPdf(b64);
  } catch (err) {
    return {
      filename: c.filename,
      passed: false,
      reasons: [`extractor threw: ${err instanceof Error ? err.message : String(err)}`],
      formType: '-',
      name: '-',
      phone: '-',
      dob: null,
      state: null,
      derivedCode: null,
      confidence: 0,
      flags: [],
      durationMs: Date.now() - start,
      smokerStatus: null,
      coborrowerStatus: null,
    };
  }

  if (extracted.formType !== c.expectedFormType) {
    reasons.push(`formType ${extracted.formType} ≠ expected ${c.expectedFormType}`);
  }
  if (!extracted.name.toLowerCase().includes(c.expectedNameContains.toLowerCase())) {
    reasons.push(`name "${extracted.name}" does not contain "${c.expectedNameContains}"`);
  }
  if (c.expectedPhoneDigits && !extracted.phone.includes(c.expectedPhoneDigits)) {
    reasons.push(`phone "${extracted.phone}" missing expected last4 ${c.expectedPhoneDigits}`);
  }
  if (c.expectedState && extracted.address?.state !== c.expectedState) {
    reasons.push(`state ${extracted.address?.state || '(none)'} ≠ expected ${c.expectedState}`);
  }
  if (c.expectedDob && extracted.dateOfBirth !== c.expectedDob) {
    reasons.push(`dob ${extracted.dateOfBirth || '(none)'} ≠ expected ${c.expectedDob}`);
  }

  const derivedCode = deriveLeadCode(extracted.phone);

  return {
    filename: c.filename,
    passed: reasons.length === 0,
    reasons,
    formType: extracted.formType,
    name: extracted.name,
    phone: extracted.phone,
    dob: extracted.dateOfBirth,
    state: extracted.address?.state || null,
    derivedCode,
    confidence: extracted.extractionConfidence,
    flags: extracted.extractionFlags,
    durationMs: Date.now() - start,
    smokerStatus: extracted.smokerStatus,
    coborrowerStatus: extracted.coborrowerStatus,
  };
}

async function main() {
  console.log(`\n=== Lead-form extractor smoke test ===\n`);
  console.log(`Fixtures dir: ${FIXTURES_DIR}`);
  console.log(`Cases: ${FIXTURES.length}\n`);

  const results: CaseResult[] = [];
  for (const c of FIXTURES) {
    process.stdout.write(`  ${c.filename}…`);
    const r = await runOne(c);
    results.push(r);
    process.stdout.write(`  ${r.passed ? 'PASS' : 'FAIL'}  (${r.durationMs}ms)\n`);
    console.log(`    formType: ${r.formType}`);
    console.log(`    name:     ${r.name}`);
    console.log(`    phone:    ${r.phone}`);
    if (r.dob) console.log(`    dob:      ${r.dob}`);
    if (r.state) console.log(`    state:    ${r.state}`);
    if (r.derivedCode) console.log(`    code:     ${r.derivedCode}`);
    console.log(`    conf:     ${(r.confidence * 100).toFixed(0)}%`);
    console.log(`    smoker:   ${r.smokerStatus ?? '(absent)'}`);
    console.log(`    coborrow: ${r.coborrowerStatus ?? '(absent)'}`);
    if (r.flags.length > 0) console.log(`    flags:    ${r.flags.join(', ')}`);
    if (r.reasons.length > 0) {
      r.reasons.forEach((reason) => console.log(`    ✗ ${reason}`));
    }
    console.log('');
  }

  const passCount = results.filter((r) => r.passed).length;
  console.log(`=== Summary: ${passCount}/${results.length} passed ===\n`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
