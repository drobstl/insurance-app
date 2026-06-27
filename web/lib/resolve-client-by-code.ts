import 'server-only';

import { getAdminFirestore } from './firebase-admin';
import { findClientByCode } from './client-code-lookup';
import { findLeadByCode } from './lead-code-lookup';
import { isLeadCode } from './lead-code-derive';

export interface ResolvedClient {
  agentId: string;
  clientId: string;
  clientRef: FirebaseFirestore.DocumentReference;
}

/**
 * Resolve a mobile session code to its CLIENT doc.
 *
 * Handles the converted-lead case: a lead that becomes a client keeps its
 * original `L-` code as the session key (see lookup-client-code), so an L-code
 * must hop lead → `convertedToClientId` → client. Plain `C-` client codes
 * resolve directly. Returns null for unconverted leads, beneficiaries, or
 * unknown codes — i.e. anything that isn't a real client today.
 *
 * Use this anywhere a mobile endpoint needs the client behind a session code
 * (e.g. the open signal + reset reveal); `findClientByCode` alone would miss
 * every client who came in through the lead → convert funnel.
 */
export async function resolveClientByAnyCode(code: string): Promise<ResolvedClient | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  if (isLeadCode(normalized)) {
    const leadMatch = await findLeadByCode(normalized);
    if (!leadMatch) return null;
    const leadSnap = await leadMatch.leadRef.get();
    const convertedId = leadSnap.get('convertedToClientId');
    if (typeof convertedId !== 'string' || !convertedId) return null;
    const clientRef = getAdminFirestore()
      .collection('agents').doc(leadMatch.agentId)
      .collection('clients').doc(convertedId);
    return { agentId: leadMatch.agentId, clientId: convertedId, clientRef };
  }

  const clientMatch = await findClientByCode(normalized);
  if (!clientMatch) return null;
  return { agentId: clientMatch.agentId, clientId: clientMatch.clientId, clientRef: clientMatch.clientRef };
}
