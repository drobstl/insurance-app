import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

export const maxDuration = 60;

const BATCH_SIZE = 50;

function normalizePolicyType(raw: string): string {
  const lower = (raw || '').trim().toLowerCase();
  const exactMap: Record<string, string> = {
    iul: 'IUL',
    'indexed universal life': 'IUL',
    'universal life': 'IUL',
    term: 'Term Life',
    'term life': 'Term Life',
    'term life express 10 15 20 30': 'Term Life',
    'level term': 'Term Life',
    'return of premium': 'Term Life',
    'return of premium term': 'Term Life',
    'whole life': 'Whole Life',
    whole: 'Whole Life',
    'living promise-graded': 'Whole Life',
    'living promise - level benefit': 'Whole Life',
    'living promise': 'Whole Life',
    'graded benefit': 'Whole Life',
    "children s - whole life": 'Whole Life',
    'childrens whole life': 'Whole Life',
    "children's whole life": 'Whole Life',
    'ordinary life': 'Whole Life',
    'mortgage protection': 'Mortgage Protection',
    mortgage: 'Mortgage Protection',
    'home certainty': 'Mortgage Protection',
    mp: 'Mortgage Protection',
    accidental: 'Accidental',
    'accidental death': 'Accidental',
    'ad&d': 'Accidental',
    'limited accident': 'Accidental',
    'health and accident': 'Accidental',
    'critical illness': 'Other',
    'critical illness 2014 ia- lump sum heart': 'Other',
    'cancer and specified disease': 'Other',
    cancer: 'Other',
    disability: 'Other',
  };

  if (exactMap[lower]) return exactMap[lower];

  if (lower.includes('term life') || lower.includes('term express')) return 'Term Life';
  if (lower.includes('whole life') || lower.includes('living promise') || lower.includes('children')) return 'Whole Life';
  if (lower.includes('iul') || lower.includes('indexed universal')) return 'IUL';
  if (lower.includes('mortgage') || lower.includes('home certainty')) return 'Mortgage Protection';
  if (lower.includes('accidental') || lower.includes('accident') || lower.includes('ad&d') || lower.includes('limited accident')) return 'Accidental';
  if (lower.includes('critical') || lower.includes('cancer') || lower.includes('disability')) return 'Other';

  return raw?.trim() || 'Other';
}

function normalizeStatus(raw: string): 'Active' | 'Pending' | 'Lapsed' {
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'inforce' || lower === 'in force' || lower === 'active' || lower === 'paid up') return 'Active';
  if (lower === 'pending' || lower === 'applied' || lower === 'submitted') return 'Pending';
  if (
    lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' ||
    lower === 'terminated' || lower === 'surrendered' || lower === 'expired'
  ) return 'Lapsed';
  return 'Active';
}

function normalizeImportDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const r = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  const slashMatch = r.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(r);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface ImportRow {
  name: string;
  owner?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  policyNumber: string;
  carrier: string;
  policyType: string;
  effectiveDate: string;
  premium: string;
  coverageAmount: string;
  status: string;
  premiumFrequency?: string;
}

export interface CreatedClient {
  clientId: string;
  phone: string;
  firstName: string;
  clientCode: string;
  policyCount: number;
}

interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

function validateRow(row: ImportRow, index: number): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (/^\d+$/.test(row.name.trim())) {
    warnings.push({ row: index, field: 'name', message: `Name looks like a number: "${row.name}"` });
  }

  if (row.dateOfBirth?.trim()) {
    const parsed = normalizeImportDate(row.dateOfBirth.trim());
    if (!parsed) {
      warnings.push({ row: index, field: 'dateOfBirth', message: `Could not parse date of birth: "${row.dateOfBirth}"` });
    }
  }

  if (row.effectiveDate?.trim()) {
    const parsed = normalizeImportDate(row.effectiveDate.trim());
    if (!parsed) {
      warnings.push({ row: index, field: 'effectiveDate', message: `Could not parse effective date: "${row.effectiveDate}"` });
    }
  }

  if (row.premium?.trim()) {
    const num = parseFloat(row.premium.replace(/[,$]/g, ''));
    if (isNaN(num)) {
      warnings.push({ row: index, field: 'premium', message: `Premium is not a number: "${row.premium}"` });
    } else if (num > 10000) {
      warnings.push({ row: index, field: 'premium', message: `Premium seems high ($${num}/mo). Verify this is monthly, not annual.` });
    }
  }

  if (row.coverageAmount?.trim()) {
    const num = parseFloat(row.coverageAmount.replace(/[,$]/g, ''));
    if (isNaN(num)) {
      warnings.push({ row: index, field: 'coverageAmount', message: `Coverage amount is not a number: "${row.coverageAmount}"` });
    }
  }

  if (row.phone?.trim()) {
    try {
      const normalized = normalizePhone(row.phone.trim());
      if (!isValidE164(normalized)) {
        warnings.push({ row: index, field: 'phone', message: `Phone may be invalid: "${row.phone}"` });
      }
    } catch {
      warnings.push({ row: index, field: 'phone', message: `Phone may be invalid: "${row.phone}"` });
    }
  }

  if (row.policyNumber?.trim() && /^\d{3}-\d{2}-\d{4}$/.test(row.policyNumber.trim())) {
    warnings.push({ row: index, field: 'policyNumber', message: 'Policy number looks like an SSN — skipping.' });
  }

  return warnings;
}

