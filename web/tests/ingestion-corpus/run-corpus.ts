import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type CorpusStatus = 'review_ready' | 'failed';
type CorpusMode = 'application' | 'bob';
type CorpusPurpose = 'application' | 'bob';

interface CorpusCase {
  id: string;
  fixture: string;
  mode: CorpusMode;
  purpose: CorpusPurpose;
  expectedStatus: CorpusStatus;
  expectedErrorCode?: string;
}

interface CorpusExpectations {
  version: number;
  requiredCaseIds: string[];
  cases: CorpusCase[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname);
const EXPECTATIONS_PATH = path.join(ROOT, 'expectations.json');
const FIXTURES_DIR = path.join(ROOT, 'fixtures');

function fail(message: string): never {
  throw new Error(message);
}

function readExpectations(): CorpusExpectations {
  if (!fs.existsSync(EXPECTATIONS_PATH)) {
    fail(`Missing expectations file at ${EXPECTATIONS_PATH}`);
  }

  const raw = fs.readFileSync(EXPECTATIONS_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`expectations.json is not valid JSON.`);
  }

  if (!parsed || typeof parsed !== 'object') {
    fail(`expectations.json root must be an object.`);
  }

  const json = parsed as Partial<CorpusExpectations>;
  if (!Array.isArray(json.requiredCaseIds) || !Array.isArray(json.cases)) {
    fail(`expectations.json must contain requiredCaseIds[] and cases[].`);
  }

  return {
    version: typeof json.version === 'number' ? json.version : 1,
    requiredCaseIds: json.requiredCaseIds.map(String),
    cases: json.cases as CorpusCase[],
  };
}

function validateCaseDefinitions(expectations: CorpusExpectations) {
  const seen = new Set<string>();
  for (const testCase of expectations.cases) {
    if (!testCase.id || !testCase.fixture) {
      fail(`Each case requires id and fixture. Invalid case: ${JSON.stringify(testCase)}`);
    }
    if (seen.has(testCase.id)) {
      fail(`Duplicate case id "${testCase.id}" in expectations.json`);
    }
    seen.add(testCase.id);

    if (testCase.mode !== 'application' && testCase.mode !== 'bob') {
      fail(`Case "${testCase.id}" has invalid mode "${String(testCase.mode)}"`);
    }
    if (testCase.purpose !== 'application' && testCase.purpose !== 'bob') {
      fail(`Case "${testCase.id}" has invalid purpose "${String(testCase.purpose)}"`);
    }
    if (testCase.expectedStatus !== 'review_ready' && testCase.expectedStatus !== 'failed') {
      fail(`Case "${testCase.id}" has invalid expectedStatus "${String(testCase.expectedStatus)}"`);
    }
  }

  for (const requiredId of expectations.requiredCaseIds) {
    if (!seen.has(requiredId)) {
      fail(`Required corpus case "${requiredId}" is missing from cases[]`);
    }
  }
}

function validateFixtures(expectations: CorpusExpectations) {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fail(`Missing fixtures directory: ${FIXTURES_DIR}`);
  }

  const missing: string[] = [];
  for (const testCase of expectations.cases) {
    const fixturePath = path.join(FIXTURES_DIR, testCase.fixture);
    if (!fs.existsSync(fixturePath)) {
      missing.push(testCase.fixture);
      continue;
    }

    const stat = fs.statSync(fixturePath);
    if (!stat.isFile()) {
      fail(`Fixture "${testCase.fixture}" is not a file.`);
    }
    if (stat.size <= 0) {
      fail(`Fixture "${testCase.fixture}" is empty. Corpus fixtures must be non-empty files.`);
    }
  }

  if (missing.length > 0) {
    fail(`Missing required corpus fixtures: ${missing.join(', ')}`);
  }
}

function printSummary(expectations: CorpusExpectations) {
  console.log('[ingestion-corpus] Expectations version:', expectations.version);
  console.log('[ingestion-corpus] Cases validated:', expectations.cases.length);
  for (const testCase of expectations.cases) {
    console.log(
      `[ingestion-corpus] - ${testCase.id}: fixture=${testCase.fixture}, expectedStatus=${testCase.expectedStatus}` +
        (testCase.expectedErrorCode ? `, expectedErrorCode=${testCase.expectedErrorCode}` : ''),
    );
  }
}

function main() {
  const expectations = readExpectations();
  validateCaseDefinitions(expectations);
  validateFixtures(expectations);
  printSummary(expectations);
  console.log('[ingestion-corpus] PASS');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[ingestion-corpus] FAIL:', message);
  process.exit(1);
}
