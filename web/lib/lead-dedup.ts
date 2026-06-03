import 'server-only';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { deriveLeadCode } from './lead-code-derive';
import { generateUniqueLeadCode } from './lead-code-generator';

/**
 * Lead-import dedup helper.
 *
 * Before this lived in a shared module, both `/api/leads/upload` and
 * `/api/leads/create` had near-identical code that tried to `create()`
 * the leadCodes/{derived} doc and silently fell back to a random L-code
 * on collision — which would create a SECOND lead doc for the same
 * phone owned by the same agent. That's the duplicate-leak we're
 * closing here.
 *
 * Resolution rules:
 *   - Same-agent collision → return `duplicate: true` with the existing
 *     lead's id/code/name so the caller can surface it. Don't create a
 *     new doc.
 *   - Cross-agent collision → fall back to random L-code (existing
 *     behavior). The two agents will each have their own copy of the
 *     lead under different codes.
 *   - No phone (extraction missed it) → random L-code.
 */

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
        // Same-agent code match. Confirm the lead it points at still exists
        // before calling it a duplicate — a stale index left behind by an
        // older delete (or a phone edit) would otherwise block the number
        // forever. Pull the lead's name + createdAt for the "already exists"
        // message at the same time.
        const leadSnap = await db
          .collection('agents').doc(agentId)
          .collection('leads').doc(data.leadId)
          .get();
        if (leadSnap.exists) {
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
        // Orphaned index (lead was deleted) — self-heal: drop the stale entry
        // and fall through to re-claim the code for the new lead.
        await db.collection('leadCodes').doc(derived).delete().catch(() => {});
      }
      // Cross-agent collision — fall through to random fallback below.
    }
    try {
      await db.collection('leadCodes').doc(derived).create({ agentId, leadId: newLeadId });
      return { duplicate: false, leadCode: derived, codeKind: 'derived' };
    } catch {
      // Race condition (someone else claimed the code between our get and
      // create) or a cross-agent collision we already detected — fall
      // through to random fallback.
    }
  }
  const leadCode = await generateUniqueLeadCode();
  await db.collection('leadCodes').doc(leadCode).set({ agentId, leadId: newLeadId });
  return { duplicate: false, leadCode, codeKind: 'fallback' };
}
