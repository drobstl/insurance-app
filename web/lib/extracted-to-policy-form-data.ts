/**
 * Shared mapper from `ExtractedApplicationData` (the AI extraction
 * output) → `Partial<PolicyFormData>` (the shape both the Add Policy
 * modal form and the Close Sale ritual feed into POST /api/policies).
 *
 * Why this lives here: two surfaces (Add Policy in
 * web/app/dashboard/clients/page.tsx, and Close Sale in
 * web/components/CloseSaleRitual.tsx) used to each carry their own
 * copy of this function. They drifted slightly — the Close Sale copy
 * mapped `policyNumber` and the Add Policy copy didn't, for example —
 * so we consolidated here. Anything carrier-aware that future
 * surfaces need at extraction-to-form time should land in this
 * module too.
 *
 * The output is a `Partial` because any field in the extraction can
 * be null; downstream code (form initial state / POST body) handles
 * missing fields gracefully.
 *
 * Carrier name normalization: matches against KNOWN_CARRIER_NAMES
 * (web/lib/carriers.ts). If the extracted carrier name matches one
 * of those exactly (case-insensitive), we use the canonical version.
 * If not, we use 'Other' and stash the raw value in `otherCarrier`
 * so the agent can see it in the "Other carrier" field and decide.
 *
 * Name normalization: carrier-printed names commonly arrive in
 * "Last, First [Middle]" order. We normalize to "First [Middle]
 * Last" at this boundary so both the form display and the eventual
 * Firestore doc store the natural order.
 */
import type { ExtractedApplicationData } from './types';
import { KNOWN_CARRIER_NAMES } from './carriers';
import { formatClientDisplayName } from './name-utils';

/**
 * Form-state shape for the Add Policy / Edit Policy modal. Also the
 * payload shape POST /api/policies expects (with `clientId` added
 * by the caller). Lives here rather than in clients/page.tsx so
 * non-page modules — Close Sale's ritual, future surfaces — can
 * type against it without an import cycle.
 */
export interface PolicyFormData {
  policyType: string;
  policyNumber: string;
  insuranceCompany: string;
  otherCarrier: string;
  policyOwner: string;
  beneficiaries: Array<{
    name: string;
    type: 'primary' | 'contingent';
    relationship?: string;
    percentage?: number;
    phone?: string;
    email?: string;
    dateOfBirth?: string;
    address?: string;
    accessCode?: string;
  }>;
  coverageAmount: string;
  premiumAmount: string;
  premiumFrequency: string;
  renewalDate: string;
  effectiveDate: string;
  amountOfProtection: string;
  protectionUnit: string;
  status: string;
}

export function mapExtractedApplicationToPolicyFormData(
  data: ExtractedApplicationData,
): Partial<PolicyFormData> {
  const mapped: Partial<PolicyFormData> = {};

  if (data.policyType) mapped.policyType = data.policyType;
  if (data.policyNumber) mapped.policyNumber = data.policyNumber;

  if (data.insuranceCompany) {
    const match = KNOWN_CARRIER_NAMES.find(
      (c) => c.toLowerCase() === data.insuranceCompany!.toLowerCase(),
    );
    if (match) {
      mapped.insuranceCompany = match;
    } else {
      mapped.insuranceCompany = 'Other';
      mapped.otherCarrier = data.insuranceCompany;
    }
  }

  if (data.policyOwner) {
    mapped.policyOwner = formatClientDisplayName(data.policyOwner);
  }

  if (data.beneficiaries && data.beneficiaries.length > 0) {
    mapped.beneficiaries = data.beneficiaries.map((b) => ({
      name: formatClientDisplayName(b.name),
      type: b.type,
      relationship: b.relationship || '',
      percentage: b.percentage,
      phone: b.phone || '',
      email: b.email || '',
      dateOfBirth: b.dateOfBirth || '',
      address: b.address || '',
      accessCode: b.accessCode || '',
    }));
  }

  if (data.coverageAmount != null) mapped.coverageAmount = String(data.coverageAmount);
  if (data.premiumAmount != null) mapped.premiumAmount = String(data.premiumAmount);
  if (data.premiumFrequency) mapped.premiumFrequency = data.premiumFrequency;
  if (data.renewalDate) mapped.renewalDate = data.renewalDate;
  if (data.effectiveDate) mapped.effectiveDate = data.effectiveDate;

  mapped.status = 'Active';

  return mapped;
}
