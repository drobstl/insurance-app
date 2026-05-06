import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import webpush from 'web-push';

import { getAdminFirestore } from './firebase-admin';

/**
 * Agent-side Web Push lifecycle helpers.
 *
 * SOURCE OF TRUTH: docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §2-§3,
 * docs/AFL_Messaging_Operating_Model_v3.1.md §9.4, CONTEXT.md > Channel
 * Rules > Phase 1 implementation constraints.
 *
 * IMPORTANT: this is the AGENT-side push channel — the agent's browser
 * (PWA) receiving notifications via the W3C Push API. It is INDEPENDENT
 * of the CLIENT-side Expo push channel governed by Track A's
 * `web/lib/push-permission-lifecycle.ts`. Different stack, different
 * subscription shape, different lifecycle. Do not conflate them. Do
 * not route agent notifications through the Expo helper.
 *
 * Required environment:
 *   WEB_PUSH_VAPID_PUBLIC_KEY      — VAPID public key (base64-url)
 *   WEB_PUSH_VAPID_PRIVATE_KEY     — VAPID private key (base64-url)
 *   WEB_PUSH_VAPID_SUBJECT         — mailto:foo@example.com or https://...
 *   NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY — same as WEB_PUSH_VAPID_PUBLIC_KEY,
 *                                    exposed to the browser for
 *                                    pushManager.subscribe(applicationServerKey).
 *
 * Generate keys once with:  npx web-push generate-vapid-keys
 *
 * Stored on agents/{agentId} as:
 *   webPushSubscriptions: Array<{
 *     endpoint, p256dh, auth, userAgent, addedAt, lastSendAt, lastSendStatus
 *   }>
 * (Array, not single, because an agent may install the PWA on multiple
 * devices — phone home screen + macOS PWA — and we want both to receive.)
 */

export const WEB_PUSH_PERMISSION_REVOKED_FIELD = 'webPushPermissionRevokedAt' as const;

let vapidConfigured = false;

function ensureVapidConfigured(): { ok: true } | { ok: false; reason: string } {
  if (vapidConfigured) return { ok: true };
  const pub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    return {
      ok: false,
      reason: 'WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY / WEB_PUSH_VAPID_SUBJECT not set',
    };
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'VAPID configuration failed',
    };
  }
}

export interface WebPushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  addedAt: string;
  lastSendAt: string | null;
  lastSendStatus: 'ok' | 'failed' | 'invalidated' | null;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
  renotify?: boolean;
  requireInteraction?: boolean;
}

/**
 * Persist a new subscription on the agent doc, OR refresh the
 * timestamps on an existing one with the same endpoint. Idempotent.
 */
export async function registerAgentWebPushSubscription(params: {
  agentId: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  userAgent?: string | null;
}): Promise<{ added: boolean; total: number }> {
  const db = getAdminFirestore();
  const ref = db.collection('agents').doc(params.agentId);
  const now = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists ? (snap.data() as Record<string, unknown>) : {}) || {};
    const existing = Array.isArray(data.webPushSubscriptions)
      ? (data.webPushSubscriptions as WebPushSubscriptionRecord[])
      : [];
    const idx = existing.findIndex((s) => s.endpoint === params.subscription.endpoint);
    let next: WebPushSubscriptionRecord[];
    let added = false;
    if (idx >= 0) {
      next = existing.map((s, i) =>
        i === idx
          ? {
              ...s,
              p256dh: params.subscription.keys.p256dh,
              auth: params.subscription.keys.auth,
              userAgent: params.userAgent ?? s.userAgent ?? null,
              addedAt: s.addedAt || now,
            }
          : s,
      );
    } else {
      added = true;
      next = [
        ...existing,
        {
          endpoint: params.subscription.endpoint,
          p256dh: params.subscription.keys.p256dh,
          auth: params.subscription.keys.auth,
          userAgent: params.userAgent ?? null,
          addedAt: now,
          lastSendAt: null,
          lastSendStatus: null,
        },
      ];
    }
    tx.set(
      ref,
      {
        webPushSubscriptions: next,
        // Re-grant clears any prior revocation marker (parallel to the
        // Expo lifecycle's "successful re-registration clears
        // pushPermissionRevokedAt" pattern).
        [WEB_PUSH_PERMISSION_REVOKED_FIELD]: FieldValue.delete(),
      },
      { merge: true },
    );
    return { added, total: next.length };
  });
}

/**
 * Remove a subscription by endpoint. Used by the unsubscribe API and by
 * `sendAgentWebPush` itself when the push gateway returns a permanent
 * failure (HTTP 404 / 410) — that subscription is dead and stays in
 * the array forever otherwise.
 */
export async function removeAgentWebPushSubscription(params: {
  agentId: string;
  endpoint: string;
  reason: 'agent_unsubscribed' | 'gone_410' | 'not_found_404' | 'forbidden_403' | 'unknown';
}): Promise<{ removed: boolean; remaining: number }> {
  const db = getAdminFirestore();
  const ref = db.collection('agents').doc(params.agentId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { removed: false, remaining: 0 };
    const data = snap.data() as Record<string, unknown>;
    const existing = Array.isArray(data.webPushSubscriptions)
      ? (data.webPushSubscriptions as WebPushSubscriptionRecord[])
      : [];
    const next = existing.filter((s) => s.endpoint !== params.endpoint);
    if (next.length === existing.length) {
      return { removed: false, remaining: existing.length };
    }
    const update: Record<string, unknown> = {
      webPushSubscriptions: next,
    };
    if (next.length === 0 && params.reason !== 'agent_unsubscribed') {
      // All subscriptions invalidated by the push gateway — record a
      // revocation timestamp so the dashboard can prompt the agent to
      // re-grant Web Push permission.
      update[WEB_PUSH_PERMISSION_REVOKED_FIELD] = FieldValue.serverTimestamp();
    }
    if (next.length === 0 && params.reason === 'agent_unsubscribed') {
      // Explicit unsubscribe also stamps revocation so we don't keep
      // routing welcome notifications to a dead destination.
      update[WEB_PUSH_PERMISSION_REVOKED_FIELD] = FieldValue.serverTimestamp();
    }
    tx.update(ref, update);
    return { removed: true, remaining: next.length };
  });

  console.log('[web-push-lifecycle] subscription removed', {
    agentId: params.agentId,
    reason: params.reason,
    removed: result.removed,
    remaining: result.remaining,
    endpointSuffix: params.endpoint.length > 12 ? `***${params.endpoint.slice(-12)}` : '***',
  });

  return result;
}

