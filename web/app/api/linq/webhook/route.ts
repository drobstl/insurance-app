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
  type ConversationMessage,
  type ReferralContext,
} from '../../../../lib/referral-ai';
import { normalizePhone } from '../../../../lib/phone';
import { FieldValue } from 'firebase-admin/firestore';

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
      console.error('Linq webhook signature verification failed');
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

    const isGroup = data.chat.is_group === true;

    if (isGroup) {
      await handleGroupMessage(data);
    } else {
      await handleDirectMessage(data);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in Linq webhook:', error);
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

  if (!existingSnap.empty) {
    return;
  }

  // This is a new group chat — the client created it.
  // The sender is the client; the other non-Linq participant is the referral.
  // Find the agent who owns the Linq number in the chat.
  const ownerHandle = data.chat.owner_handle?.handle;
  if (!ownerHandle) return;

  const linqPhone = normalizePhone(ownerHandle);

  // Find the agent with this Linq phone number
  const agentsSnap = await db
    .collection('agents')
    .where('linqPhoneNumber', '==', linqPhone)
    .limit(1)
    .get();

  if (agentsSnap.empty) return;

  const agentDoc = agentsSnap.docs[0];
  const agentId = agentDoc.id;
  const agentData = agentDoc.data();
  const aiEnabled = (agentData.aiAssistantEnabled as boolean) !== false;

  // The sender is the client — try to match by phone
  const clientSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .where('phone', '==', senderHandle)
    .limit(1)
    .get();

  const clientName = clientSnap.empty
    ? 'A client'
    : (clientSnap.docs[0].data().name as string) || 'A client';
  const clientId = clientSnap.empty ? null : clientSnap.docs[0].id;

  // Find the referral phone (the participant who is not the agent and not the sender)
  const text = extractTextFromParts(data.parts);

  // Look up the pending referral by client + phone match
  // The mobile app calls /api/referral/notify first, so there should be a pending referral
  const pendingSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('referrals')
    .where('status', '==', 'pending')
    .where('groupChatId', '==', null)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  // Match by clientId or clientName
  let matchedRef: FirebaseFirestore.DocumentReference | null = null;
  for (const doc of pendingSnap.docs) {
    const d = doc.data();
    if (clientId && d.clientId === clientId) {
      matchedRef = doc.ref;
      break;
    }
  }
  if (!matchedRef && !pendingSnap.empty) {
    matchedRef = pendingSnap.docs[0].ref;
  }

  if (matchedRef) {
    await matchedRef.update({
      groupChatId: chatId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // No pending referral found — create one from the group message
    const refData = {
      referralName: 'Friend',
      referralPhone: '',
      clientName,
      clientId,
      status: 'pending',
      conversation: [],
      gatheredInfo: {},
      appointmentBooked: false,
      aiEnabled,
      dripCount: 0,
      lastDripAt: null,
      groupChatId: chatId,
      directChatId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    matchedRef = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .add(refData);
  }

  if (!aiEnabled) return;

  // Record the client's message in conversation
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

  // Trigger the group-response flow asynchronously
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

  if (!referralResult) return;

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

  const ctx: ReferralContext = {
    agentName,
    agentFirstName,
    clientName: (referralData.clientName as string) || 'A friend',
    referralName: (referralData.referralName as string) || 'Friend',
    schedulingUrl,
    agentPhone: (agentData.phoneNumber as string) || null,
    conversation,
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
