import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

export const maxDuration = 60;

const BATCH_SIZE = 50;

function normalizePolicyType(raw: string): string {
  const lower = (raw || '').trim().toLowerCase();
  const map: Record<string, string> = {
    iul: 'IUL',
    'indexed universal life': 'IUL',
    term: 'Term Life',
    'term life': 'Term Life',
    'whole life': 'Whole Life',
    whole: 'Whole Life',
    'mortgage protection': 'Mortgage Protection',
    mortgage: 'Mortgage Protection',
    accidental: 'Accidental',
    'accidental death': 'Accidental',
    'ad&d': 'Accidental',
  };
  return map[lower] || (raw?.trim() || 'Other');
}

function normalizeStatus(raw: string): 'Active' | 'Pending' | 'Lapsed' {
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'pending' || lower === 'applied') return 'Pending';
  if (lower === 'lapsed' || lower === 'cancelled' || lower === 'canceled' || lower === 'terminated')
    return 'Lapsed';
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
}

export interface CreatedClient {
  clientId: string;
  phone: string;
  firstName: string;
  clientCode: string;
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

    const db = getAdminFirestore();
    const created: CreatedClient[] = [];

    for (const row of rows) {
      const name = (row.name || '').trim();
      if (!name) continue;

      const code = generateClientCode();
      const clientPayload: Record<string, unknown> = {
        name,
        email: (row.email || '').trim(),
        phone: (row.phone || '').trim(),
        clientCode: code,
        agentId: uid,
        createdAt: FieldValue.serverTimestamp(),
      };
      if ((row.dateOfBirth || '').trim()) {
        clientPayload.dateOfBirth = row.dateOfBirth.trim();
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

      // Auto-match referral by phone (non-blocking)
      const rawPhone = (row.phone || '').trim();
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

      const firstName = name.split(' ')[0] || name;
      created.push({
        clientId: clientRef.id,
        phone: (row.phone || '').trim(),
        firstName,
        clientCode: code,
      });

      const hasPolicy =
        (row.policyNumber || '').trim() ||
        (row.carrier || '').trim() ||
        (row.policyType || '').trim() ||
        (row.premium || '').trim() ||
        (row.coverageAmount || '').trim();
      if (hasPolicy) {
        const premiumNum = parseFloat((row.premium || '0').replace(/[,$]/g, ''));
        const coverageNum = parseFloat((row.coverageAmount || '0').replace(/[,$]/g, ''));
        let effDate: string | null = null;
        if ((row.effectiveDate || '').trim()) {
          effDate = normalizeImportDate(row.effectiveDate.trim());
        }
        const policyPayload: Record<string, unknown> = {
          policyType: normalizePolicyType(row.policyType || ''),
          policyNumber: (row.policyNumber || '').trim(),
          insuranceCompany: (row.carrier || '').trim(),
          policyOwner: name,
          beneficiaries: [],
          coverageAmount: isNaN(coverageNum) ? 0 : coverageNum,
          premiumAmount: isNaN(premiumNum) ? 0 : premiumNum,
          premiumFrequency: 'monthly',
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
      }
    }

    return NextResponse.json({ created });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Import-batch error:', msg);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
