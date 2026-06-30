import 'server-only';

import type { Firestore } from 'firebase-admin/firestore';
import {
  isPushEligible,
  readValidPushToken,
  sendExpoPush,
} from './push-permission-lifecycle';
import { notifyAgentPhoneDisconnected } from './agent-phone-alert';

/**
 * Push notifications targeted at the AGENT (not the lead/client).
 *
 * Distinct from `appointment-push-reminders` (which pushes the LEAD).
 * This module is the trigger that wakes up the agent's phone with a
 * "tap me to send the confirmation text" notification.
 *
 * Three call sites:
 *   - On appointment create (POST /api/leads/[id]/appointments) →
 *     kind = 'confirmation'
 *   - On appointment reschedule (PATCH /api/appointments/[id]) →
 *     kind = 'confirmation' (same template, lead reads the updated time)
 *   - From the 1-hour cron → kind = 'reminder'
 *
 * Each push carries a deep-link pointing the AFL app at
 * `agentforlife://send/{apptId}?kind={kind}`, which opens the send
 * screen and fires `expo-sms.sendSMSAsync` with everything filled in.
 *
 * Push permission lifecycle: we route through `sendExpoPush`, so any
 * `DeviceNotRegistered` reply atomically clears the agent's pushToken
 * and stamps `pushPermissionRevokedAt`. The next time the agent opens
 * /agent-home, push registration runs fresh.
 */

type AgentPushKind = 'confirmation' | 'reminder';

export interface PushAgentResult {
  outcome: 'ok' | 'no_token' | 'ineligible' | 'failed';
  reason?: string;
}

export async function pushAgentForConfirmation(args: {
  db: Firestore;
  agentId: string;
  apptId: string;
  leadName: string;
  kind: AgentPushKind;
}): Promise<PushAgentResult> {
  const { db, agentId, apptId, leadName, kind } = args;

  const agentRef = db.collection('agents').doc(agentId);
  const agentSnap = await agentRef.get();
  if (!agentSnap.exists) {
    return { outcome: 'failed', reason: 'agent_not_found' };
  }
  const agentData = agentSnap.data() || {};

  // Push eligibility: gates on token presence + absence of the
  // revocation timestamp. Mirrors how every other push lane works in
  // this codebase.
  if (!isPushEligible(agentData)) {
    return { outcome: 'ineligible' };
  }
  const token = readValidPushToken(agentData);
  if (!token) {
    return { outcome: 'no_token' };
  }

  // Notification copy. Short enough to render on a lock screen
  // without truncation. The body's emotional weight is the recipient
  // name — the agent recognizes their lead by first name.
  const friendlyLeadName = (leadName || '').split(/\s+/)[0] || 'your lead';
  const title =
    kind === 'reminder' ? 'Appointment in 1 hour' : 'Send confirmation';
  const body =
    kind === 'reminder'
      ? `Send ${friendlyLeadName} a reminder text — tap to open Messages.`
      : `Send ${friendlyLeadName} a confirmation text — tap to open Messages.`;

  // Deep link the app uses to route directly into the send screen.
  // The app reads `data.deepLink` from the notification payload in
  // its expo-notifications response handler and navigates there.
  const deepLink = `agentforlife://send/${encodeURIComponent(apptId)}?kind=${kind}`;

  // We send with priority 'high' AND request time-sensitive
  // interruption on iOS so the push pierces Focus modes. Expo's
  // server SDK passes `_displayInForeground` and similar through to
  // APNs; `interruptionLevel` is the field iOS reads.
  const outcome = await sendExpoPush(
    {
      to: token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      data: {
        deepLink,
        appointmentId: apptId,
        kind,
      },
      // @ts-expect-error — Expo accepts `interruptionLevel` on iOS payloads
      //  but the local ExpoPushPayload type in push-permission-lifecycle.ts
      //  doesn't include it yet. Passing it through is safe; Expo's
      //  push server forwards unknown fields verbatim to APNs.
      interruptionLevel: 'time-sensitive',
    },
    {
      agentId,
      ref: agentRef,
    },
  );

  if (outcome.status === 'ok') return { outcome: 'ok' };
  if (outcome.status === 'token_invalidated') {
    // The agent's own device token just died (DeviceNotRegistered → token
    // cleared + revoked stamped by sendExpoPush). Push is the channel that
    // broke, so reach the agent by email with a one-tap reconnect link.
    // Best-effort + once-per-drop; never blocks the push result.
    await notifyAgentPhoneDisconnected({ agentRef, agentData });
    return { outcome: 'no_token' };
  }
  return { outcome: 'failed', reason: outcome.errorCode || 'unknown' };
}
