import 'server-only';

import { getAdminFirestore } from './firebase-admin';

export interface BeneficiaryCodeMatch {
  agentId: string;
  clientId: string;
  policyId: string;
  beneficiaryIndex: number;
  beneficiary: {
    name: string;
    type: 'primary' | 'contingent';
    relationship?: string;
    percentage?: number;
    phone?: string;
    email?: string;
    accessCode: string;
  };
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function findBeneficiaryIndexByCode(
  beneficiaries: unknown,
  normalizedCode: string,
): { index: number; beneficiary: BeneficiaryCodeMatch['beneficiary'] } | null {
  if (!Array.isArray(beneficiaries)) return null;
  for (let index = 0; index < beneficiaries.length; index += 1) {
    const raw = beneficiaries[index];
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const accessCode =
      typeof entry.accessCode === 'string' ? normalizeCode(entry.accessCode) : '';
    if (!accessCode || accessCode !== normalizedCode) continue;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) continue;
    return {
      index,
      beneficiary: {
        name,
        type: entry.type === 'contingent' ? 'contingent' : 'primary',
        relationship:
          typeof entry.relationship === 'string' && entry.relationship.trim()
            ? entry.relationship.trim()
            : undefined,
        percentage:
          typeof entry.percentage === 'number' && Number.isFinite(entry.percentage)
            ? entry.percentage
            : undefined,
        phone:
          typeof entry.phone === 'string' && entry.phone.trim()
            ? entry.phone.trim()
            : undefined,
        email:
          typeof entry.email === 'string' && entry.email.trim()
            ? entry.email.trim()
            : undefined,
        accessCode,
      },
    };
  }
  return null;
}

export async function findBeneficiaryByCode(
  code: string,
): Promise<BeneficiaryCodeMatch | null> {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;
  const db = getAdminFirestore();

  // Fast path: top-level index.
  const indexDoc = await db.collection('beneficiaryCodes').doc(normalizedCode).get();
  if (indexDoc.exists) {
    const data = indexDoc.data() as Record<string, unknown>;
    const agentId = typeof data.agentId === 'string' ? data.agentId : '';
    const clientId = typeof data.clientId === 'string' ? data.clientId : '';
    const policyId = typeof data.policyId === 'string' ? data.policyId : '';
    if (agentId && clientId && policyId) {
      const policyRef = db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .doc(clientId)
        .collection('policies')
        .doc(policyId);
      const policySnap = await policyRef.get();
      if (policySnap.exists) {
        const found = findBeneficiaryIndexByCode(
          (policySnap.data() as Record<string, unknown>).beneficiaries,
          normalizedCode,
        );
        if (found) {
          return {
            agentId,
            clientId,
            policyId,
            beneficiaryIndex: found.index,
            beneficiary: found.beneficiary,
          };
        }
      }
    }
    // stale index entry
    await indexDoc.ref.delete().catch(() => {});
  }

  // Slow path: scan policies.
  const agentsSnap = await db.collection('agents').get();
  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await agentDoc.ref.collection('clients').get();
    for (const clientDoc of clientsSnap.docs) {
      const policiesSnap = await clientDoc.ref.collection('policies').get();
      for (const policyDoc of policiesSnap.docs) {
        const found = findBeneficiaryIndexByCode(
          (policyDoc.data() as Record<string, unknown>).beneficiaries,
          normalizedCode,
        );
        if (!found) continue;
        await db.collection('beneficiaryCodes').doc(normalizedCode).set(
          {
            agentId: agentDoc.id,
            clientId: clientDoc.id,
            policyId: policyDoc.id,
            beneficiaryIndex: found.index,
            beneficiaryName: found.beneficiary.name,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ).catch(() => {});
        return {
          agentId: agentDoc.id,
          clientId: clientDoc.id,
          policyId: policyDoc.id,
          beneficiaryIndex: found.index,
          beneficiary: found.beneficiary,
        };
      }
    }
  }

  return null;
}
