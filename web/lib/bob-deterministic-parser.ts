import type { BobRow } from './bob-extractor';

interface ParseResult {
  rows: BobRow[];
  confidence: 'high' | 'low';
  note?: string;
  error?: string;
}

function parseCsvLine(line: string, delimiter: string = ','): string[] {
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

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function inferFrequency(raw: string): BobRow['premiumFrequency'] {
  const premiumFrequency = (raw || '').toLowerCase().trim();
  if (premiumFrequency.includes('month') || premiumFrequency === 'mon') return 'monthly';
  if (premiumFrequency.includes('quarter') || premiumFrequency === 'qtr') return 'quarterly';
  if (premiumFrequency.includes('semi')) return 'semi-annual';
  if (premiumFrequency.includes('annual') || premiumFrequency === 'ann') return 'annual';
  return 'monthly';
}

function normalizeStatus(raw: string): BobRow['status'] {
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'pending' || lower === 'applied' || lower === 'submitted') return 'Pending';
  if (lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' || lower === 'terminated' || lower === 'expired') return 'Lapsed';
  return 'Active';
}

export function parseBobDeterministically(text: string, fileName: string): ParseResult {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      rows: [],
      confidence: 'low',
      error: `${fileName}: must have a header row and at least one data row.`,
    };
  }

  const tabCols = lines[0].split('\t').length;
  const commaCols = lines[0].split(',').length;
  const delimiter = tabCols > commaCols ? '\t' : ',';

  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);

  const claimed = new Set<number>();
  const match = (aliases: string[]) => {
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    for (const a of sorted) {
      const idx = headers.findIndex((h, i) => !claimed.has(i) && h === a);
      if (idx !== -1) {
        claimed.add(idx);
        return idx;
      }
    }
    for (const a of sorted) {
      const idx = headers.findIndex((h, i) => !claimed.has(i) && h.includes(a));
      if (idx !== -1) {
        claimed.add(idx);
        return idx;
      }
    }
    return -1;
  };

  const nameIdx = match(['insured nme', 'insured name', 'full name', 'client name', 'name', 'applicant', 'policy holder', 'assured name', 'member name', 'insured']);
  const ownerIdx = match(['owner nme', 'owner name', 'policy owner', 'owner']);
  const emailIdx = match(['insured email address', 'email address', 'insured email', 'email', 'e-mail']);
  const phoneIdx = match(['insured party phone', 'insured phone', 'phone number', 'phone', 'mobile', 'cell', 'telephone']);
  const dobIdx = match(['insured dob', 'date of birth', 'birth date', 'birthdate', 'dob', 'birthday']);
  const policyNumIdx = match(['policy number', 'policy no', 'policy num', 'policynumber', 'certificate number']);
  const carrierIdx = match(['carrier name', 'carrier', 'insurance company', 'company name', 'company', 'insurer', 'insurance carrier']);
  const policyTypeIdx = match(['product type nme', 'product desc', 'product type', 'policy type', 'product', 'plan type', 'line of business nme', 'line of business']);
  const effectiveDateIdx = match(['policy effective dte', 'policy issue dte', 'effective date', 'issue date', 'start date', 'policy date', 'effectivedate', 'inception date']);
  const premiumIdx = match(['monthly premium', 'premium amount', 'premium', 'modal premium', 'payment']);
  const annualPremiumIdx = match(['annual premium']);
  const coverageIdx = match(['face amt', 'face amount', 'face value', 'coverage amount', 'death benefit', 'benefit amount', 'coverage', 'specified amount']);
  const statusIdx = match(['policy status nme', 'policy status', 'status']);
  const billModeIdx = match(['bill mode', 'billing mode', 'payment mode', 'payment frequency']);

  if (nameIdx === -1) {
    return {
      rows: [],
      confidence: 'low',
      error: `${fileName}: no \"Name\" column found.`,
    };
  }

  const rows: BobRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    const name = cols[nameIdx] || '';
    if (!name) continue;

    let premium = premiumIdx !== -1 ? (cols[premiumIdx] || '') : '';
    const billMode = billModeIdx !== -1 ? (cols[billModeIdx] || '') : '';

    if (!premium && annualPremiumIdx !== -1) {
      const annual = parseFloat((cols[annualPremiumIdx] || '0').replace(/[,$]/g, ''));
      if (!Number.isNaN(annual) && annual > 0) {
        premium = (annual / 12).toFixed(2);
      }
    }

    rows.push({
      name,
      owner: ownerIdx !== -1 ? (cols[ownerIdx] || '') : '',
      email: emailIdx !== -1 ? (cols[emailIdx] || '') : '',
      phone: phoneIdx !== -1 ? (cols[phoneIdx] || '') : '',
      dateOfBirth: dobIdx !== -1 ? (cols[dobIdx] || '') : '',
      policyNumber: policyNumIdx !== -1 ? (cols[policyNumIdx] || '') : '',
      carrier: carrierIdx !== -1 ? (cols[carrierIdx] || '') : '',
      policyType: policyTypeIdx !== -1 ? (cols[policyTypeIdx] || '') : '',
      effectiveDate: effectiveDateIdx !== -1 ? (cols[effectiveDateIdx] || '') : '',
      premium,
      coverageAmount: coverageIdx !== -1 ? (cols[coverageIdx] || '') : '',
      status: normalizeStatus(statusIdx !== -1 ? (cols[statusIdx] || '') : ''),
      premiumFrequency: inferFrequency(billMode),
    });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      confidence: 'low',
      error: `${fileName}: no valid rows found.`,
    };
  }

  const matchedCoreColumns = [nameIdx, policyNumIdx, carrierIdx, premiumIdx, coverageIdx].filter((i) => i !== -1).length;
  const confidence = matchedCoreColumns >= 3 ? 'high' : 'low';
  const note = confidence === 'high'
    ? 'Deterministic parser handled this delimited file without AI fallback.'
    : 'Deterministic parser found partial structure; using AI fallback for higher confidence.';

  return { rows, confidence, note };
}