function dedupKey(name: string, dob: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ' ').trim()}|${(dob || '').trim()}`;
}

function dedupKeyFallback(name: string, phone: string, email: string): string {
  const norm = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (phone?.trim()) return `${norm}|phone:${phone.trim()}`;
  if (email?.trim()) return `${norm}|email:${email.trim().toLowerCase()}`;
  return `${norm}|solo`;
}

interface ClientGroup {
  primaryRow: ImportRow;
  allRows: ImportRow[];
}

function groupRowsByClient(rows: ImportRow[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();

  for (const row of rows) {
    const name = (row.name || '').trim();
    if (!name) continue;

    const key = row.dateOfBirth?.trim()
      ? dedupKey(name, row.dateOfBirth)
      : dedupKeyFallback(name, row.phone, row.email);

    const existing = groups.get(key);
    if (existing) {
      existing.allRows.push(row);
      if (!existing.primaryRow.email && row.email) existing.primaryRow.email = row.email;
      if (!existing.primaryRow.phone && row.phone) existing.primaryRow.phone = row.phone;
      if (!existing.primaryRow.dateOfBirth && row.dateOfBirth) existing.primaryRow.dateOfBirth = row.dateOfBirth;
    } else {
      groups.set(key, { primaryRow: { ...row }, allRows: [row] });
    }
  }

  return Array.from(groups.values());
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required and must not be empty' }, { status: 400 });
    }
    if (rows.length > BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${BATCH_SIZE} rows per batch` },
        { status: 400 }
      );
    }

    const allWarnings: ValidationWarning[] = [];
    rows.forEach((row, i) => {
      allWarnings.push(...validateRow(row, i));
    });

    const clientGroups = groupRowsByClient(rows);
    const db = getAdminFirestore();
    const created: CreatedClient[] = [];
    let totalPolicies = 0;

    for (const group of clientGroups) {
      const { primaryRow, allRows } = group;
      const name = (primaryRow.name || '').trim();
      if (!name) continue;

      const code = generateClientCode();
      const clientPayload: Record<string, unknown> = {
        name,
        email: (primaryRow.email || '').trim(),
        phone: (primaryRow.phone || '').trim(),
        clientCode: code,
        agentId: uid,
        createdAt: FieldValue.serverTimestamp(),
      };
      if ((primaryRow.dateOfBirth || '').trim()) {
        clientPayload.dateOfBirth = primaryRow.dateOfBirth.trim();
      }

      const clientRef = await db
        .collection('agents')
        .doc(uid)
        .collection('clients')
        .add(clientPayload);

      try {
        await db.doc(`clients/${clientRef.id}`).set(clientPayload);
        await db.doc(`clientCodes/${code}`).set({ agentId: uid, clientId: clientRef.id });
      } catch (mirrorErr) {
        console.error('Import-batch mirror failed (non-blocking):', mirrorErr);
      }

      const rawPhone = (primaryRow.phone || '').trim();
      if (rawPhone) {
        try {
          const normalized = normalizePhone(rawPhone);
          if (isValidE164(normalized)) {
            const refSnap = await db
              .collection('agents')
              .doc(uid)
              .collection('referrals')
              .where('referralPhone', '==', normalized)
              .limit(1)
              .get();
            if (!refSnap.empty) {
              await clientRef.update({ sourceReferralId: refSnap.docs[0].id });
            }
          }
        } catch (matchErr) {
          console.error('Referral match failed (non-blocking):', matchErr);
        }
      }

      let policyCount = 0;

      for (const row of allRows) {
        const hasPolicy =
          (row.policyNumber || '').trim() ||
          (row.carrier || '').trim() ||
          (row.policyType || '').trim() ||
          (row.premium || '').trim() ||
          (row.coverageAmount || '').trim();

        if (!hasPolicy) continue;

        if (row.policyNumber?.trim() && /^\d{3}-\d{2}-\d{4}$/.test(row.policyNumber.trim())) {
          continue;
        }

        const premiumNum = parseFloat((row.premium || '0').replace(/[,$]/g, ''));
        const coverageNum = parseFloat((row.coverageAmount || '0').replace(/[,$]/g, ''));
        let effDate: string | null = null;
        if ((row.effectiveDate || '').trim()) {
          effDate = normalizeImportDate(row.effectiveDate.trim());
        }

        const ownerName = (row.owner || '').trim();
        const policyOwner = ownerName && ownerName.toLowerCase() !== name.toLowerCase()
          ? ownerName
          : name;

        const policyPayload: Record<string, unknown> = {
          policyType: normalizePolicyType(row.policyType || ''),
          policyNumber: (row.policyNumber || '').trim(),
          insuranceCompany: (row.carrier || '').trim(),
          policyOwner,
          beneficiaries: [],
          coverageAmount: isNaN(coverageNum) ? 0 : coverageNum,
          premiumAmount: isNaN(premiumNum) ? 0 : premiumNum,
          premiumFrequency: row.premiumFrequency || 'monthly',
          renewalDate: '',
          effectiveDate: effDate,
          status: normalizeStatus(row.status || ''),
        };
        await db
          .collection('agents')
          .doc(uid)
          .collection('clients')
          .doc(clientRef.id)
          .collection('policies')
          .add({ ...policyPayload, createdAt: FieldValue.serverTimestamp() });

        policyCount++;
        totalPolicies++;
      }

      const firstName = name.split(' ')[0] || name;
      created.push({
        clientId: clientRef.id,
        phone: (primaryRow.phone || '').trim(),
        firstName,
        clientCode: code,
        policyCount,
      });
    }

    return NextResponse.json({
      created,
      totalPolicies,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Import-batch error:', msg);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
