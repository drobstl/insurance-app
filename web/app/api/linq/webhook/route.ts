import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  verifyWebhookSignature,
  extractTextFromParts,
  sendOrCreateChat,
  startTypingIndicator,
  stopTypingIndicator,
  type LinqWebhookEnvelope,
  type LinqWebhookMessageData,
} from '../../../../lib/linq';
import {
  generateReferralResponse,
  extractReferralInfo,
  detectReferralBookingSignal,
  type ConversationMessage,
  type ReferralContext,
} from '../../../../lib/referral-ai';
import {
  generateConservationResponse,
  detectSaveSignal,
} from '../../../../lib/conservation-ai';
import type {
  ConservationConversationContext,
  ConservationMessage as ConservationMsg,
} from '../../../../lib/conservation-types';
import {
  generateReviewResponse,
  detectBookingSignal,
  extractReviewInfo,
  type PolicyReviewMessage,
  type PolicyReviewConversationContext,
} from '../../../../lib/policy-review-ai';
import { normalizePhone } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveClientLanguage } from '../../../../lib/client-language';

/**
 * POST /api/linq/webhook
 *
 * Core Linq webhook handler. Receives message.received events and routes:
 *   - Group messages → referral creation + trigger group-response flow
 *   - 1-on-1 messages → feed into NEPQ conversation engine
 *
 * Webhook signature is verified via HMAC-SHA256.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get('X-Webhook-Timestamp') || '';
    const signature = req.headers.get('X-Webhook-Signature') || '';

    if (!verifyWebhookSignature(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const envelope: LinqWebhookEnvelope = JSON.parse(rawBody);

    if (envelope.event_type !== 'message.received') {
      return NextResponse.json({ ok: true });
    }

    const data = envelope.data;

    if (data.direction !== 'inbound') {
      return NextResponse.json({ ok: true });
    }

    if (data.chat.is_group === true) {
      await handleGroupMessage(data);
    } else {
      await handleDirectMessage(data);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Linq Webhook] Error:', error);
    return NextResponse.json({ ok: true });
  }
}

// ---------------------------------------------------------------------------
// Group message handler — new referral creation + AI intro trigger
// ---------------------------------------------------------------------------

async function handleGroupMessage(data: LinqWebhookMessageData) {
  const chatId = data.chat.id;
  const senderHandle = normalizePhone(data.sender_handle.handle);

  const db = getAdminFirestore();

  // Check if we already have a referral linked to this group chat
  const existingSnap = await db
    .collectionGroup('referrals')
    .where('groupChatId', '==', chatId)
    .limit(1)
    .get();

  if (!existingSnap.empty) return;

  // --- Primary path: find pending referral across ALL agents by clientPhone ---
  // The mobile app calls /api/referral/notify (with clientPhone) before the
  // group text is sent, so there should be a pending referral we can match.
  let agentId: string | null = null;
  let agentData: Record<string, unknown> = {};
  let aiEnabled = true;
  let clientName = 'A client';
  let clientId: string | null = null;
  let matchedRef: FirebaseFirestore.DocumentReference | null = null;
  let preferredLanguage = resolveClientLanguage('en');

  const pendingSnap = await db
    .collectionGroup('referrals')
    .where('status', '==', 'pending')
    .where('groupChatId', '==', null)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  for (const doc of pendingSnap.docs) {
    const d = doc.data();
    if (d.clientPhone === senderHandle) {
      matchedRef = doc.ref;
      agentId = doc.ref.parent.parent!.id;
      clientName = (d.clientName as string) || 'A client';
      clientId = (d.clientId as string) || null;
      preferredLanguage = resolveClientLanguage(d.preferredLanguage);
      break;
    }
  }

  // If clientPhone didn't match, try matching by clientId via client phone lookup
  if (!matchedRef) {
    for (const doc of pendingSnap.docs) {
      const d = doc.data();
      if (!d.clientId) continue;
      const candidateAgentId = doc.ref.parent.parent!.id;
      const clientSnap = await db
        .collection('agents')
        .doc(candidateAgentId)
        .collection('clients')
        .doc(d.clientId as string)
        .get();
      if (clientSnap.exists) {
        const clientData = clientSnap.data();
        if (clientData && normalizePhone(clientData.phone as string) === senderHandle) {
          matchedRef = doc.ref;
          agentId = candidateAgentId;
          clientName = (d.clientName as string) || 'A client';
          clientId = d.clientId as string;
          preferredLanguage = resolveClientLanguage(clientData.preferredLanguage);
          break;
        }
      }
    }
  }

  if (agentId && matchedRef) {
    // Matched via pending referral — load the agent
    const agentDoc = await db.collection('agents').doc(agentId).get();
    agentData = (agentDoc.data() as Record<string, unknown>) || {};
    aiEnabled = (agentData.aiAssistantEnabled as boolean) !== false;

    await matchedRef.update({
      groupChatId: chatId,
      updatedAt: FieldValue.serverTimestamp(),
      preferredLanguage,
    });
  } else {
    // --- Fallback: find agent by linqPhoneNumber (e.g. organic text to the number) ---
    const ownerHandle = data.chat.owner_handle?.handle;
    if (!ownerHandle) return;

    const linqPhone = normalizePhone(ownerHandle);
    const agentsSnap = await db
      .collection('agents')
      .where('linqPhoneNumber', '==', linqPhone)
      .limit(1)
      .get();

    if (agentsSnap.empty) return;

    const agentDoc = agentsSnap.docs[0];
    agentId = agentDoc.id;
    agentData = agentDoc.data();
    aiEnabled = (agentData.aiAssistantEnabled as boolean) !== false;

    const clientSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .where('phone', '==', senderHandle)
      .limit(1)
      .get();

    clientName = clientSnap.empty
      ? 'A client'
      : (clientSnap.docs[0].data().name as string) || 'A client';
    clientId = clientSnap.empty ? null : clientSnap.docs[0].id;
    if (!clientSnap.empty) {
      preferredLanguage = resolveClientLanguage(clientSnap.docs[0].data().preferredLanguage);
    }

    // Try to match a pending referral under this specific agent
    const agentPendingSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .where('status', '==', 'pending')
      .where('groupChatId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    for (const doc of agentPendingSnap.docs) {
      const d = doc.data();
      if (clientId && d.clientId === clientId) {
        matchedRef = doc.ref;
        break;
      }
    }
    if (!matchedRef && !agentPendingSnap.empty) {
      matchedRef = agentPendingSnap.docs[0].ref;
    }

    if (matchedRef) {
      await matchedRef.update({
        groupChatId: chatId,
        updatedAt: FieldValue.serverTimestamp(),
        preferredLanguage,
      });
    } else {
      const refData = {
        referralName: 'Friend',
        referralPhone: '',
        clientName,
        clientId,
        clientPhone: senderHandle,
        status: 'pending',
        conversation: [],
        gatheredInfo: {},
        appointmentBooked: false,
        aiEnabled,
        dripCount: 0,
        lastDripAt: null,
        groupChatId: chatId,
        directChatId: null,
        preferredLanguage,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      matchedRef = await db
        .collection('agents')
        .doc(agentId)
        .collection('referrals')
        .add(refData);
    }
  }

  if (!aiEnabled || !matchedRef || !agentId) return;

  const text = extractTextFromParts(data.parts);

  if (text) {
    const msg: ConversationMessage = {
      role: 'referral',
      body: `[Group - ${clientName}]: ${text}`,
      timestamp: new Date().toISOString(),
    };
    await matchedRef.update({
      conversation: FieldValue.arrayUnion(msg),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentforlife.app';
  fetch(`${appUrl}/api/referral/group-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      referralId: matchedRef.id ?? (matchedRef as FirebaseFirestore.DocumentReference).id,
      groupChatId: chatId,
    }),
  }).catch((err) => {
    console.error('Failed to trigger group-response endpoint:', err);
  });
}

// ---------------------------------------------------------------------------
// Direct (1-on-1) message handler — NEPQ conversation engine
// ---------------------------------------------------------------------------

async function handleDirectMessage(data: LinqWebhookMessageData) {
  const chatId = data.chat.id;
  const senderHandle = normalizePhone(data.sender_handle.handle);
  const text = extractTextFromParts(data.parts);

  if (!text) return;

  const db = getAdminFirestore();

  // Find the referral by directChatId first, then by phone
  let referralResult = await findReferralByChatId(db, chatId);
  if (!referralResult) {
    referralResult = await findReferralByPhone(db, senderHandle);
  }

  if (!referralResult) {
    // No referral match -- try policy reviews, then conservation alerts
    const policyReviewResult = await findPolicyReviewByChatId(db, chatId);
    if (policyReviewResult) {
      await handlePolicyReviewReply(policyReviewResult, text, chatId, senderHandle);
      return;
    }

    let conservationResult = await findConservationAlertByChatId(db, chatId);
    if (!conservationResult) {
      conservationResult = await findConservationAlertByPhone(db, senderHandle);
    }
    if (conservationResult) {
      await handleConservationReply(conservationResult, text, chatId, senderHandle);
    }
    return;
  }

  const { agentId, referralId, referralData, agentData, referralRef } = referralResult;

  // Persist the incoming message immediately
  const newIncoming: ConversationMessage = {
    role: 'referral',
    body: text,
    timestamp: new Date().toISOString(),
  };

  const incomingUpdate: Record<string, unknown> = {
    conversation: FieldValue.arrayUnion(newIncoming),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (
    ['pending', 'outreach-sent', 'drip-1', 'drip-2'].includes(
      referralData.status as string,
    )
  ) {
    incomingUpdate.status = 'active';
  }

  if (!referralData.directChatId) {
    incomingUpdate.directChatId = chatId;
  }

  await referralRef.update(incomingUpdate);

  if (referralData.aiEnabled === false) return;

  const conversation: ConversationMessage[] =
    (referralData.conversation as ConversationMessage[]) || [];
  const agentName = (agentData.name as string) || 'Your agent';
  const agentFirstName = agentName.split(' ')[0];
  const schedulingUrl = (agentData.schedulingUrl as string) || null;

  const clientName = (referralData.clientName as string) || 'A friend';
  const ctx: ReferralContext = {
    agentName,
    agentFirstName,
    clientName,
    clientFirstName: clientName.split(' ')[0],
    referralName: (referralData.referralName as string) || 'Friend',
    schedulingUrl,
    agentPhone: (agentData.phoneNumber as string) || null,
    conversation,
    preferredLanguage: resolveClientLanguage(referralData.preferredLanguage),
  };

  // Show typing indicator while generating AI response
  try {
    await startTypingIndicator(chatId);
  } catch {
    // non-critical
  }

  let aiResponse: string | null = null;
  try {
    aiResponse = await generateReferralResponse(ctx, text);
  } catch (aiError) {
    console.error('AI generation failed for referral', referralId, aiError);
    try { await stopTypingIndicator(chatId); } catch { /* ignore */ }
    return;
  }

  try {
    await stopTypingIndicator(chatId);
  } catch {
    // non-critical
  }

  if (aiResponse) {
    const directChatId = (referralData.directChatId as string) || chatId;

    const newOutgoing: ConversationMessage = {
      role: 'agent-ai',
      body: aiResponse,
      timestamp: new Date().toISOString(),
    };

    const aiUpdate: Record<string, unknown> = {
      conversation: FieldValue.arrayUnion(newOutgoing),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (schedulingUrl && aiResponse.includes(schedulingUrl)) {
      aiUpdate.status = 'booking-sent';
    }

    await sendOrCreateChat({
      to: senderHandle,
      chatId: directChatId,
      text: aiResponse,
    });

    if (!referralData.directChatId) {
      aiUpdate.directChatId = directChatId;
    }

    await referralRef.update(aiUpdate);
  }

  // Non-blocking: extract qualifying info and detect booking signal
  const conversationWithIncoming: ConversationMessage[] = [...conversation, newIncoming];
  try {
    const [gatheredInfo, bookingResult] = await Promise.all([
      extractReferralInfo(conversationWithIncoming),
      detectReferralBookingSignal(conversationWithIncoming),
    ]);

    const postUpdate: Record<string, unknown> = {};

    if (Object.keys(gatheredInfo).length > 0) {
      postUpdate.gatheredInfo = gatheredInfo;
    }
    if (bookingResult.booked && (bookingResult.confidence === 'high' || bookingResult.confidence === 'medium')) {
      postUpdate.status = 'booked';
      postUpdate.appointmentBooked = true;
    }

    if (Object.keys(postUpdate).length > 0) {
      postUpdate.updatedAt = FieldValue.serverTimestamp();
      await referralRef.update(postUpdate);
    }
  } catch (e) {
    console.error('Referral info extraction / booking detection failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findReferralByChatId(
  db: FirebaseFirestore.Firestore,
  chatId: string,
) {
  const snap = await db
    .collectionGroup('referrals')
    .where('directChatId', '==', chatId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const agentId = doc.ref.parent.parent!.id;
  const agentDoc = await db.collection('agents').doc(agentId).get();

  return {
    agentId,
    referralId: doc.id,
    referralData: doc.data() as Record<string, unknown>,
    agentData: (agentDoc.data() as Record<string, unknown>) || {},
    referralRef: doc.ref,
  };
}

async function findReferralByPhone(
  db: FirebaseFirestore.Firestore,
  phone: string,
) {
  const snap = await db
    .collectionGroup('referrals')
    .where('referralPhone', '==', phone)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const agentId = doc.ref.parent.parent!.id;
  const agentDoc = await db.collection('agents').doc(agentId).get();

  return {
    agentId,
    referralId: doc.id,
    referralData: doc.data() as Record<string, unknown>,
    agentData: (agentDoc.data() as Record<string, unknown>) || {},
    referralRef: doc.ref,
  };
}

// ---------------------------------------------------------------------------
// Conservation alert lookup + reply handling
// ---------------------------------------------------------------------------

interface ConservationAlertResult {
  agentId: string;
  alertId: string;
  alertData: Record<string, unknown>;
  agentData: Record<string, unknown>;
  alertRef: FirebaseFirestore.DocumentReference;
}

async function findConservationAlertByChatId(
  db: FirebaseFirestore.Firestore,
  chatId: string,
): Promise<ConservationAlertResult | null> {
  const snap = await db
    .collectionGroup('conservationAlerts')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const agentId = doc.ref.parent.parent!.id;
  const agentDoc = await db.collection('agents').doc(agentId).get();

  return {
    agentId,
    alertId: doc.id,
    alertData: doc.data() as Record<string, unknown>,
    agentData: (agentDoc.data() as Record<string, unknown>) || {},
    alertRef: doc.ref,
  };
}

async function findConservationAlertByPhone(
  db: FirebaseFirestore.Firestore,
  phone: string,
): Promise<ConservationAlertResult | null> {
  const agentsSnap = await db.collection('agents').get();

  for (const agentDoc of agentsSnap.docs) {
    const clientsSnap = await db
      .collection('agents')
      .doc(agentDoc.id)
      .collection('clients')
      .where('phone', '==', phone)
      .limit(1)
      .get();

    if (clientsSnap.empty) continue;

    const clientDoc = clientsSnap.docs[0];
    const alertsSnap = await db
      .collection('agents')
      .doc(agentDoc.id)
      .collection('conservationAlerts')
      .where('clientId', '==', clientDoc.id)
      .where('status', 'in', ['outreach_sent', 'drip_1', 'drip_2', 'drip_3'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (alertsSnap.empty) continue;

    const doc = alertsSnap.docs[0];
    const agentData = agentDoc.data();
    return {
      agentId: agentDoc.id,
      alertId: doc.id,
      alertData: doc.data() as Record<string, unknown>,
      agentData: (agentData as Record<string, unknown>) || {},
      alertRef: doc.ref,
    };
  }

  return null;
}

async function handleConservationReply(
  result: ConservationAlertResult,
  text: string,
  chatId: string,
  senderHandle: string,
) {
  const { agentId, alertId, alertData, agentData, alertRef } = result;

  const resolvedStatuses = ['saved', 'lost'];
  if (resolvedStatuses.includes(alertData.status as string)) return;

  const newIncoming: ConservationMsg = {
    role: 'client',
    body: text,
    timestamp: new Date().toISOString(),
  };

  const replyUpdate: Record<string, unknown> = {
    conversation: FieldValue.arrayUnion(newIncoming),
    lastClientReplyAt: new Date().toISOString(),
    nextTouchAt: null,
  };
  if (!alertData.chatId && chatId) {
    replyUpdate.chatId = chatId;
  }
  await alertRef.update(replyUpdate);

  if (alertData.aiEnabled === false) return;

  const conversation = (alertData.conversation as ConservationMsg[]) || [];
  const conversationWithIncoming = [...conversation, newIncoming];

  const agentName = (agentData.name as string) || 'Your agent';
  const agentFirstName = agentName.split(' ')[0];
  const schedulingUrl = (agentData.schedulingUrl as string) || null;
  const clientName = (alertData.clientName as string) || 'Client';

  const ctx: ConservationConversationContext = {
    clientFirstName: clientName.split(' ')[0],
    clientName,
    agentName,
    agentFirstName,
    policyType: (alertData.policyType as string) || null,
    policyAge: (alertData.policyAge as number) || null,
    reason: (alertData.reason as 'lapsed_payment' | 'cancellation' | 'other') || 'other',
    schedulingUrl,
    premiumAmount: (alertData.premiumAmount as number) || null,
    coverageAmount: (alertData.coverageAmount as number) || null,
    conversation,
    preferredLanguage: resolveClientLanguage(alertData.preferredLanguage),
  };

  try {
    await startTypingIndicator(chatId);
  } catch { /* non-critical */ }

  let aiResponse: string | null = null;
  try {
    aiResponse = await generateConservationResponse(ctx, text);
  } catch (e) {
    console.error('Conservation AI response failed for alert', alertId, e);
    try { await stopTypingIndicator(chatId); } catch { /* ignore */ }
    return;
  }

  try {
    await stopTypingIndicator(chatId);
  } catch { /* non-critical */ }

  if (aiResponse) {
    const newOutgoing: ConservationMsg = {
      role: 'agent-ai',
      body: aiResponse,
      timestamp: new Date().toISOString(),
      channels: ['sms'],
    };

    await sendOrCreateChat({
      to: senderHandle,
      chatId,
      text: aiResponse,
    });

    await alertRef.update({
      conversation: FieldValue.arrayUnion(newOutgoing),
    });
  }

  // Check if the conversation indicates the policy was saved
  try {
    const saveResult = await detectSaveSignal(conversationWithIncoming);
    if (saveResult.saved && (saveResult.confidence === 'high' || saveResult.confidence === 'medium')) {
      await alertRef.update({ saveSuggested: true });
    }
  } catch (e) {
    console.error('Save signal detection failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Policy review lookup + reply handling
// ---------------------------------------------------------------------------

interface PolicyReviewResult {
  agentId: string;
  reviewId: string;
  reviewData: Record<string, unknown>;
  agentData: Record<string, unknown>;
  reviewRef: FirebaseFirestore.DocumentReference;
}

async function findPolicyReviewByChatId(
  db: FirebaseFirestore.Firestore,
  chatId: string,
): Promise<PolicyReviewResult | null> {
  const snap = await db
    .collectionGroup('policyReviews')
    .where('chatId', '==', chatId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const agentId = doc.ref.parent.parent!.id;
  const agentDoc = await db.collection('agents').doc(agentId).get();

  return {
    agentId,
    reviewId: doc.id,
    reviewData: doc.data() as Record<string, unknown>,
    agentData: (agentDoc.data() as Record<string, unknown>) || {},
    reviewRef: doc.ref,
  };
}

async function handlePolicyReviewReply(
  result: PolicyReviewResult,
  text: string,
  chatId: string,
  senderHandle: string,
) {
  const { reviewId, reviewData, agentData, reviewRef } = result;

  const terminalStatuses = ['booked', 'closed', 'opted-out'];
  if (terminalStatuses.includes(reviewData.status as string)) return;

  const newIncoming: PolicyReviewMessage = {
    role: 'client',
    body: text,
    timestamp: new Date().toISOString(),
  };

  const statusUpdate: Record<string, unknown> = {
    conversation: FieldValue.arrayUnion(newIncoming),
    lastClientReplyAt: new Date().toISOString(),
    nextTouchAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (['outreach-sent', 'drip-1', 'drip-2', 'drip-complete'].includes(reviewData.status as string)) {
    statusUpdate.status = 'conversation-active';
  }

  await reviewRef.update(statusUpdate);

  if (reviewData.aiEnabled === false) return;

  const conversation = (reviewData.conversation as PolicyReviewMessage[]) || [];
  const agentName = (agentData.name as string) || 'Your agent';
  const agentFirstName = agentName.split(' ')[0];
  const schedulingUrl = (agentData.schedulingUrl as string) || null;

  const ctx: PolicyReviewConversationContext = {
    agentName,
    agentFirstName,
    clientName: (reviewData.clientName as string) || 'Client',
    clientFirstName: (reviewData.clientFirstName as string) || 'Client',
    policyType: (reviewData.policyType as string) || 'Policy',
    carrier: (reviewData.carrier as string) || '',
    premiumAmount: (reviewData.premiumAmount as number) || null,
    coverageAmount: (reviewData.coverageAmount as number) || null,
    schedulingUrl,
    conversation,
    preferredLanguage: resolveClientLanguage(reviewData.preferredLanguage),
  };

  try { await startTypingIndicator(chatId); } catch { /* non-critical */ }

  let aiResponse: string | null = null;
  try {
    aiResponse = await generateReviewResponse(ctx, text);
  } catch (e) {
    console.error('Policy review AI response failed for', reviewId, e);
    try { await stopTypingIndicator(chatId); } catch { /* ignore */ }
    return;
  }

  try { await stopTypingIndicator(chatId); } catch { /* non-critical */ }

  if (aiResponse) {
    const newOutgoing: PolicyReviewMessage = {
      role: 'agent-ai',
      body: aiResponse,
      timestamp: new Date().toISOString(),
    };

    await sendOrCreateChat({ to: senderHandle, chatId, text: aiResponse });

    const aiUpdate: Record<string, unknown> = {
      conversation: FieldValue.arrayUnion(newOutgoing),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (schedulingUrl && aiResponse.includes(schedulingUrl)) {
      aiUpdate.status = 'booking-sent';
    }

    await reviewRef.update(aiUpdate);
  }

  const conversationWithIncoming = [...conversation, newIncoming];
  try {
    const [bookingResult, gatheredInfo] = await Promise.all([
      detectBookingSignal(conversationWithIncoming),
      extractReviewInfo(conversationWithIncoming),
    ]);

    const postUpdate: Record<string, unknown> = {};

    if (bookingResult.booked && (bookingResult.confidence === 'high' || bookingResult.confidence === 'medium')) {
      postUpdate.status = 'booked';
    }
    if (Object.keys(gatheredInfo).length > 0) {
      postUpdate.gatheredInfo = gatheredInfo;
    }

    if (Object.keys(postUpdate).length > 0) {
      postUpdate.updatedAt = FieldValue.serverTimestamp();
      await reviewRef.update(postUpdate);
    }
  } catch (e) {
    console.error('Policy review booking detection / info extraction failed:', e);
  }
}
