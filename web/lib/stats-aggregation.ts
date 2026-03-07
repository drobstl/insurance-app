import type { Firestore } from 'firebase-admin/firestore';
import { computeAPV } from './apv';

export interface AgentAggregates {
  referrals: { total: number; appointmentsBooked: number };
  clientsFromReferrals: number;
  savedPolicies: { count: number; apv: number };
  successfulRewrites: { count: number; apv: number };
  referralApv: number;
  totalApv: number;
  touchpoints: {
    holidayCardsSent: number;
    birthdayMessagesSent: number;
    anniversarySent: number;
    total: number;
  };
  rates: {
    referralAppointmentRate: number;
    conservationSaveRate: number;
  };
  updatedAt: string;
}

/**
 * Compute and return aggregates for a single agent. Does not write to Firestore.
 */
export async function computeAgentAggregates(
  db: Firestore,
  agentId: string,
): Promise<AgentAggregates> {
  // ── Referrals ───────────────────────────────────────────
  const referralsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('referrals')
    .get();

  let referralsTotal = 0;
  let appointmentsBooked = 0;

  for (const refDoc of referralsSnap.docs) {
    referralsTotal++;
    const data = refDoc.data();
    if (data.status === 'booked' || data.appointmentBooked === true) {
      appointmentsBooked++;
    }
  }

  // ── Conservation (saved policies) ───────────────────────
  const conservationSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('conservationAlerts')
    .get();

  let savedCount = 0;
  let savedApv = 0;
  let lostCount = 0;

  for (const alertDoc of conservationSnap.docs) {
    const data = alertDoc.data();
    if (data.status === 'saved') {
      savedCount++;
      savedApv += computeAPV(data.premiumAmount as number | null);
    } else if (data.status === 'lost') {
      lostCount++;
    }
  }

  // ── Policy Reviews (rewrites) ──────────────────────────
  const reviewsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('policyReviews')
    .get();

  let rewriteCount = 0;
  let rewriteApv = 0;

  for (const revDoc of reviewsSnap.docs) {
    const data = revDoc.data();
    if (data.status === 'booked' || data.status === 'closed') {
      rewriteCount++;
      rewriteApv += computeAPV(data.premiumAmount as number | null);
    }
  }

  // ── Clients from referrals + referral APV ──────────────
  const clientsSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .get();

  let clientsFromReferrals = 0;
  let referralApv = 0;
  const referredClientIds: string[] = [];

  for (const clientDoc of clientsSnap.docs) {
    const data = clientDoc.data();
    if (data.sourceReferralId) {
      clientsFromReferrals++;
      referredClientIds.push(clientDoc.id);
    }
  }

  for (const clientId of referredClientIds) {
    const policiesSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('policies')
      .get();

    for (const policyDoc of policiesSnap.docs) {
      const p = policyDoc.data();
      if (p.status === 'Active' || p.status === 'Pending') {
        referralApv += computeAPV(
          p.premiumAmount as number | null,
          p.premiumFrequency as string | null,
        );
      }
    }
  }

  // ── Touchpoints (notifications) ────────────────────────
  let holidayCardsSent = 0;
  let birthdayMessagesSent = 0;
  let anniversarySent = 0;

  for (const clientDoc of clientsSnap.docs) {
    const notifsSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientDoc.id)
      .collection('notifications')
      .get();

    for (const notifDoc of notifsSnap.docs) {
      const type = notifDoc.data().type as string;
      if (type === 'holiday') holidayCardsSent++;
      else if (type === 'birthday') birthdayMessagesSent++;
      else if (type === 'anniversary') anniversarySent++;
    }
  }

  // ── Derived rates ──────────────────────────────────────
  const referralAppointmentRate =
    referralsTotal > 0 ? appointmentsBooked / referralsTotal : 0;
  const conservationSaveRate =
    savedCount + lostCount > 0 ? savedCount / (savedCount + lostCount) : 0;

  const totalApv = savedApv + rewriteApv + referralApv;

  return {
    referrals: { total: referralsTotal, appointmentsBooked },
    clientsFromReferrals,
    savedPolicies: { count: savedCount, apv: savedApv },
    successfulRewrites: { count: rewriteCount, apv: rewriteApv },
    referralApv,
    totalApv,
    touchpoints: {
      holidayCardsSent,
      birthdayMessagesSent,
      anniversarySent,
      total: holidayCardsSent + birthdayMessagesSent + anniversarySent,
    },
    rates: {
      referralAppointmentRate: Math.round(referralAppointmentRate * 1000) / 1000,
      conservationSaveRate: Math.round(conservationSaveRate * 1000) / 1000,
    },
    updatedAt: new Date().toISOString(),
  };
}
