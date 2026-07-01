/**
 * Client-side lead-list parser.
 *
 * Turns a CSV / TSV / XLSX file the agent drops on the Leads page into
 * `LeadImportRow[]`, which `/api/leads/import-batch` then writes as one
 * lead per row. Runs entirely in the browser — Excel is decoded with the
 * already-bundled SheetJS lib (dynamic import to keep it out of the main
 * bundle) and converted to CSV so all three formats share one code path.
 *
 * Header matching is two-stage, so we capture the SAME rich field set the
 * PDF extractor does (mortgage, tobacco, co-borrower, spouse, …) no matter
 * what a vendor named their columns:
 *   1. A deterministic claim-once alias matcher handles the predictable
 *      headers instantly, in-browser, for free.
 *   2. Any column the aliases don't recognize is handed to an injected
 *      `mapColumns` mapper (the Leads page wires this to `/api/leads/
 *      map-columns`, which asks Claude to map arbitrary headers onto our
 *      known fields — the same intelligence the PDF path gets). The mapper
 *      is OPTIONAL and injected, so this module never fetches or touches
 *      auth and stays browser-safe; if it throws we keep the deterministic
 *      result rather than failing the import.
 *
 * This module must stay browser-safe — do NOT import server-only helpers
 * (e.g. `lib/phone`). Phone normalization + lead-code derivation happen
 * server-side in the import-batch route.
 */

/** Canonical importable fields — one per column a lead row can carry. The
 *  three name parts resolve into a single `name`; everything else maps 1:1
 *  onto the lead doc (matching the PDF extractor's shapes). This list is the
 *  single source of truth shared with the AI mapper endpoint. */
export type LeadFieldKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'dateOfBirth'
  | 'ageYears'
  | 'street'
  | 'city'
  | 'state'
  | 'zip'
  | 'gender'
  | 'heightText'
  | 'weightLbs'
  | 'smokerStatus'
  | 'coborrowerStatus'
  | 'mortgageBalance'
  | 'mortgageLender'
  | 'spouseName'
  | 'spouseAgeYears'
  | 'beneficiaryName';

export interface LeadFieldDef {
  key: LeadFieldKey;
  /** Human label shown to the AI mapper. */
  label: string;
  /** One-line hint the AI mapper uses to disambiguate. */
  hint: string;
  /** Pre-normalized (lowercase, punctuation-stripped) header aliases. */
  aliases: string[];
  /** When true, only an exact header match counts — no substring fallback.
   *  Used for short, greedy tokens (e.g. "age", which is a substring of
   *  "mortgage" and "coverage") so they can't steal an unrelated column. */
  exactOnly?: boolean;
}

/**
 * Field definitions in claim-once PRIORITY order. More specific fields come
 * first so a looser substring alias can't steal a header from a field that
 * should own it (e.g. email/phone/name claim before the address block; the
 * mortgage + spouse-age fields claim before the greedy "age" token).
 */
