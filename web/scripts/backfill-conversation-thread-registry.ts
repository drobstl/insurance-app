#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
import { getAdminFirestore } from '../lib/firebase-admin';
import { normalizePhone } from '../lib/phone';
import { upsertThreadFromOutbound } from '../lib/conversation-thread-registry';

for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

async function backfillAgent(agentId: string): Promise<{ referral: number; conservation: number; review: number }> {
  const db = getAdminFirestore();
  let referral = 0;
  let conservation = 0;
  let review = 0;

  const referralSnap = await db.collection('agents').doc(agentId).collection('referrals').get();
  for (const doc of referralSnap.docs) {
    const data = doc.data();
    const directChatId = typeof data.directChatId === 'string' ? data.directChatId.trim() : '';
    if (!directChatId) continue;
    const phone = typeof data.referralPhone === 'string' ? normalizePhone(data.referralPhone) : '';
    await upsertThreadFromOutbound({
      db,
      agentId,
      providerThreadId: directChatId,
      providerType: 'sms_direct',
      lane: 'referral',
      purpose: 'referral_outreach',
      linkedEntityType: 'referral',
      linkedEntityId: doc.id,
      participantPhonesE164: phone ? [phone] : [],
      allowAutoReply: data.aiEnabled !== false,
      allowedResponder: data.aiEnabled === false ? 'manual_only' : 'referral',
      assignmentSource: 'migration',
    });
    referral += 1;
  }

  const conservationSnap = await db.collection('agents').doc(agentId).collection('conservationAlerts').get();
  for (const doc of conservationSnap.docs) {
    const data = doc.data();
    const chatId = typeof data.chatId === 'string' ? data.chatId.trim() : '';
    if (!chatId) continue;
    const clientId = typeof data.clientId === 'string' ? data.clientId : '';
    let phone = '';
    if (clientId) {
      const clientDoc = await db.collection('agents').doc(agentId).collection('clients').doc(clientId).get();
      if (clientDoc.exists) {
        const clientData = clientDoc.data() as Record<string, unknown>;
        phone = typeof clientData.phone === 'string' ? normalizePhone(clientData.phone) : '';
      }
    }
    await upsertThreadFromOutbound({
      db,
      agentId,
      providerThreadId: chatId,
      providerType: 'sms_direct',
      lane: 'conservation',
      purpose: 'conservation',
      linkedEntityType: 'conservationAlert',
      linkedEntityId: doc.id,
      participantPhonesE164: phone ? [phone] : [],
      allowAutoReply: data.aiEnabled !== false,
      allowedResponder: data.aiEnabled === false ? 'manual_only' : 'conservation',
      assignmentSource: 'migration',
    });
    conservation += 1;
  }

  const reviewSnap = await db.collection('agents').doc(agentId).collection('policyReviews').get();
  for (const doc of reviewSnap.docs) {
    const data = doc.data();
    const chatId = typeof data.chatId === 'string' ? data.chatId.trim() : '';
    if (!chatId) continue;
    const phone = typeof data.clientPhone === 'string' ? normalizePhone(data.clientPhone) : '';
    await upsertThreadFromOutbound({
      db,
      agentId,
      providerThreadId: chatId,
      providerType: 'sms_direct',
      lane: 'policy_review',
      purpose: 'policy_review',
      linkedEntityType: 'policyReview',
      linkedEntityId: doc.id,
      participantPhonesE164: phone ? [phone] : [],
      allowAutoReply: data.aiEnabled !== false,
      allowedResponder: data.aiEnabled === false ? 'manual_only' : 'policy_review',
      assignmentSource: 'migration',
    });
    review += 1;
  }

  return { referral, conservation, review };
}

async function main() {
  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();
  let totalReferral = 0;
  let totalConservation = 0;
  let totalReview = 0;

  for (const agent of agentsSnap.docs) {
    const counts = await backfillAgent(agent.id);
    totalReferral += counts.referral;
    totalConservation += counts.conservation;
    totalReview += counts.review;
    console.log('[thread-registry-backfill] agent complete', {
      agentId: agent.id,
      ...counts,
    });
  }

  console.log('[thread-registry-backfill] complete', {
    agents: agentsSnap.size,
    referral: totalReferral,
    conservation: totalConservation,
    review: totalReview,
  });
}

main().catch((error) => {
  console.error('[thread-registry-backfill] failed', error);
  process.exit(1);
});
