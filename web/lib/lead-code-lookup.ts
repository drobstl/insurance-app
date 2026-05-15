import 'server-only';

import { getAdminFirestore } from './firebase-admin';

/**
 * Lead-code lookup. Mirrors the client-code-lookup pattern: an O(1) top-level
 * `leadCodes/{CODE}` index doc with a slow-path scan fallback that back-fills
 * the index. Lead codes are prefixed `L` (vs. `B` for beneficiary, no prefix
 * for client), so the mobile lookup endpoint can short-circuit the dispatch
 * without paying for index reads on the wrong type.
 *
 * See:
 *  - web/lib/client-code-lookup.ts        (the client equivalent)
 *  - web/lib/beneficiary-code-lookup.ts   (the beneficiary equivalent)
 *  - web/app/api/mobile/lookup-client-code/route.ts (consumer)
 */
export interface LeadCodeMatch {
  agentId: string;
  leadId: string;
  leadRef: FirebaseFirestore.DocumentReference;
}

export async function findLeadByCode(code: string): Promise<LeadCodeMatch | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return null;

  const db = getAdminFirestore();

  // Fast path: index doc.
  const indexDoc = await db.collection('leadCodes').doc(normalizedCode).get();
  if (indexDoc.exists) {
    const { agentId, leadId } = indexDoc.data() as { agentId?: string; leadId?: string };
    if (agentId && leadId) {
      const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
      const leadSnap = await leadRef.get();
      if (leadSnap.exists && leadSnap.data()?.leadCode === normalizedCode) {
        return { agentId, leadId, leadRef };
      }
    }
    // Index is stale — delete and fall through to scan.
    await indexDoc.ref.delete().catch(() => {});
  }

  // Slow path: scan all agents (handles leads created before the index existed
  // or surviving an out-of-band Firestore restore).
  const agentsSnap = await db.collection('agents').get();
  for (const agentDoc of agentsSnap.docs) {
    const leadsSnap = await db
      .collection('agents')
      .doc(agentDoc.id)
      .collection('leads')
      .where('leadCode', '==', normalizedCode)
      .limit(1)
      .get();

    if (!leadsSnap.empty) {
      const leadDoc = leadsSnap.docs[0];

      // Back-fill the index for next time.
      await db.collection('leadCodes').doc(normalizedCode).set({
        agentId: agentDoc.id,
        leadId: leadDoc.id,
      }).catch(() => {});

      return {
        agentId: agentDoc.id,
        leadId: leadDoc.id,
        leadRef: leadDoc.ref,
      };
    }
  }

  return null;
}
