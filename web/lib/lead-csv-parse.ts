/**
 * Client-side lead-list parser.
 *
 * Turns a CSV / TSV / XLSX file the agent drops on the Leads page into
 * `LeadImportRow[]`, which `/api/leads/import-batch` then writes as one
 * lead per row. Runs entirely in the browser — Excel is decoded with the
 * already-bundled SheetJS lib (dynamic import to keep it out of the main
 * bundle) and converted to CSV so all three formats share one code path.
 *
 * Header matching is intentionally forgiving: agents get lead lists from
 * many vendors with wildly different column names. We map by a list of
 * aliases (exact match first, then substring), claiming each source
 * column once so two fields can't fight over the same header.
 *
 * This module must stay browser-safe — do NOT import server-only helpers
 * (e.g. `lib/phone`). Phone normalization + lead-code derivation happen
 * server-side in the import-batch route.
 */

export interface LeadImportRow {
  name: string;
  phone: string;
  email: string;
  /** YYYY-MM-DD when parseable, else '' */
  dateOfBirth: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface ParseLeadFileResult {
  rows: LeadImportRow[];
  error?: string;
}

// Mirror of the Clients bulk-import cap so the two flows behave the same.
export const MAX_IMPORT_ROWS = 400;

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

function parseDelimitedText(text: string, fileName: string): ParseLeadFileResult {
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

  const headers = parseCsvLine(lines[0], delimiter).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(),
  );

  // Claim-once alias matcher: exact match across all aliases first, then
  // substring. Longest aliases tried first so "first name" beats "name".
  const claimed = new Set<number>();
  const match = (aliases: string[]): number => {
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const a of sorted) {
      const idx = headers.findIndex((h, i) => !claimed.has(i) && h === a);
      if (idx !== -1) { claimed.add(idx); return idx; }
    }
    for (const a of sorted) {
      const idx = headers.findIndex((h, i) => !claimed.has(i) && h.includes(a));
      if (idx !== -1) { claimed.add(idx); return idx; }
    }
    return -1;
  };

  // Order matters — the most specific columns claim their header first so
  // looser substring aliases (e.g. "name") can't steal "first name".
  const firstNameIdx = match(['first name', 'firstname', 'given name', 'first', 'fname']);
  const lastNameIdx = match(['last name', 'lastname', 'surname', 'family name', 'last', 'lname']);
  const fullNameIdx = match(['full name', 'client name', 'lead name', 'contact name', 'insured name', 'customer name', 'name']);
  const phoneIdx = match(['phone number', 'mobile phone', 'cell phone', 'primary phone', 'contact phone', 'contact number', 'telephone', 'phone', 'mobile', 'cell']);
  const emailIdx = match(['email address', 'email', 'e mail']);
  const dobIdx = match(['date of birth', 'birth date', 'birthdate', 'birthday', 'dob']);
  const streetIdx = match(['street address', 'address line 1', 'address1', 'mailing address', 'street', 'address']);
  const cityIdx = match(['city', 'town']);
  const stateIdx = match(['state', 'province', 'region']);
  const zipIdx = match(['zip code', 'zipcode', 'postal code', 'zip', 'postal']);

  if (fullNameIdx === -1 && firstNameIdx === -1 && lastNameIdx === -1) {
    return {
      rows: [],
      error: `${fileName}: couldn't find a Name column. Accepted: Name, Full Name, Client Name, or First Name + Last Name.`,
    };
  }

  const resolveName = (cols: string[]): string => {
    if (fullNameIdx !== -1) {
      const full = (cols[fullNameIdx] || '').trim();
      if (full) return full;
    }
    const fn = firstNameIdx !== -1 ? (cols[firstNameIdx] || '').trim() : '';
    const ln = lastNameIdx !== -1 ? (cols[lastNameIdx] || '').trim() : '';
    return [fn, ln].filter(Boolean).join(' ').trim();
  };

  const rows: LeadImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const name = resolveName(cols);
    if (!name) continue; // skip rows with no name — nothing to dial
    rows.push({
      name,
      phone: phoneIdx !== -1 ? (cols[phoneIdx] || '').trim() : '',
      email: emailIdx !== -1 ? (cols[emailIdx] || '').trim() : '',
      dateOfBirth: normalizeDob(dobIdx !== -1 ? cols[dobIdx] || '' : ''),
      address: {
        street: streetIdx !== -1 ? (cols[streetIdx] || '').trim() : '',
        city: cityIdx !== -1 ? (cols[cityIdx] || '').trim() : '',
        state: stateIdx !== -1 ? (cols[stateIdx] || '').trim() : '',
        zip: zipIdx !== -1 ? (cols[zipIdx] || '').trim() : '',
      },
    });
  }

  return { rows };
}

/**
 * Parse a dropped/selected lead-list file into rows. Detects format by
 * extension: .xlsx/.xls → SheetJS → CSV → shared text path; everything
 * else is read as delimited text (CSV/TSV).
 */
export async function parseLeadFile(file: File): Promise<ParseLeadFileResult> {
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
      return parseDelimitedText(csv, file.name);
    } catch {
      return {
        rows: [],
        error: `${file.name}: couldn't read this Excel file. Try saving it as CSV and uploading again.`,
      };
    }
  }
  const text = await file.text();
  return parseDelimitedText(text, file.name);
}
