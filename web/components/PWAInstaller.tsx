'use client';

import { useEffect, useRef, useState } from 'react';

import { useDashboard } from '../app/dashboard/DashboardContext';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { auth } from '../firebase';
import { captureEvent } from '../lib/posthog';

/**
 * AgentForLife PWA + Web Push installer.
 *
 * SOURCE OF TRUTH: docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §2-§3,
 * CONTEXT.md > Channel Rules > Phase 1 implementation constraints.
 *
 * Two responsibilities:
 *
 * 1. Service worker registration (idempotent, runs on every dashboard
 *    page load).
 * 2. Tracking PWA install + Web Push permission state on the agent's
 *    onboarding milestones (Phase 1 hard onboarding gates: agent
 *    cannot complete onboarding without both).
 *
 * Mounted ONCE inside the dashboard layout. Renders nothing.
 *
 * The onboarding overlay (web/components/OnboardingOverlay.tsx) shows
 * the install + permission prompts; this component reflects state back
 * to the milestone store so the overlay can advance.
 *
 * IMPORTANT: this is the AGENT-side push channel. It is INDEPENDENT
 * of client-side Expo push (Track A). They share zero infrastructure.
 */

type PWADetection = 'beforeinstallprompt' | 'display_mode_standalone' | 'navigator_standalone';

function detectStandalonePWA(): PWADetection | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return 'display_mode_standalone';
  }
  // iOS Safari pre-PWA spec exposes `navigator.standalone`.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    return 'navigator_standalone';
  }
  return null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PWAInstaller(): null {
  const { agentProfile, markOnboardingMilestone, refreshProfile } = useDashboard();
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<unknown>(null);
  const fixtureRef = useRef({ subscribed: false });

  // 1. Register the service worker once per session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (!cancelled) {
          swRegistrationRef.current = reg;
        }
      } catch (err) {
        console.error('[pwa-installer] service worker registration failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Detect PWA install state on mount + when the install prompt arrives.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const detection = detectStandalonePWA();
    if (detection) {
      // Already installed — mark the milestone if not already.
      if (agentProfile?.onboarding?.requiredMilestones?.pwaInstalled === false
          || agentProfile?.onboarding?.requiredMilestones?.pwaInstalled === undefined) {
        captureEvent(ANALYTICS_EVENTS.PWA_INSTALL_COMPLETED, {
          platform: detectPlatform(),
          detection,
        });
        void markOnboardingMilestone('pwaInstalled');
      }
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      // Capture for later prompt — the onboarding overlay invokes the
      // install via a button click (Chrome/Edge requires a user
      // gesture). iOS Safari does not fire this event; iOS install is
      // manual via Add to Home Screen and the overlay shows
      // platform-specific instructions.
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    const handleAppInstalled = () => {
      captureEvent(ANALYTICS_EVENTS.PWA_INSTALL_COMPLETED, {
        platform: detectPlatform(),
        detection: 'beforeinstallprompt',
      });
      void markOnboardingMilestone('pwaInstalled');
      void refreshProfile();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [agentProfile, markOnboardingMilestone, refreshProfile]);

  // Expose the captured install prompt globally so OnboardingOverlay
  // can trigger it from a user gesture.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & {
      __aflPwaInstallPrompt?: unknown;
      __aflPwaPromptInstall?: () => Promise<void>;
    };
    w.__aflPwaInstallPrompt = installPromptEvent;
    w.__aflPwaPromptInstall = async () => {
      const ev = w.__aflPwaInstallPrompt as { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome?: 'accepted' | 'dismissed' }> } | undefined;
      if (!ev?.prompt) return;
      captureEvent(ANALYTICS_EVENTS.PWA_INSTALL_PROMPTED, {
        platform: detectPlatform(),
        surface: 'onboarding_milestone',
      });
      await ev.prompt();
      try {
        const choice = await ev.userChoice;
        if (choice?.outcome === 'accepted') {
          captureEvent(ANALYTICS_EVENTS.PWA_INSTALL_COMPLETED, {
            platform: detectPlatform(),
            detection: 'beforeinstallprompt',
          });
          void markOnboardingMilestone('pwaInstalled');
          void refreshProfile();
        }
      } catch {
        // ignore
      }
    };
  }, [installPromptEvent, markOnboardingMilestone, refreshProfile]);

  // 3. Detect Web Push permission state and refresh the milestone.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    (async () => {
      try {
        const reg = swRegistrationRef.current
          || (await navigator.serviceWorker.getRegistration('/'));
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        if (fixtureRef.current.subscribed) return;
        fixtureRef.current.subscribed = true;

        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const subJson = sub.toJSON();
        await fetch('/api/agent/web-push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
            userAgent: navigator.userAgent,
          }),
        });
        captureEvent(ANALYTICS_EVENTS.WEB_PUSH_SUBSCRIPTION_REGISTERED, {});
        void markOnboardingMilestone('webPushGranted');
      } catch (err) {
        console.error('[pwa-installer] web push re-sync failed', err);
      }
    })();
  }, [markOnboardingMilestone]);

  // 4. Expose a global helper for OnboardingOverlay to request
  // permission + subscribe in one click.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & {
      __aflRequestWebPush?: () => Promise<{ ok: boolean; permission: NotificationPermission }>;
    };
    w.__aflRequestWebPush = async () => {
      if (typeof Notification === 'undefined') {
        return { ok: false, permission: 'denied' as NotificationPermission };
      }
      captureEvent(ANALYTICS_EVENTS.WEB_PUSH_PERMISSION_REQUESTED, {
        surface: 'onboarding_milestone',
      });
      let permission: NotificationPermission;
      try {
        permission = await Notification.requestPermission();
      } catch (err) {
        console.error('[pwa-installer] notification permission request failed', err);
        return { ok: false, permission: 'denied' as NotificationPermission };
      }
      if (permission !== 'granted') {
        captureEvent(ANALYTICS_EVENTS.WEB_PUSH_PERMISSION_DENIED, {
          permission_state: permission as 'denied' | 'default',
        });
        return { ok: false, permission };
      }
      captureEvent(ANALYTICS_EVENTS.WEB_PUSH_PERMISSION_GRANTED, {});

      try {
        const reg = swRegistrationRef.current
          || (await navigator.serviceWorker.getRegistration('/'))
          || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
        const vapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          console.error('[pwa-installer] NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY not set');
          return { ok: false, permission };
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const user = auth.currentUser;
        if (!user) return { ok: false, permission };
        const token = await user.getIdToken();
        const subJson = sub.toJSON();
        const res = await fetch('/api/agent/web-push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
            userAgent: navigator.userAgent,
          }),
        });
        if (!res.ok) return { ok: false, permission };
        captureEvent(ANALYTICS_EVENTS.WEB_PUSH_SUBSCRIPTION_REGISTERED, {});
        void markOnboardingMilestone('webPushGranted');
        void refreshProfile();
        return { ok: true, permission };
      } catch (err) {
        console.error('[pwa-installer] subscribe failed', err);
        return { ok: false, permission };
      }
    };
  }, [markOnboardingMilestone, refreshProfile]);

  return null;
}

function detectPlatform(): 'ios' | 'android' | 'desktop' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|windows|linux|cros/.test(ua)) return 'desktop';
  return 'unknown';
}
