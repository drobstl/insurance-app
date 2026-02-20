import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';
import { extractConservationData, generateOutreachMessage, assessSaveability } from './conservation-ai';
import type {
  ConservationSource,
  ConservationAlert,
  ConservationOutreachContext,
} from './conservation-types';

const GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours

interface MatchResult {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientHasApp: boolean;
  policyId: string;
  policyAge: number | null;
  isChargebackRisk: boolean;
  premiumAmount: number | null;
  policyType: string | null;
  coverageAmount: number | null;
  clientPolicyCount: number;
}

/**
 * Search the agent's clients and policies for a match by name and/or policy number.
 */
async function findMatch(
  agentId: string,
  clientName: string,
  policyNumber: string,
): Promise<MatchResult | null> {
  const db = getAdminFirestore();
  const clientsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .get();

  const normalizedName = clientName.toLowerCase().trim();
  const normalizedPolicyNum = policyNumber.toLowerCase().trim();

  for (const clientDoc of clientsSnap.docs) {
    const clientData = clientDoc.data();
    const name = ((clientData.name as string) || '').toLowerCase().trim();

    const nameMatch =
      normalizedName !== 'unknown' &&
      (name === normalizedName ||
        name.includes(normalizedName) ||
        normalizedName.includes(name));

    const policiesSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientDoc.id)
      .collection('policies')
      .get();

    for (const policyDoc of policiesSnap.docs) {
      const policyData = policyDoc.data();
      const polNum = ((policyData.policyNumber as string) || '').toLowerCase().trim();
      const policyNumMatch =
        normalizedPolicyNum !== 'unknown' &&
        polNum !== '' &&
        (polNum === normalizedPolicyNum || polNum.includes(normalizedPolicyNum));

      if (nameMatch || policyNumMatch) {
        const createdAt = policyData.createdAt;
        let policyAge: number | null = null;
        if (createdAt && createdAt.toDate) {
          const created: Date = createdAt.toDate();
          policyAge = Math.floor(
            (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        return {
          clientId: clientDoc.id,
          clientName: (clientData.name as string) || clientName,
          clientPhone: (clientData.phone as string) || null,
          clientHasApp: !!(clientData.pushToken as string),
          policyId: policyDoc.id,
          policyAge,
          isChargebackRisk: policyAge !== null && policyAge < 365,
          premiumAmount: (policyData.premiumAmount as number) || null,
          policyType: (policyData.policyType as string) || null,
          coverageAmount: (policyData.coverageAmount as number) || null,
          clientPolicyCount: policiesSnap.size,
        };
      }
    }

    // If name matched but no policy number match, check if there's only one policy
    if (nameMatch && policiesSnap.size > 0) {
      const policyDoc = policiesSnap.docs[0];
      const policyData = policyDoc.data();
      const createdAt = policyData.createdAt;
      let policyAge: number | null = null;
      if (createdAt && createdAt.toDate) {
        const created: Date = createdAt.toDate();
        policyAge = Math.floor(
          (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      return {
        clientId: clientDoc.id,
        clientName: (clientData.name as string) || clientName,
        clientPhone: (clientData.phone as string) || null,
        clientHasApp: !!(clientData.pushToken as string),
        policyId: policyDoc.id,
        policyAge,
        isChargebackRisk: policyAge !== null && policyAge < 365,
        premiumAmount: (policyData.premiumAmount as number) || null,
        policyType: (policyData.policyType as string) || null,
        coverageAmount: (policyData.coverageAmount as number) || null,
        clientPolicyCount: policiesSnap.size,
      };
    }
  }

  return null;
}

export interface CreateConservationAlertResult {
  alertId: string;
  alert: Omit<ConservationAlert, 'createdAt'> & { createdAt?: unknown };
  matched: boolean;
}

/**
 * Shared logic for creating a conservation alert from raw text.
 * Used by both the paste endpoint and the email forwarding webhook.
 */
export async function createConservationAlert(
  agentId: string,
  rawText: string,
  source: ConservationSource,
): Promise<CreateConservationAlertResult> {
  const db = getAdminFirestore();

  // 1. AI extraction
  const extracted = await extractConservationData(rawText);

  // 2. Auto-match to client + policy
  const match = await findMatch(agentId, extracted.clientName, extracted.policyNumber);

  // 3. Get agent info for message generation
  const agentDoc = await db.collection('agents').doc(agentId).get();
  const agentData = agentDoc.data() || {};
  const agentName = (agentData.name as string) || 'Your Agent';
  const agentFirstName = agentName.split(' ')[0];
  const schedulingUrl = (agentData.schedulingUrl as string) || null;

  const priority = match?.isChargebackRisk ? 'high' : 'low';
  const clientFirstName = (match?.clientName || extracted.clientName).split(' ')[0];

  // 4. Generate AI outreach message
  const outreachCtx: ConservationOutreachContext = {
    clientFirstName,
    clientName: match?.clientName || extracted.clientName,
    agentName,
    agentFirstName,
    policyType: match?.policyType || null,
    policyAge: match?.policyAge ?? null,
    reason: extracted.reason,
    schedulingUrl,
    dripNumber: 0,
    premiumAmount: match?.premiumAmount ?? null,
    coverageAmount: match?.coverageAmount ?? null,
  };

  const initialMessage = await generateOutreachMessage(outreachCtx);

  // 5. Assess saveability
  const aiInsight = match
    ? await assessSaveability({
        clientName: match.clientName,
        policyAge: match.policyAge,
        clientHasApp: match.clientHasApp,
        clientPolicyCount: match.clientPolicyCount,
        reason: extracted.reason,
        premiumAmount: match.premiumAmount,
      })
    : null;

  // 6. Schedule auto-outreach for high-priority alerts
  const now = new Date();
  const isHighPriority = priority === 'high' && match !== null;
  const scheduledOutreachAt = isHighPriority
    ? new Date(now.getTime() + GRACE_PERIOD_MS).toISOString()
    : null;

  const alertData = {
    source,
    rawText,
    clientName: match?.clientName || extracted.clientName,
    policyNumber: extracted.policyNumber,
    carrier: extracted.carrier,
    reason: extracted.reason,
    clientId: match?.clientId || null,
    policyId: match?.policyId || null,
    policyAge: match?.policyAge ?? null,
    isChargebackRisk: match?.isChargebackRisk || false,
    priority,
    premiumAmount: match?.premiumAmount ?? null,
    policyType: match?.policyType || null,
    clientHasApp: match?.clientHasApp || false,
    clientPolicyCount: match?.clientPolicyCount ?? null,
    status: isHighPriority ? ('outreach_scheduled' as const) : ('new' as const),
    scheduledOutreachAt,
    outreachSentAt: null,
    pushSentAt: null,
    smsSentAt: null,
    lastDripAt: null,
    dripCount: 0,
    initialMessage,
    dripMessages: [] as string[],
    aiInsight,
    notes: null,
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
  };

  // 7. Write to Firestore
  const alertRef = await db
    .collection('agents')
    .doc(agentId)
    .collection('conservationAlerts')
    .add(alertData);

  // 8. If matched, mark the policy as Lapsed
  if (match) {
    const policyRef = db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(match.clientId)
      .collection('policies')
      .doc(match.policyId);

    const policyDoc = await policyRef.get();
    if (policyDoc.exists && policyDoc.data()?.status === 'Active') {
      await policyRef.update({ status: 'Lapsed' });
    }
  }

  return {
    alertId: alertRef.id,
    alert: { ...alertData, id: alertRef.id } as Omit<ConservationAlert, 'createdAt'> & {
      createdAt?: unknown;
    },
    matched: match !== null,
  };
}
