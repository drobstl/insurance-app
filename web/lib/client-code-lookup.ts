import 'server-only';

import { getAdminFirestore } from './firebase-admin';

export interface ClientCodeMatch {
  agentId: string;
  clientId: string;
  clientRef: FirebaseFirestore.DocumentReference;
}

/**
 * Look up a client by their code using the `clientCodes` index (O(1)).
 * Falls back to scanning all agents if the index entry is missing or stale.
 *
 * Returns null if no match is found.
 */
export async function findClientByCode(code: string): Promise<ClientCodeMatch | null> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return null;

  const db = getAdminFirestore();

  // Fast path: check the index
  const indexDoc = await db.collection('clientCodes').doc(normalizedCode).get();
  if (indexDoc.exists) {
    const { agentId, clientId } = indexDoc.data()!;
    const clientRef = db.collection('agents').doc(agentId).collection('clients').doc(clientId);
    const clientSnap = await clientRef.get();

    if (clientSnap.exists && clientSnap.data()?.clientCode === normalizedCode) {
      return { agentId, clientId, clientRef };
    }
    // Index is stale — delete it and fall through to scan
    await indexDoc.ref.delete().catch(() => {});
  }

  // Slow path: scan all agents (handles clients created before the index existed)
  const agentsSnap = await db.collection('agents').get();
  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await db
      .collection('agents')
      .doc(agentDoc.id)
      .collection('clients')
      .where('clientCode', '==', normalizedCode)
      .limit(1)
      .get();

    if (!clientsSnap.empty) {
      const clientDoc = clientsSnap.docs[0];

      // Back-fill the index for next time
      await db.collection('clientCodes').doc(normalizedCode).set({
        agentId: agentDoc.id,
        clientId: clientDoc.id,
      }).catch(() => {});

      return {
        agentId: agentDoc.id,
        clientId: clientDoc.id,
        clientRef: clientDoc.ref,
      };
    }
  }

  return null;
}
