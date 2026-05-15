/**
 * Agent state-license registry.
 *
 * Agents licensed in multiple states upload one PDF + metadata per
 * state. The registry is consumed by the booking-confirmation flow
 * (Chunk 4e) which attaches the state-matched license PDF to the
 * outbound MMS based on the lead's `address.state`.
 *
 * Storage:
 *   - Firestore: `agents/{agentId}.licenses: { [stateCode]: LicenseEntry }`
 *   - Storage:   `agents/{agentId}/licenses/{stateCode}.pdf`
 *
 * The Firestore doc carries the metadata + a server-side storage
 * path; signed URLs are minted on demand by the API endpoints (1-year
 * TTL, mirrors the lead-form upload pattern).
 */

import 'server-only';

import { getAdminFirestore, getAdminStorage } from './firebase-admin';

/** US states + DC + commonly-licensed territories. Locked vocabulary. */
export const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
  'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX',
  'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR',
] as const;

export type StateCode = typeof US_STATE_CODES[number];

export function isValidStateCode(s: string): s is StateCode {
  return (US_STATE_CODES as readonly string[]).includes(s);
}

export interface LicenseEntry {
  number: string;            // license number as printed
  expiresOn: string | null;  // YYYY-MM-DD; null when not provided
  pdfStoragePath: string;    // gs path: `agents/{agentId}/licenses/{stateCode}.pdf`
  uploadedAt: string;        // ISO
}

export type LicenseRegistry = Partial<Record<StateCode, LicenseEntry>>;

export function licenseStoragePath(agentId: string, stateCode: StateCode): string {
  return `agents/${agentId}/licenses/${stateCode}.pdf`;
}

/**
 * Look up the license for a given lead's state. Returns null if the
 * agent isn't licensed there OR if no license PDF was uploaded.
 *
 * The booking-confirmation flow (4e) calls this to decide which PDF
 * to attach to the outbound MMS. If null, the confirmation goes
 * without a license attachment — the agent isn't licensed in that
 * state and shouldn't be sending one.
 */
export async function getLicenseForState(
  agentId: string,
  stateCode: string,
): Promise<LicenseEntry | null> {
  if (!isValidStateCode(stateCode)) return null;
  const db = getAdminFirestore();
  const snap = await db.collection('agents').doc(agentId).get();
  const data = snap.data();
  const licenses = (data?.licenses || {}) as LicenseRegistry;
  return licenses[stateCode] ?? null;
}

/**
 * Mint a signed download URL for a license PDF. 1-year TTL — these
 * URLs are surfaced in the dashboard for agents to view their own
 * uploaded licenses, and embedded in confirmation MMS templates.
 */
export async function getLicenseSignedUrl(
  agentId: string,
  stateCode: StateCode,
): Promise<string | null> {
  try {
    const path = licenseStoragePath(agentId, stateCode);
    const [exists] = await getAdminStorage().bucket().file(path).exists();
    if (!exists) return null;
    const [url] = await getAdminStorage()
      .bucket()
      .file(path)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });
    return url;
  } catch (err) {
    console.error(`getLicenseSignedUrl(${agentId}, ${stateCode}) failed:`, err);
    return null;
  }
}

export function isExpired(entry: LicenseEntry): boolean {
  if (!entry.expiresOn) return false;
  // Compare ISO date strings; YYYY-MM-DD lex-sorts as date.
  const today = new Date().toISOString().slice(0, 10);
  return entry.expiresOn < today;
}