interface SendOutcome {
  endpoint: string;
  status: 'ok' | 'failed' | 'invalidated';
  statusCode?: number;
  reason?: string;
}

/**
 * Fan out a Web Push notification to every subscription on the agent
 * doc. On a permanent-failure status (404, 410), the failing
 * subscription is removed atomically (mirrors the Track A Expo
 * lifecycle pattern). Returns per-subscription outcomes for telemetry.
 */
export async function sendAgentWebPush(params: {
  agentId: string;
  payload: WebPushPayload;
}): Promise<{
  attempted: number;
  ok: number;
  invalidated: number;
  failed: number;
  outcomes: SendOutcome[];
}> {
  const config = ensureVapidConfigured();
  if (!config.ok) {
    console.error('[web-push-lifecycle] VAPID not configured', { reason: config.reason });
    return { attempted: 0, ok: 0, invalidated: 0, failed: 0, outcomes: [] };
  }

  const db = getAdminFirestore();
  const ref = db.collection('agents').doc(params.agentId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { attempted: 0, ok: 0, invalidated: 0, failed: 0, outcomes: [] };
  }
  const data = snap.data() as Record<string, unknown>;
  const subs: WebPushSubscriptionRecord[] = Array.isArray(data.webPushSubscriptions)
    ? (data.webPushSubscriptions as WebPushSubscriptionRecord[])
    : [];
  if (subs.length === 0) {
    return { attempted: 0, ok: 0, invalidated: 0, failed: 0, outcomes: [] };
  }

  const payloadString = JSON.stringify({
    title: params.payload.title,
    body: params.payload.body,
    tag: params.payload.tag,
    renotify: !!params.payload.renotify,
    requireInteraction: !!params.payload.requireInteraction,
    data: {
      ...(params.payload.data || {}),
      url: params.payload.url || '/dashboard',
    },
  });

  const outcomes: SendOutcome[] = [];
  let okCount = 0;
  let invalidatedCount = 0;
  let failedCount = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payloadString,
      );
      okCount += 1;
      outcomes.push({ endpoint: sub.endpoint, status: 'ok' });
    } catch (err) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      const code = typeof e.statusCode === 'number' ? e.statusCode : 0;
      if (code === 404 || code === 410) {
        invalidatedCount += 1;
        outcomes.push({
          endpoint: sub.endpoint,
          status: 'invalidated',
          statusCode: code,
          reason: code === 410 ? 'gone_410' : 'not_found_404',
        });
        await removeAgentWebPushSubscription({
          agentId: params.agentId,
          endpoint: sub.endpoint,
          reason: code === 410 ? 'gone_410' : 'not_found_404',
        });
      } else if (code === 403) {
        invalidatedCount += 1;
        outcomes.push({
          endpoint: sub.endpoint,
          status: 'invalidated',
          statusCode: code,
          reason: 'forbidden_403',
        });
        await removeAgentWebPushSubscription({
          agentId: params.agentId,
          endpoint: sub.endpoint,
          reason: 'forbidden_403',
        });
      } else {
        failedCount += 1;
        outcomes.push({
          endpoint: sub.endpoint,
          status: 'failed',
          statusCode: code || undefined,
          reason: e.message || 'unknown',
        });
      }
    }
  }

  // Touch lastSendAt / lastSendStatus on the surviving subs.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return;
    const freshData = fresh.data() as Record<string, unknown>;
    const freshSubs: WebPushSubscriptionRecord[] = Array.isArray(freshData.webPushSubscriptions)
      ? (freshData.webPushSubscriptions as WebPushSubscriptionRecord[])
      : [];
    if (freshSubs.length === 0) return;
    const now = new Date().toISOString();
    const outcomeByEndpoint = new Map(outcomes.map((o) => [o.endpoint, o]));
    const next = freshSubs.map((s) => {
      const outcome = outcomeByEndpoint.get(s.endpoint);
      if (!outcome) return s;
      return {
        ...s,
        lastSendAt: now,
        lastSendStatus:
          outcome.status === 'ok' ? 'ok'
            : outcome.status === 'invalidated' ? 'invalidated'
            : 'failed',
      };
    });
    tx.update(ref, { webPushSubscriptions: next });
  });

  return {
    attempted: subs.length,
    ok: okCount,
    invalidated: invalidatedCount,
    failed: failedCount,
    outcomes,
  };
}

export function isAgentWebPushEligible(agentDoc: Record<string, unknown> | null | undefined): boolean {
  if (!agentDoc) return false;
  const subs = Array.isArray(agentDoc.webPushSubscriptions)
    ? (agentDoc.webPushSubscriptions as WebPushSubscriptionRecord[])
    : [];
  if (subs.length === 0) return false;
  if (agentDoc[WEB_PUSH_PERMISSION_REVOKED_FIELD]) return false;
  return true;
}
