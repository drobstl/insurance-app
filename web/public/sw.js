/* eslint-disable no-restricted-globals */
/* global self, clients */

/**
 * AgentForLife agent-side service worker.
 *
 * SOURCE OF TRUTH: docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §2,
 * docs/AFL_Messaging_Operating_Model_v3.1.md §9.4, CONTEXT.md > Channel
 * Rules > Phase 1 implementation constraints.
 *
 * This service worker exists for ONE reason in Phase 1: receive Web Push
 * notifications on the agent's installed PWA so the agent gets notified
 * when a new welcome action item lands. Push notifications are the
 * activation surface for the welcome lane (Phase 1 hard onboarding
 * gate). DO NOT add Workbox precaching, runtime caching, or offline
 * tricks here — those create cache invalidation headaches that the
 * Phase 1 build does not need. Keep this file boring and obvious.
 *
 * Agent-side push (this file) is INDEPENDENT of client-side Expo push
 * (Track A's web/lib/push-permission-lifecycle.ts). Different stack,
 * different lifecycle. Do not conflate them.
 */

const SW_VERSION = 'afl-agent-sw-v1';

self.addEventListener('install', (event) => {
  // No precaching — skip waiting so a new SW activates immediately.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'AgentForLife', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'AgentForLife';
  const body = payload.body || '';
  const data = payload.data || {};
  const tag = payload.tag || (data.actionItemId ? `action-item-${data.actionItemId}` : undefined);

  const options = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    data,
    tag,
    renotify: !!payload.renotify,
    requireInteraction: !!payload.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = (data && data.url) || '/dashboard';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch (e) {
              // Some browsers reject .navigate from non-same-page URLs;
              // postMessage as a fallback so the app can handle nav itself.
              client.postMessage({ type: 'afl:navigate', url: targetUrl });
            }
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Fired when the browser invalidates the current subscription (key
  // rotation, expiration). Re-subscribe and POST the new endpoint to
  // /api/agent/web-push/subscribe via the page when it next opens.
  // We can't authenticate here without a token, so we just let the
  // browser drop the old sub; the next dashboard load will re-subscribe.
  console.log('[afl-sw]', SW_VERSION, 'pushsubscriptionchange — waiting for client re-subscribe');
});
