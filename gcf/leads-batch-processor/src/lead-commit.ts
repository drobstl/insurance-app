import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import type { ExtractedLeadFields } from './lead-extractor';

/**
 * Lead-code derivation + dedup + commit — ported from the web app so the
 * batch processor writes byte-identical lead docs to the synchronous
 * single-upload path (`web/app/api/leads/upload/route.ts::commitLead`).
 *
 * Sources merged here (keep in sync when the web copies change):
 *   - web/lib/lead-code-derive.ts      → deriveLeadCode
 *   - web/lib/lead-code-generator.ts   → generateLeadCode / generateUniqueLeadCode
 *   - web/lib/lead-dedup.ts            → resolveLeadCodeOrDuplicate
 *   - web/app/api/leads/upload/route.ts → commitLead
 *
 * Differences from the web copies (and ONLY these):
 *   - no `server-only` import (this is a Cloud Function, not Next)
 *   - Firestore is passed in (`db`) instead of read from getAdminFirestore()
 */

const DERIVED_CODE_LENGTH = 10;

/**
 * Derive a lead code from the lead's phone number. Returns the last 10
 * digits, or null when the input has fewer than 10 digits.
 */
function deriveLeadCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

// No I/O/0/1 — avoids confusion when an agent reads a code over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateLeadCode(): string {
  let code = 'L';
  for (let i = 0; i < 7; i++) {
    code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return code;
}

/**
 * Generate a lead code verified absent from the `leadCodes` index. Retries
 * up to 5 times; at the alphabet's collision rate this never triggers in
 * practice, but the loop bounds the worst case.
 */
async function generateUniqueLeadCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLeadCode();
    const existing = await db.collection('leadCodes').doc(code).get();
    if (!existing.exists) return code;
  }
  throw new Error('Failed to generate a unique lead code after 5 attempts');
}

export interface DuplicateLeadInfo {
  duplicate: true;
  existingLeadId: string;
  existingLeadCode: string;
  existingLeadName?: string;
  existingLeadCreatedAt?: Timestamp | null;
}

export interface ResolvedLeadCode {
  duplicate: false;
  leadCode: string;
  codeKind: 'derived' | 'fallback';
}

export type LeadCodeResolution = DuplicateLeadInfo | ResolvedLeadCode;

/**
 * Resolve the lead code for a new lead:
 *   - Same-agent collision on the phone-derived code → `duplicate: true`
 *     with the existing lead's id/code/name (caller skips the write).
 *   - Cross-agent collision or no phone → random L-code fallback.
 */
export async function resolveLeadCodeOrDuplicate(args: {
  db: Firestore;
  agentId: string;
  phone: string;
  newLeadId: string;
}): Promise<LeadCodeResolution> {
  const { db, agentId, phone, newLeadId } = args;
  const derived = deriveLeadCode(phone);
  if (derived) {
    const existing = await db.collection('leadCodes').doc(derived).get();
    if (existing.exists) {
      const data = existing.data() as { agentId?: string; leadId?: string } | undefined;
      if (data?.agentId === agentId && data.leadId) {
        const leadSnap = await db
          .collection('agents').doc(agentId)
          .collection('leads').doc(data.leadId)
          .get();
        const leadData = leadSnap.data() as
          | { name?: string; createdAt?: Timestamp | null }
          | undefined;
        return {
          duplicate: true,
          existingLeadId: data.leadId,
          existingLeadCode: derived,
          existingLeadName: leadData?.name,
          existingLeadCreatedAt: leadData?.createdAt ?? null,
        };
      }
      // Cross-agent collision — fall through to random fallback below.
    }
    try {
      await db.collection('leadCodes').doc(derived).create({ agentId, leadId: newLeadId });
      return { duplicate: false, leadCode: derived, codeKind: 'derived' };
    } catch {
      // Race (someone claimed the code between get and create) or a
      // cross-agent collision we already detected — fall through.
    }
  }
  const leadCode = await generateUniqueLeadCode(db);
  await db.collection('leadCodes').doc(leadCode).set({ agentId, leadId: newLeadId });
  return { duplicate: false, leadCode, codeKind: 'fallback' };
}

export type CommitLeadResult =
  | { duplicate: true; existingLeadId: string; existingLeadCode: string; existingLeadName?: string }
  | { duplicate: false; leadId: string; leadCode: string; codeKind: 'derived' | 'fallback' };

/**
 * Write a single lead doc + leadCodes index entry. Byte-identical to the
 * web `commitLead`: same doc path (`agents/{agentId}/leads/{autoId}`), same
 * field set, same optional-field gating. Throws on Firestore failure.
 */
export async function commitLead(ctx: {
  db: Firestore;
  agentId: string;
  sourceFileUrl: string;
  sourceFileStoragePath: string;
  extracted: ExtractedLeadFields;
}): Promise<CommitLeadResult> {
  const { db, agentId, sourceFileUrl, sourceFileStoragePath, extracted } = ctx;
  const leadRef = db.collection('agents').doc(agentId).collection('leads').doc();

  const resolution = await resolveLeadCodeOrDuplicate({
    db,
    agentId,
    phone: extracted.phone,
    newLeadId: leadRef.id,
  });
  if (resolution.duplicate) {
    return {
      duplicate: true,
      existingLeadId: resolution.existingLeadId,
      existingLeadCode: resolution.existingLeadCode,
      existingLeadName: resolution.existingLeadName,
    };
  }
  const leadCode = resolution.leadCode;
  const codeKind = resolution.codeKind;

  const leadDoc: Record<string, unknown> = {
    name: extracted.name,
    phone: extracted.phone,
    leadCode,
    codeKind,
    formType: extracted.formType,
    sourceFileUrl,
    sourceFileStoragePath,
    extractionConfidence: extracted.extractionConfidence,
    extractionFlags: extracted.extractionFlags,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: agentId,
  };
  if (extracted.email) leadDoc.email = extracted.email;
  if (extracted.dateOfBirth) leadDoc.dateOfBirth = extracted.dateOfBirth;
  if (extracted.ageYears !== null) leadDoc.ageYears = extracted.ageYears;
  if (extracted.address) leadDoc.address = extracted.address;
  if (extracted.gender) leadDoc.gender = extracted.gender;
  if (extracted.heightText) leadDoc.heightText = extracted.heightText;
  if (extracted.weightLbs !== null) leadDoc.weightLbs = extracted.weightLbs;
  if (extracted.smokerStatus) leadDoc.smokerStatus = extracted.smokerStatus;
  if (extracted.coborrowerStatus) leadDoc.coborrowerStatus = extracted.coborrowerStatus;
  if (extracted.phones && extracted.phones.length > 0) {
    leadDoc.phones = extracted.phones;
  } else if (extracted.phone) {
    leadDoc.phones = [{ number: extracted.phone, label: null }];
  }
  if (extracted.mortgageDetails) leadDoc.mortgageDetails = extracted.mortgageDetails;
  if (extracted.spouseName) leadDoc.spouseName = extracted.spouseName;
  if (extracted.spouseAgeYears !== null) leadDoc.spouseAgeYears = extracted.spouseAgeYears;
  if (extracted.beneficiaryName) leadDoc.beneficiaryName = extracted.beneficiaryName;

  await leadRef.set(leadDoc);
  return { duplicate: false, leadId: leadRef.id, leadCode, codeKind };
}
