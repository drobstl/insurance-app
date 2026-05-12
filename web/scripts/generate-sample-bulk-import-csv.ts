#!/usr/bin/env npx tsx
/**
 * generate-sample-bulk-import-csv.ts
 *
 * Generates a fake-but-realistic CSV for demoing the AFL bulk import
 * flow (e.g. for the Loom walkthrough). 350 rows — under the 400-row
 * MAX_IMPORT_ROWS cap, visually full when scrolled.
 *
 * All phone numbers use the +1-555-555-XXXX test range (non-routable
 * per the North American Numbering Plan). All emails use @example.com
 * (reserved by IANA for documentation, will not deliver). Safe to
 * upload through bulk import without any risk of contacting real people
 * if a welcome accidentally fires.
 *
 * Output: docs/marketing/sample-bulk-import-350.csv
 *
 * Usage:
 *   cd web
 *   node --import tsx ./scripts/generate-sample-bulk-import-csv.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const ROW_COUNT = 350;

const FIRST_NAMES = [
  'Aaron', 'Adam', 'Adrian', 'Aiden', 'Albert', 'Alex', 'Alfred', 'Allen', 'Andre', 'Andrew',
  'Angela', 'Anna', 'Anthony', 'April', 'Arthur', 'Ashley', 'Austin', 'Avery', 'Barbara', 'Benjamin',
  'Beth', 'Beverly', 'Blake', 'Brandon', 'Brenda', 'Brian', 'Brittany', 'Bruce', 'Bryan', 'Caleb',
  'Cameron', 'Carl', 'Carlos', 'Carol', 'Caroline', 'Carter', 'Catherine', 'Charles', 'Charlotte', 'Chris',
  'Christina', 'Christopher', 'Cindy', 'Cody', 'Connor', 'Craig', 'Cynthia', 'Daniel', 'Danielle', 'David',
  'Deborah', 'Dennis', 'Derek', 'Diana', 'Diane', 'Dominic', 'Donald', 'Donna', 'Dorothy', 'Douglas',
  'Dylan', 'Edward', 'Elaine', 'Elijah', 'Elizabeth', 'Emily', 'Emma', 'Eric', 'Erin', 'Ethan',
  'Eugene', 'Evan', 'Evelyn', 'Fiona', 'Frank', 'Gabriel', 'Gary', 'George', 'Glenn', 'Grace',
  'Greg', 'Hailey', 'Hannah', 'Harold', 'Harper', 'Heather', 'Helen', 'Henry', 'Holly', 'Howard',
  'Hunter', 'Ian', 'Isaac', 'Isabella', 'Jack', 'Jacob', 'James', 'Jane', 'Janet', 'Jason',
  'Jasmine', 'Jeffrey', 'Jennifer', 'Jeremy', 'Jessica', 'Jill', 'Joanne', 'John', 'Jonathan', 'Joseph',
  'Joshua', 'Joyce', 'Julia', 'Justin', 'Karen', 'Katherine', 'Kayla', 'Keith', 'Kelly', 'Kenneth',
  'Kevin', 'Kimberly', 'Kyle', 'Larry', 'Laura', 'Lauren', 'Lawrence', 'Leah', 'Leo', 'Leonard',
  'Leslie', 'Liam', 'Lillian', 'Linda', 'Lisa', 'Logan', 'Lori', 'Louis', 'Lucas', 'Luke',
  'Madison', 'Margaret', 'Maria', 'Mark', 'Martha', 'Mason', 'Matthew', 'Megan', 'Melissa', 'Michael',
  'Michelle', 'Mike', 'Molly', 'Nancy', 'Natalie', 'Nathan', 'Nicholas', 'Nicole', 'Noah', 'Norman',
  'Olivia', 'Oscar', 'Owen', 'Pamela', 'Patricia', 'Patrick', 'Paul', 'Peter', 'Philip', 'Rachel',
  'Ralph', 'Randy', 'Raymond', 'Rebecca', 'Renee', 'Richard', 'Robert', 'Roger', 'Ronald', 'Rosa',
  'Russell', 'Ruth', 'Ryan', 'Samantha', 'Samuel', 'Sandra', 'Sara', 'Scott', 'Sean', 'Sharon',
  'Shawn', 'Shirley', 'Sophia', 'Stephanie', 'Stephen', 'Steven', 'Susan', 'Sydney', 'Taylor', 'Teresa',
  'Terry', 'Thomas', 'Tiffany', 'Timothy', 'Todd', 'Tony', 'Tracy', 'Travis', 'Tyler', 'Valerie',
  'Vanessa', 'Victor', 'Victoria', 'Vincent', 'Violet', 'Virginia', 'Walter', 'Wayne', 'William', 'Zachary',
];

const LAST_NAMES = [
  'Adams', 'Allen', 'Anderson', 'Bailey', 'Baker', 'Barnes', 'Bell', 'Bennett', 'Bishop', 'Black',
  'Brooks', 'Brown', 'Bryant', 'Burns', 'Butler', 'Campbell', 'Carter', 'Castro', 'Chapman', 'Clark',
  'Cole', 'Collins', 'Cook', 'Cooper', 'Cox', 'Crawford', 'Cruz', 'Cunningham', 'Daniels', 'Davis',
  'Diaz', 'Dixon', 'Edwards', 'Elliott', 'Ellis', 'Evans', 'Fisher', 'Flores', 'Ford', 'Foster',
  'Fox', 'Franklin', 'Freeman', 'Garcia', 'Gardner', 'Gibson', 'Gomez', 'Gonzalez', 'Gordon', 'Graham',
  'Gray', 'Green', 'Griffin', 'Hall', 'Hamilton', 'Hansen', 'Harris', 'Harrison', 'Hayes', 'Henderson',
  'Henry', 'Hernandez', 'Hill', 'Holmes', 'Hudson', 'Hughes', 'Hunt', 'Hunter', 'Jackson', 'James',
  'Jenkins', 'Johnson', 'Jones', 'Jordan', 'Kelly', 'Kennedy', 'Kim', 'King', 'Knight', 'Lambert',
  'Lane', 'Larson', 'Lawrence', 'Lee', 'Lewis', 'Long', 'Lopez', 'Lowe', 'Marshall', 'Martin',
  'Martinez', 'Mason', 'Matthews', 'McDonald', 'Meyer', 'Miller', 'Mitchell', 'Moore', 'Morgan', 'Morris',
  'Murphy', 'Murray', 'Myers', 'Nelson', 'Newman', 'Nichols', 'Nguyen', 'Oliver', 'Olson', 'Owens',
  'Palmer', 'Parker', 'Patel', 'Patterson', 'Peterson', 'Phillips', 'Pierce', 'Porter', 'Powell', 'Price',
  'Ramirez', 'Ramos', 'Reed', 'Reyes', 'Reynolds', 'Rice', 'Richardson', 'Rivera', 'Roberts', 'Robinson',
  'Rodriguez', 'Rogers', 'Rose', 'Ross', 'Russell', 'Ryan', 'Sanchez', 'Sanders', 'Schmidt', 'Schneider',
  'Scott', 'Shaw', 'Simmons', 'Simpson', 'Sims', 'Smith', 'Snyder', 'Spencer', 'Stevens', 'Stewart',
  'Stone', 'Sullivan', 'Taylor', 'Thomas', 'Thompson', 'Torres', 'Tucker', 'Turner', 'Underwood', 'Vasquez',
  'Walker', 'Wallace', 'Walsh', 'Ward', 'Warren', 'Washington', 'Watson', 'Weaver', 'Webb', 'Wells',
  'West', 'White', 'Wilkins', 'Williams', 'Wilson', 'Winters', 'Wood', 'Wright', 'Yang', 'Young',
];

// Reasonable carrier mix weighted toward what an indie life agent's
// book actually looks like.
const CARRIERS = [
  'Americo', 'Americo', 'Americo',
  'American-Amicable', 'American-Amicable',
  'Mutual of Omaha', 'Mutual of Omaha', 'Mutual of Omaha',
  'Foresters', 'Foresters',
  'Banner Life',
  'AIG',
  'Transamerica',
  'Prudential',
  'John Hancock',
];

// Policy type distribution: mortgage protection is the bread and butter
// for most indie agents, with whole life close behind. Term + IUL fill
// the rest.
const POLICY_TYPES = [
  'Mortgage Protection', 'Mortgage Protection', 'Mortgage Protection', 'Mortgage Protection',
  'Whole Life', 'Whole Life', 'Whole Life',
  'Term Life', 'Term Life',
  'IUL',
  'Accidental',
];

const PREMIUM_FREQUENCIES = ['monthly', 'monthly', 'monthly', 'monthly', 'quarterly', 'annual'];

const STATUSES = ['Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Active', 'Pending', 'Lapsed'];

// Deterministic PRNG so repeated runs produce identical output.
let seed = 0xafafafaf;
function rng() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function int(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function formatDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function randomDobBetween(minYear: number, maxYear: number): string {
  const y = int(minYear, maxYear);
  const m = int(1, 12);
  const daysInMonth = new Date(y, m, 0).getDate();
  const d = int(1, daysInMonth);
  return formatDate(y, m, d);
}

function randomEffectiveDateBetween(minYear: number, maxYear: number): string {
  return randomDobBetween(minYear, maxYear);
}

function policyNumberFor(carrier: string): string {
  const prefix = carrier.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'AX';
  return `${prefix}${int(1000000, 9999999)}`;
}

function premiumForType(policyType: string, frequency: string): number {
  // Base monthly range by policy type, then scale by frequency.
  let monthlyLow = 30;
  let monthlyHigh = 90;
  if (policyType === 'Whole Life') { monthlyLow = 60; monthlyHigh = 220; }
  else if (policyType === 'IUL') { monthlyLow = 120; monthlyHigh = 350; }
  else if (policyType === 'Accidental') { monthlyLow = 12; monthlyHigh = 35; }
  else if (policyType === 'Term Life') { monthlyLow = 28; monthlyHigh = 110; }
  // Mortgage Protection stays in the default 30–90 range.
  const monthly = int(monthlyLow, monthlyHigh);
  if (frequency === 'monthly') return monthly;
  if (frequency === 'quarterly') return monthly * 3;
  if (frequency === 'annual') return monthly * 12;
  return monthly;
}

function coverageFor(policyType: string): number {
  // Round to nearest $5K, ranges vary by type.
  if (policyType === 'Whole Life') return int(10, 60) * 5000;       // $50K–$300K
  if (policyType === 'IUL') return int(40, 200) * 5000;             // $200K–$1M
  if (policyType === 'Accidental') return int(2, 20) * 5000;        // $10K–$100K
  if (policyType === 'Term Life') return int(60, 200) * 5000;       // $300K–$1M
  // Mortgage Protection: $50K–$400K
  return int(10, 80) * 5000;
}

function csvField(value: string | number): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function generate(): string {
  const header = [
    'name', 'owner', 'email', 'phone', 'dateOfBirth',
    'policyNumber', 'carrier', 'policyType', 'effectiveDate',
    'premium', 'coverageAmount', 'status', 'premiumFrequency',
  ];
  const rows: string[] = [header.join(',')];

  const usedPhones = new Set<string>();

  for (let i = 0; i < ROW_COUNT; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const name = `${first} ${last}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;

    // +1-555-555-XXXX test range. Loops if we exhaust the 10K block.
    let phone = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = `+1555555${String(int(100, 9999)).padStart(4, '0')}`;
      if (!usedPhones.has(candidate)) {
        phone = candidate;
        usedPhones.add(candidate);
        break;
      }
    }
    if (!phone) phone = `+15555550${String(i).padStart(3, '0')}`;

    const dob = randomDobBetween(1955, 1995);
    const carrier = pick(CARRIERS);
    const policyType = pick(POLICY_TYPES);
    const frequency = pick(PREMIUM_FREQUENCIES);
    const effectiveDate = randomEffectiveDateBetween(2019, 2026);
    const premium = premiumForType(policyType, frequency);
    const coverage = coverageFor(policyType);
    const status = pick(STATUSES);
    const policyNumber = policyNumberFor(carrier);

    rows.push([
      csvField(name),
      csvField(name), // owner = insured (typical case for indie life book)
      csvField(email),
      csvField(phone),
      csvField(dob),
      csvField(policyNumber),
      csvField(carrier),
      csvField(policyType),
      csvField(effectiveDate),
      csvField(premium),
      csvField(coverage),
      csvField(status),
      csvField(frequency),
    ].join(','));
  }

  return rows.join('\n') + '\n';
}

function main() {
  const csv = generate();
  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'marketing');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'sample-bulk-import-350.csv');
  fs.writeFileSync(outPath, csv, 'utf8');
  const lines = csv.split('\n').length - 1;
  console.log(`Wrote ${outPath}`);
  console.log(`${lines - 1} data rows (under the 400-row MAX_IMPORT_ROWS cap).`);
  console.log('All phones use +1-555-555-XXXX (non-routable). All emails use @example.com (won’t deliver).');
}

main();
