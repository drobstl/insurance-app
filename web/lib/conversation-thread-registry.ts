import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import type {
  AllowedResponder,
  ConversationLane,
  ConversationPurpose,
  ConversationThreadDoc,
  LinkedEntityType,
} from './conversation-routing-types';

interface ThreadUpsertParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  providerThreadId: string;
  providerType: ConversationThreadDoc['providerType'];
  lane: ConversationLane;
  purpose: ConversationPurpose;
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string | null;
  participantPhonesE164?: string[];
  participantPersonIds?: string[];
  primaryPersonId?: string | null;
  lifecycleStatus?: ConversationThreadDoc['lifecycleStatus'];
  allowAutoReply?: boolean;
  allowedResponder?: AllowedResponder;
  confidence?: ConversationThreadDoc['confidence'];
  assignmentSource?: ConversationThreadDoc['assignmentSource'];
}

interface ResolvedThread {
  agentId: string;
  threadId: string;
  thread: ConversationThreadDoc;
  source: 'provider_thread' | 'phone';
}

function normalizePhoneCandidates(phones: string[] | undefined): string[] {
  if (!phones || phones.length === 0) return [];
  const cleaned = phones.map((p) => p.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function defaultResponderForLane(lane: ConversationLane): AllowedResponder {
  if (lane === 'beneficiary') return 'none';
  if (lane === 'referral') return 'referral';
  if (lane === 'conservation') return 'conservation';
  if (lane === 'policy_review') return 'policy_review';
  if (lane === 'manual') return 'manual_only';
  return 'none';
}

function buildThreadDoc(params: ThreadUpsertParams): ConversationThreadDoc {
  const now = new Date().toISOString();
  const phones = normalizePhoneCandidates(params.participantPhonesE164);
  const participantPersonIds = params.participantPersonIds || [];
  return {
    threadId: params.providerThreadId,
    agentId: params.agentId,
    provider: 'linq',
    providerThreadId: params.providerThreadId,
    providerType: params.providerType,
    purpose: params.purpose,
    lane: params.lane,
    linkedEntityType: params.linkedEntityType,
    linkedEntityId: params.linkedEntityId,
    primaryPersonId: params.primaryPersonId ?? null,
    participantPersonIds,
    participantPhonesE164: phones,
    aiPolicy: {
      allowAutoReply: params.allowAutoReply ?? (params.lane !== 'beneficiary'),
      allowedResponder: params.allowedResponder ?? defaultResponderForLane(params.lane),
    },
    lifecycleStatus: params.lifecycleStatus ?? 'active',
    confidence: params.confidence ?? 'high',
    assignmentSource: params.assignmentSource ?? 'outbound_create',
    lastInboundAt: null,
    lastOutboundAt: now,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function upsertThreadFromOutbound(params: ThreadUpsertParams): Promise<void> {
  const threadDoc = buildThreadDoc(params);
  const threadRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('conversationThreads')
    .doc(params.providerThreadId);

  await threadRef.set(
    {
      ...threadDoc,
      updatedAt: threadDoc.updatedAt,
      lastOutboundAt: threadDoc.lastOutboundAt,
      lastMessageAt: threadDoc.lastMessageAt,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const byProviderThreadRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('threadResolvers')
    .doc('byProviderThread')
    .collection('entries')
    .doc(params.providerThreadId);

  await byProviderThreadRef.set(
    {
      provider: 'linq',
      providerThreadId: params.providerThreadId,
      threadId: params.providerThreadId,
      agentId: params.agentId,
      confidence: params.confidence ?? 'high',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  const phones = normalizePhoneCandidates(params.participantPhonesE164);
  for (const phoneE164 of phones) {
    const byPhoneRef = params.db
      .collection('agents')
      .doc(params.agentId)
      .collection('threadResolvers')
      .doc('byPhone')
      .collection('entries')
      .doc(phoneE164);
    await byPhoneRef.set(
      {
        phoneE164,
        latestThreadId: params.providerThreadId,
        threadIdCandidates: FieldValue.arrayUnion(params.providerThreadId),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}

export async function markThreadActivity(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
}): Promise<void> {
  const now = new Date().toISOString();
  const threadRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('conversationThreads')
    .doc(params.threadId);

  await threadRef.set(
    {
      updatedAt: now,
      lastMessageAt: now,
      ...(params.direction === 'inbound' ? { lastInboundAt: now } : { lastOutboundAt: now }),
    },
    { merge: true },
  );
}

async function getThreadByAgentAndId(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  threadId: string;
}): Promise<ConversationThreadDoc | null> {
  const snap = await params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('conversationThreads')
    .doc(params.threadId)
    .get();
  if (!snap.exists) return null;
  return snap.data() as ConversationThreadDoc;
}

async function resolveByProviderThread(params: {
  db: FirebaseFirestore.Firestore;
  providerThreadId: string;
}): Promise<ResolvedThread | null> {
  const resolverSnap = await params.db
    .collectionGroup('entries')
    .where('providerThreadId', '==', params.providerThreadId)
    .limit(1)
    .get();

  if (resolverSnap.empty) return null;
  const doc = resolverSnap.docs[0];
  const data = doc.data() as { agentId?: string; threadId?: string };
  if (!data.agentId || !data.threadId) return null;
  const thread = await getThreadByAgentAndId({
    db: params.db,
    agentId: data.agentId,
    threadId: data.threadId,
  });
  if (!thread) return null;
  return {
    agentId: data.agentId,
    threadId: data.threadId,
    thread,
    source: 'provider_thread',
  };
}

async function resolveByPhone(params: {
  db: FirebaseFirestore.Firestore;
  fromPhoneE164: string;
}): Promise<ResolvedThread | null> {
  const resolverSnap = await params.db
    .collectionGroup('entries')
    .where('phoneE164', '==', params.fromPhoneE164)
    .limit(2)
    .get();

  if (resolverSnap.size !== 1) return null;
  const doc = resolverSnap.docs[0];
  const data = doc.data() as { latestThreadId?: string };
  const segments = doc.ref.path.split('/');
  const agentIndex = segments.indexOf('agents');
  if (agentIndex < 0 || !segments[agentIndex + 1] || !data.latestThreadId) {
    return null;
  }
  const agentId = segments[agentIndex + 1];
  const thread = await getThreadByAgentAndId({
    db: params.db,
    agentId,
    threadId: data.latestThreadId,
  });
  if (!thread) return null;
  return {
    agentId,
    threadId: data.latestThreadId,
    thread,
    source: 'phone',
  };
}

export async function resolveThreadForInbound(params: {
  db: FirebaseFirestore.Firestore;
  providerThreadId: string;
  fromPhoneE164?: string | null;
  strictPhoneFallback: boolean;
}): Promise<ResolvedThread | null> {
  const providerHit = await resolveByProviderThread({
    db: params.db,
    providerThreadId: params.providerThreadId,
  });
  if (providerHit) return providerHit;

  if (params.strictPhoneFallback) return null;
  const phone = params.fromPhoneE164?.trim();
  if (!phone) return null;
  return resolveByPhone({
    db: params.db,
    fromPhoneE164: phone,
  });
}

export async function appendLeadInbox(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  providerThreadId: string | null;
  fromPhoneE164: string | null;
  firstMessageText: string;
}): Promise<{ leadId: string; threadId: string | null }> {
  const now = new Date().toISOString();
  const leadRef = params.db
    .collection('agents')
    .doc(params.agentId)
    .collection('leadInbox')
    .doc();

  await leadRef.set({
    leadId: leadRef.id,
    agentId: params.agentId,
    provider: 'linq',
    providerThreadId: params.providerThreadId,
    fromPhoneE164: params.fromPhoneE164,
    fromDisplayName: null,
    firstMessageText: params.firstMessageText,
    messageCount: 1,
    status: 'new',
    assignedPersonId: null,
    assignedThreadId: params.providerThreadId,
    createdAt: now,
    updatedAt: now,
  });

  if (!params.providerThreadId) {
    return { leadId: leadRef.id, threadId: null };
  }

  await upsertThreadFromOutbound({
    db: params.db,
    agentId: params.agentId,
    providerThreadId: params.providerThreadId,
    providerType: 'sms_direct',
    lane: 'lead',
    purpose: 'lead_unassigned',
    linkedEntityType: 'lead',
    linkedEntityId: leadRef.id,
    participantPhonesE164: params.fromPhoneE164 ? [params.fromPhoneE164] : [],
    allowAutoReply: false,
    allowedResponder: 'none',
    confidence: 'low',
    assignmentSource: 'inbound_match',
  });

  return { leadId: leadRef.id, threadId: params.providerThreadId };
}
