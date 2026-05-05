import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';
import { extractConservationData, generateOutreachMessage, assessSaveability } from './conservation-ai';
import { normalizePhone, isValidE164 } from './phone';
import { getCarrierServicePhone } from './carriers';
import { resolveClientLanguage } from './client-language';
import { isPushEligible } from './push-permission-lifecycle';
import type {
  ConservationSource,
  ConservationAlert,
  ConservationOutreachContext,
  ConservationChannel,
  ConservationReason,
  TouchStage,
} from './conservation-types';
import { TOUCH_STAGE_DELAY } from './conservation-types';

const GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours

function computeNextTouchAt(fromMs: number, nextStage: TouchStage): string {
  return new Date(fromMs + TOUCH_STAGE_DELAY[nextStage]).toISOString();
}

/**
 * Compute policy age in days. Prefers effectiveDate (YYYY-MM-DD string) over
 * createdAt (Firestore Timestamp) so that imported / backdated policies report
 * the correct age.
 */
function computePolicyAge(
  policyData: FirebaseFirestore.DocumentData,
): number | null {
  const effectiveDate = policyData.effectiveDate as string | undefined;
  if (effectiveDate) {
    const parsed = new Date(effectiveDate + 'T00:00:00');
    if (!isNaN(parsed.getTime())) {
      return Math.floor(
        (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24),
      );
    }
  }

  const createdAt = policyData.createdAt;
  if (createdAt && createdAt.toDate) {
    const created: Date = createdAt.toDate();
    return Math.floor(
      (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return null;
}

interface MatchResult {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  clientHasApp: boolean;
  policyId: string;
  policyAge: number | null;
  isChargebackRisk: boolean;
  premiumAmount: number | null;
  policyType: string | null;
  coverageAmount: number | null;
  clientPolicyCount: number;
  preferredLanguage: 'en' | 'es';
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
        const policyAge = computePolicyAge(policyData);

        return {
          clientId: clientDoc.id,
          clientName: (clientData.name as string) || clientName,
          clientPhone: (clientData.phone as string) || null,
          clientEmail: (clientData.email as string) || null,
          // `clientHasApp` reflects current push eligibility (token present
          // AND not revoked) per strategy decisions §4.
          clientHasApp: isPushEligible(clientData),
          policyId: policyDoc.id,
          policyAge,
          isChargebackRisk: policyAge !== null && policyAge < 365,
          premiumAmount: (policyData.premiumAmount as number) || null,
          policyType: (policyData.policyType as string) || null,
          coverageAmount: (policyData.coverageAmount as number) || null,
          clientPolicyCount: policiesSnap.size,
          preferredLanguage: resolveClientLanguage(clientData.preferredLanguage),
        };
      }
    }

    // If name matched but no policy number match, check if there's only one policy
    if (nameMatch && policiesSnap.size > 0) {
      const policyDoc = policiesSnap.docs[0];
      const policyData = policyDoc.data();
      const policyAge = computePolicyAge(policyData);

      return {
        clientId: clientDoc.id,
        clientName: (clientData.name as string) || clientName,
        clientPhone: (clientData.phone as string) || null,
        clientEmail: (clientData.email as string) || null,
        clientHasApp: isPushEligible(clientData),
        policyId: policyDoc.id,
        policyAge,
        isChargebackRisk: policyAge !== null && policyAge < 365,
        premiumAmount: (policyData.premiumAmount as number) || null,
        policyType: (policyData.policyType as string) || null,
        coverageAmount: (policyData.coverageAmount as number) || null,
        clientPolicyCount: policiesSnap.size,
        preferredLanguage: resolveClientLanguage(clientData.preferredLanguage),
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

export interface ManualFlagParams {
  clientId: string;
  policyId: string;
  reason: ConservationReason;
}

/**
 * Create a conservation alert from a manual "flag at risk" action.
 * The client and policy are already known — no AI extraction needed.
 */
export async function createManualConservationAlert(
  agentId: string,
  params: ManualFlagParams,
): Promise<CreateConservationAlertResult> {
  const db = getAdminFirestore();

  const clientDoc = await db
    .collection('agents').doc(agentId)
    .collection('clients').doc(params.clientId)
    .get();
  if (!clientDoc.exists) throw new Error('Client not found');
  const clientData = clientDoc.data()!;

  const policyDoc = await db
    .collection('agents').doc(agentId)
    .collection('clients').doc(params.clientId)
    .collection('policies').doc(params.policyId)
    .get();
  if (!policyDoc.exists) throw new Error('Policy not found');
  const policyData = policyDoc.data()!;

  const policiesSnap = await db
    .collection('agents').doc(agentId)
    .collection('clients').doc(params.clientId)
    .collection('policies').get();

  const policyAge = computePolicyAge(policyData);
  const isChargebackRisk = policyAge !== null && policyAge < 365;
  const priority = isChargebackRisk ? 'high' : 'low';

  const clientName = (clientData.name as string) || 'Client';
  const clientFirstName = clientName.split(' ')[0];
  const clientPhone = (clientData.phone as string) || null;
  const clientEmail = (clientData.email as string) || null;
  const clientHasApp = isPushEligible(clientData);
  const carrier = (policyData.insuranceCompany as string) || '';
  const policyType = (policyData.policyType as string) || null;
  const premiumAmount = (policyData.premiumAmount as number) || null;
  const coverageAmount = (policyData.coverageAmount as number) || null;
  const policyNumber = (policyData.policyNumber as string) || '';

  const agentDoc = await db.collection('agents').doc(agentId).get();
  const agentData = agentDoc.data() || {};
  const agentName = (agentData.name as string) || 'Your Agent';
  const agentFirstName = agentName.split(' ')[0];
  const schedulingUrl = (agentData.schedulingUrl as string) || null;

  const availableChannels: ConservationChannel[] = [];
  if (clientPhone && isValidE164(normalizePhone(clientPhone))) {
    availableChannels.push('sms');
  }
  if (clientHasApp) availableChannels.push('push');
  if (clientEmail) availableChannels.push('email');
  const noContactMethod = availableChannels.length === 0;

  const carrierServicePhone = getCarrierServicePhone(carrier);

  const outreachCtx: ConservationOutreachContext = {
    clientFirstName,
    clientName,
    agentName,
    agentFirstName,
    policyType,
    policyAge,
    reason: params.reason,
    schedulingUrl,
    dripNumber: 0,
    premiumAmount,
    coverageAmount,
    availableChannels,
    carrier: carrier || null,
    carrierServicePhone,
    preferredLanguage: resolveClientLanguage(clientData.preferredLanguage),
  };

  const initialMessage = await generateOutreachMessage(outreachCtx);

  const aiInsight = await assessSaveability({
    clientName,
    policyAge,
    clientHasApp,
    clientPolicyCount: policiesSnap.size,
    reason: params.reason,
    premiumAmount,
  });

  const now = new Date();
  const isHighPriority = priority === 'high';
  const scheduledOutreachAt = isHighPriority
    ? new Date(now.getTime() + GRACE_PERIOD_MS).toISOString()
    : null;

  const alertData = {
    source: 'manual_flag' as const,
    rawText: `Manually flagged: ${params.reason === 'lapsed_payment' ? 'Missed Payment' : 'Cancellation'}`,
    clientName,
    policyNumber,
    carrier,
    reason: params.reason,
    clientId: params.clientId,
    policyId: params.policyId,
    policyAge,
    isChargebackRisk,
    priority,
    premiumAmount,
    policyType,
    clientHasApp,
    clientPolicyCount: policiesSnap.size,
    status: isHighPriority ? ('outreach_scheduled' as const) : ('new' as const),
    scheduledOutreachAt,
    outreachSentAt: null,
    pushSentAt: null,
    smsSentAt: null,
    lastDripAt: null,
    dripCount: 0,
    initialMessage,
    dripMessages: [] as string[],
    conversation: [] as Array<{
      role: 'client' | 'agent-ai' | 'agent-manual';
      body: string;
      timestamp: string;
      channels?: ConservationChannel[];
    }>,
    chatId: null as string | null,
    aiEnabled: true,
    availableChannels,
    noContactMethod,
    saveSuggested: false,
    aiInsight,
    touchStage: null as TouchStage | null,
    nextTouchAt: isHighPriority
      ? scheduledOutreachAt
      : null,
    channelsUsed: [] as ConservationChannel[],
    lastClientReplyAt: null as string | null,
    preferredLanguage: resolveClientLanguage(clientData.preferredLanguage),
    notes: null,
    createdAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
  };

  const alertRef = await db
    .collection('agents').doc(agentId)
    .collection('conservationAlerts')
    .add(alertData);

  if (policyData.status === 'Active') {
    await policyDoc.ref.update({ status: 'Lapsed' });
  }

  return {
    alertId: alertRef.id,
    alert: { ...alertData, id: alertRef.id } as Omit<ConservationAlert, 'createdAt'> & {
      createdAt?: unknown;
    },
    matched: true,
  };
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

  // 4. Determine available contact channels
  const availableChannels: ConservationChannel[] = [];
  if (match) {
    if (match.clientPhone && isValidE164(normalizePhone(match.clientPhone))) {
      availableChannels.push('sms');
    }
    if (match.clientHasApp) {
      availableChannels.push('push');
    }
    if (match.clientEmail) {
      availableChannels.push('email');
    }
  }
  const noContactMethod = match !== null && availableChannels.length === 0;

  // 5. Generate AI outreach message
  const carrierName = extracted.carrier;
  const carrierServicePhone = getCarrierServicePhone(carrierName);

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
    availableChannels,
    carrier: carrierName,
    carrierServicePhone,
    preferredLanguage: match?.preferredLanguage || 'en',
  };

  const initialMessage = await generateOutreachMessage(outreachCtx);

  // 6. Assess saveability
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

  // 7. Schedule auto-outreach for high-priority alerts
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
    conversation: [] as Array<{
      role: 'client' | 'agent-ai' | 'agent-manual';
      body: string;
      timestamp: string;
      channels?: ConservationChannel[];
    }>,
    chatId: null as string | null,
    aiEnabled: true,
    availableChannels,
    noContactMethod,
    saveSuggested: false,
    aiInsight,
    touchStage: null as TouchStage | null,
    nextTouchAt: isHighPriority
      ? scheduledOutreachAt
      : null,
    channelsUsed: [] as ConservationChannel[],
    lastClientReplyAt: null as string | null,
    preferredLanguage: match?.preferredLanguage || 'en',
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