export const LEAD_FIELD_DEFS: LeadFieldDef[] = [
  { key: 'firstName', label: 'First name', hint: 'Given/first name only.', aliases: ['first name', 'firstname', 'given name', 'fname', 'first'] },
  { key: 'lastName', label: 'Last name', hint: 'Surname/last name only.', aliases: ['last name', 'lastname', 'surname', 'family name', 'lname', 'last'] },
  { key: 'fullName', label: 'Full name', hint: 'The lead\'s whole name in one column.', aliases: ['full name', 'client name', 'lead name', 'contact name', 'insured name', 'customer name', 'name'] },
  { key: 'email', label: 'Email', hint: 'Email address.', aliases: ['email address', 'email', 'e mail'] },
  { key: 'phone', label: 'Phone', hint: 'Any phone/mobile/cell number to reach the lead.', aliases: ['phone number', 'mobile phone', 'cell phone', 'primary phone', 'contact phone', 'contact number', 'telephone', 'phone', 'mobile', 'cell'] },
  { key: 'dateOfBirth', label: 'Date of birth', hint: 'Birth date (any format).', aliases: ['date of birth', 'birth date', 'birthdate', 'birthday', 'dob'] },
  { key: 'spouseAgeYears', label: 'Spouse age', hint: 'Age in years of the spouse/co-borrower — NOT the lead.', aliases: ['spouse age', 'spouses age', 'co borrower age', 'coborrower age'] },
  { key: 'spouseName', label: 'Spouse name', hint: 'Name of the spouse/partner/co-borrower.', aliases: ['spouse name', 'spouses name', 'co borrower name', 'coborrower name', 'partner name', 'spouse'] },
  { key: 'mortgageBalance', label: 'Mortgage balance', hint: 'Total mortgage/loan balance owed (a dollar amount), NOT the monthly payment.', aliases: ['mortgage balance', 'mortgage loan amount', 'loan amount', 'mortgage amount', 'loan balance'] },
  { key: 'mortgageLender', label: 'Mortgage lender', hint: 'Name of the bank/lender that holds the mortgage.', aliases: ['mortgage lender', 'originating lender', 'lender name', 'lender', 'bank'] },
  { key: 'ageYears', label: 'Age', hint: 'The lead\'s current age in years (a whole number).', aliases: ['age', 'age years', 'current age', 'client age', 'years old'], exactOnly: true },
  { key: 'gender', label: 'Gender', hint: 'Gender / sex (M or F).', aliases: ['gender', 'sex'] },
  { key: 'heightText', label: 'Height', hint: 'Height as written (e.g. 5\'10").', aliases: ['height', 'client height'] },
  { key: 'weightLbs', label: 'Weight', hint: 'Weight in pounds (a number).', aliases: ['weight lbs', 'client weight', 'weight'] },
  { key: 'smokerStatus', label: 'Tobacco / smoker', hint: 'Whether the lead uses tobacco/smokes (yes/no).', aliases: ['smoker status', 'tobacco use', 'uses tobacco', 'smoker', 'tobacco', 'smoke'] },
  { key: 'coborrowerStatus', label: 'Co-borrower', hint: 'Whether there is a co-borrower on the mortgage (yes/no).', aliases: ['co borrower', 'coborrower', 'co applicant', 'coapplicant', 'joint applicant'] },
  { key: 'beneficiaryName', label: 'Beneficiary', hint: 'Named beneficiary, if the list has one.', aliases: ['beneficiary name', 'beneficiary'] },
  { key: 'street', label: 'Street address', hint: 'Street / mailing address line.', aliases: ['street address', 'address line 1', 'address1', 'mailing address', 'street', 'address'] },
  { key: 'city', label: 'City', hint: 'City / town.', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', hint: 'State / province.', aliases: ['state', 'province', 'region'] },
  { key: 'zip', label: 'ZIP', hint: 'ZIP / postal code.', aliases: ['zip code', 'zipcode', 'postal code', 'zip', 'postal'] },
];

export interface LeadImportRow {
  name: string;
  phone: string;
  email: string;
  /** YYYY-MM-DD when parseable, else '' */
  dateOfBirth: string;
  /** Explicit age column, or null — server derives from DOB when null. */
  ageYears: number | null;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  gender: 'M' | 'F' | '';
  heightText: string;
  weightLbs: number | null;
  smokerStatus: 'Y' | 'N' | '';
  coborrowerStatus: 'Y' | 'N' | '';
  mortgageBalance: number | null;
  mortgageLender: string;
  spouseName: string;
  spouseAgeYears: number | null;
  beneficiaryName: string;
}

/** One column the deterministic matcher couldn't place, handed to the AI
 *  mapper with a few sample values so it can disambiguate by content. */
export interface UnresolvedColumn {
  index: number;
  /** Original header text (not normalized) — the AI reads it as printed. */
  header: string;
  /** Up to a few non-empty sample values from that column. */
  samples: string[];
}

/** Injected async header mapper. Given the columns the aliases didn't
 *  recognize, returns which canonical field each one holds (omit a column to
 *  leave it ignored). Wired by the Leads page to the AI endpoint. */
export type ColumnMapper = (
  columns: UnresolvedColumn[],
) => Promise<Array<{ index: number; field: LeadFieldKey }>>;

export interface ParseLeadFileOptions {
  mapColumns?: ColumnMapper;
}

export interface ParseLeadFileResult {
  rows: LeadImportRow[];
  error?: string;
  /** Canonical fields we actually captured (deterministic + AI). Lets the UI
   *  reassure the agent which columns were pulled after an import. */
  fieldsCaptured?: LeadFieldKey[];
}

// Mirror of the Clients bulk-import cap so the two flows behave the same.
export const MAX_IMPORT_ROWS = 400;

// How many sample values per unrecognized column we hand the AI mapper.
const MAPPER_SAMPLES = 4;

/**
 * Quote-aware single-line tokenizer (same logic as the Clients-page CSV
 * parser). Toggles on `"` and splits on the delimiter only when outside
 * quotes. Trims each field.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalize a free-form date string to YYYY-MM-DD. Returns '' when the
 * value can't be parsed (we'd rather drop a bad DOB than store garbage
 * the lead page would try to do date math on).
 */
function normalizeDob(raw: string): string {
  const r = (raw || '').trim();
  if (!r) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  const slash = r.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(r);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

/** Parse a whole-number field (age). Returns null when absent/unparseable. */
function normalizeInt(raw: string): number | null {
  const n = parseInt((raw || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse a dollar/number field (mortgage balance, weight). Strips $ , and
 *  spaces. Returns null when absent/unparseable. */
function normalizeNumber(raw: string): number | null {
  const cleaned = (raw || '').replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Map free-form gender text to M / F ('' when ambiguous/absent). */
function normalizeGender(raw: string): 'M' | 'F' | '' {
  const r = (raw || '').trim().toLowerCase();
  if (!r) return '';
  if (r.startsWith('m')) return 'M';
  if (r.startsWith('f') || r.startsWith('w')) return 'F';
  return '';
}

/** Map free-form yes/no text (tobacco, co-borrower) to Y / N ('' when
 *  ambiguous/absent). Treats non-smoker / declined phrasings as N. */
function normalizeYN(raw: string): 'Y' | 'N' | '' {
  const r = (raw || '').trim().toLowerCase();
  if (!r) return '';
  if (/^(no|non|none|never|n\b|false|0)/.test(r)) return 'N';
  if (/^(yes|y\b|true|1|smoker|tobacco|current)/.test(r)) return 'Y';
  // Bare single letters land here only if the \b variants missed — fall back.
  if (r === 'n') return 'N';
  if (r === 'y') return 'Y';
  return '';
}

async function parseDelimitedText(
  text: string,
  fileName: string,
  opts?: ParseLeadFileOptions,
): Promise<ParseLeadFileResult> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], error: `${fileName}: needs a header row and at least one data row.` };
  }
  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      error: `${fileName}: ${lines.length - 1} rows — the max is ${MAX_IMPORT_ROWS} per import. Split it into smaller files.`,
    };
  }

  // Delimiter: tab if the header has more tab-separated columns than
  // comma-separated, else comma. (XLSX is converted to comma-CSV upstream.)
  const tabCols = lines[0].split('\t').length;
  const commaCols = lines[0].split(',').length;
  const delimiter = tabCols > commaCols ? '\t' : ',';

  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());

  // Tokenize every data row once — reused for both sampling (AI mapper) and
  // the final row build.
  const dataRows: string[][] = [];
  for (let i = 1; i < lines.length; i++) dataRows.push(parseCsvLine(lines[i], delimiter));

  // ── Stage 1: deterministic claim-once alias matcher ──
  // Exact match across all aliases first, then substring (unless exactOnly).
  // Longest aliases tried first so "first name" beats "name". Each source
  // column is claimed once so two fields can't fight over the same header.
  const claimed = new Set<number>();
  const fieldIndex: Partial<Record<LeadFieldKey, number>> = {};
  const match = (aliases: string[], exactOnly?: boolean): number => {
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const a of sorted) {
      const idx = headers.findIndex((h, i) => !claimed.has(i) && h === a);
      if (idx !== -1) { claimed.add(idx); return idx; }
    }
    if (exactOnly) return -1;
    for (const a of sorted) {
      const idx = headers.findIndex((h, i) => !claimed.has(i) && h.includes(a));
      if (idx !== -1) { claimed.add(idx); return idx; }
    }
    return -1;
  };
  for (const def of LEAD_FIELD_DEFS) {
    const idx = match(def.aliases, def.exactOnly);
    if (idx !== -1) fieldIndex[def.key] = idx;
  }

  // ── Stage 2: AI mapper for the leftover columns ──
  // Hand the deterministic matcher's rejects (with sample values) to the
  // injected mapper. It fills only fields still unclaimed — never overrides a
  // confident deterministic match — and any failure leaves stage-1 intact.
  if (opts?.mapColumns) {
    const unresolved: UnresolvedColumn[] = [];
    for (let i = 0; i < rawHeaders.length; i++) {
      if (claimed.has(i) || !rawHeaders[i].trim()) continue;
      const samples: string[] = [];
      for (const cols of dataRows) {
        const v = (cols[i] || '').trim();
        if (v) samples.push(v);
        if (samples.length >= MAPPER_SAMPLES) break;
      }
      // Skip fully-empty columns — nothing to map.
      if (samples.length > 0) unresolved.push({ index: i, header: rawHeaders[i], samples });
    }
    if (unresolved.length > 0) {
      try {
        const mapped = await opts.mapColumns(unresolved);
        for (const { index, field } of mapped) {
          if (index < 0 || index >= rawHeaders.length) continue;
          if (claimed.has(index)) continue;       // don't touch a claimed column
          if (fieldIndex[field] != null) continue; // don't override deterministic
          fieldIndex[field] = index;
          claimed.add(index);
        }
      } catch {
        // Keep the deterministic result — a mapper hiccup must not fail import.
      }
    }
  }

  if (fieldIndex.fullName == null && fieldIndex.firstName == null && fieldIndex.lastName == null) {
    return {
      rows: [],
      error: `${fileName}: couldn't find a Name column. Accepted: Name, Full Name, Client Name, or First Name + Last Name.`,
    };
  }

  // For each field, a getter that pulls its trimmed value from a row (or ''
  // when the field wasn't mapped).
  const col = (key: LeadFieldKey): ((cols: string[]) => string) => {
    const idx = fieldIndex[key];
    return idx == null ? () => '' : (cols: string[]) => (cols[idx] || '').trim();
  };
  const getName = col('fullName');
  const getFirst = col('firstName');
  const getLast = col('lastName');
  const getPhone = col('phone');
  const getEmail = col('email');
  const getDob = col('dateOfBirth');
  const getAge = col('ageYears');
  const getStreet = col('street');
  const getCity = col('city');
  const getState = col('state');
  const getZip = col('zip');
  const getGender = col('gender');
  const getHeight = col('heightText');
  const getWeight = col('weightLbs');
  const getSmoker = col('smokerStatus');
  const getCoborrower = col('coborrowerStatus');
  const getMortBal = col('mortgageBalance');
  const getMortLender = col('mortgageLender');
  const getSpouseName = col('spouseName');
  const getSpouseAge = col('spouseAgeYears');
  const getBeneficiary = col('beneficiaryName');

  const resolveName = (cols: string[]): string => {
    const full = getName(cols);
    if (full) return full;
    return [getFirst(cols), getLast(cols)].filter(Boolean).join(' ').trim();
  };

  const rows: LeadImportRow[] = [];
  for (const cols of dataRows) {
    const name = resolveName(cols);
    if (!name) continue; // skip rows with no name — nothing to dial
    rows.push({
      name,
      phone: getPhone(cols),
      email: getEmail(cols),
      dateOfBirth: normalizeDob(getDob(cols)),
      ageYears: normalizeInt(getAge(cols)),
      address: {
        street: getStreet(cols),
        city: getCity(cols),
        state: getState(cols),
        zip: getZip(cols),
      },
      gender: normalizeGender(getGender(cols)),
      heightText: getHeight(cols),
      weightLbs: normalizeNumber(getWeight(cols)),
      smokerStatus: normalizeYN(getSmoker(cols)),
      coborrowerStatus: normalizeYN(getCoborrower(cols)),
      mortgageBalance: normalizeNumber(getMortBal(cols)),
      mortgageLender: getMortLender(cols),
      spouseName: getSpouseName(cols),
      spouseAgeYears: normalizeInt(getSpouseAge(cols)),
      beneficiaryName: getBeneficiary(cols),
    });
  }

  return { rows, fieldsCaptured: Object.keys(fieldIndex) as LeadFieldKey[] };
}

/**
 * Parse a dropped/selected lead-list file into rows. Detects format by
 * extension: .xlsx/.xls → SheetJS → CSV → shared text path; everything
 * else is read as delimited text (CSV/TSV).
 *
 * Pass `opts.mapColumns` to enable AI mapping of unrecognized columns.
 */
export async function parseLeadFile(
  file: File,
  opts?: ParseLeadFileOptions,
): Promise<ParseLeadFileResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    try {
      // SheetJS is CommonJS — under some bundlers the API lands on
      // `.default`, under others on the namespace directly. Handle both.
      const mod = await import('xlsx');
      const XLSX = ((mod as unknown as { default?: typeof mod }).default ?? mod);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        return { rows: [], error: `${file.name}: the spreadsheet has no sheets.` };
      }
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[firstSheetName]);
      return parseDelimitedText(csv, file.name, opts);
    } catch {
      return {
        rows: [],
        error: `${file.name}: couldn't read this Excel file. Try saving it as CSV and uploading again.`,
      };
    }
  }
  const text = await file.text();
  return parseDelimitedText(text, file.name, opts);
}
