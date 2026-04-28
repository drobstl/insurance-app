import 'server-only';

import type { Beneficiary, ExtractedApplicationData } from './types';
import { IngestionV3Error } from './ingestion-v3-errors';
import type { IngestionV3ApplicationResult, IngestionV3BobResult } from './ingestion-v3-types';

export function validateAndNormalizeV3ApplicationResult(result: IngestionV3ApplicationResult): IngestionV3ApplicationResult {
  if (!result || typeof result !== 'object') {
    throw new IngestionV3Error('VALIDATION_FAILED', 'Application result payload is missing.', {
      retryable: false,
      terminal: true,
    });
  }

  return {
    data: normalizeApplicationData(result.data),
    evidence: result.evidence ?? {},
    note: typeof result.note === 'string' ? result.note : undefined,
  };
}

export function validateAndNormalizeV3BobResult(result: IngestionV3BobResult): IngestionV3BobResult {
  if (!result || typeof result !== 'object') {
    throw new IngestionV3Error('VALIDATION_FAILED', 'BOB result payload is missing.', {
      retryable: false,
      terminal: true,
    });
  }
  if (!Array.isArray(result.rows)) {
    throw new IngestionV3Error('VALIDATION_FAILED', 'BOB rows must be an array.', {
      retryable: false,
      terminal: true,
    });
  }

  return {
    rows: result.rows.map((row) => ({
      ...row,
      firstName: (row.firstName || '').trim(),
      lastName: (row.lastName || '').trim(),
      phone: toNullableString(row.phone),
      email: toNullableString(row.email),
      dateOfBirth: toNullableString(row.dateOfBirth),
      policyType: toNullableString(row.policyType),
      policyNumber: toNullableString(row.policyNumber),
      carrier: toNullableString(row.carrier),
      premiumAmount: toNullableNumber(row.premiumAmount),
      coverageAmount: toNullableNumber(row.coverageAmount),
    })),
    rowCount: typeof result.rowCount === 'number' ? result.rowCount : result.rows.length,
    note: typeof result.note === 'string' ? result.note : undefined,
  };
}

function normalizeApplicationData(data: ExtractedApplicationData): ExtractedApplicationData {
  if (!data || typeof data !== 'object') {
    throw new IngestionV3Error('VALIDATION_FAILED', 'Application data is missing.', {
      retryable: false,
      terminal: true,
    });
  }

  return {
    policyType: data.policyType ?? null,
    policyNumber: toNullableString(data.policyNumber),
    insuranceCompany: toNullableString(data.insuranceCompany),
    policyOwner: toNullableString(data.policyOwner),
    insuredName: toNullableString(data.insuredName),
    beneficiaries: normalizeBeneficiaries(data.beneficiaries),
    coverageAmount: toNullableNumber(data.coverageAmount),
    premiumAmount: toNullableNumber(data.premiumAmount),
    premiumFrequency: data.premiumFrequency ?? null,
    renewalDate: toNullableString(data.renewalDate),
    insuredEmail: toNullableString(data.insuredEmail),
    insuredPhone: toNullableString(data.insuredPhone),
    insuredDateOfBirth: toNullableString(data.insuredDateOfBirth),
    insuredState: toStateAbbreviationOrNull(data.insuredState),
    effectiveDate: toIsoDateOrNull(data.effectiveDate),
    applicationSignedDate: toIsoDateOrNull(data.applicationSignedDate),
  };
}

function normalizeBeneficiaries(beneficiaries: Beneficiary[] | null): Beneficiary[] | null {
  if (!Array.isArray(beneficiaries)) return null;
  const normalized = beneficiaries
    .map((b) => ({
      name: toNullableString(b.name),
      relationship: toNullableString(b.relationship ?? null) ?? undefined,
      percentage: toNullableNumber(b.percentage),
      phone: toNullableString(b.phone ?? null) ?? undefined,
      email: toNullableString(b.email ?? null) ?? undefined,
      dateOfBirth: toIsoDateOrNull(b.dateOfBirth ?? null) ?? undefined,
      address: toNullableString(b.address ?? null) ?? undefined,
      accessCode: toNullableString(b.accessCode ?? null) ?? undefined,
      optOutOutreach: b.optOutOutreach === true,
      irrevocable: typeof b.irrevocable === 'boolean' ? b.irrevocable : null,
      type: b.type === 'contingent' ? 'contingent' : 'primary',
    }))
    .filter((b) => b.name);

  if (normalized.length === 0) return null;

  return normalized.map((b) => ({
    name: b.name as string,
    relationship: b.relationship,
    percentage: b.percentage ?? undefined,
    phone: b.phone,
    email: b.email,
    dateOfBirth: b.dateOfBirth,
    address: b.address,
    accessCode: b.accessCode,
    optOutOutreach: b.optOutOutreach,
    irrevocable: b.irrevocable,
    type: b.type as 'primary' | 'contingent',
  }));
}

function toIsoDateOrNull(value: unknown): string | null {
  const s = toNullableString(value);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T12:00:00.000Z`);
  return Number.isNaN(t) ? null : s;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(/[,$]/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStateAbbreviationOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const state = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}
