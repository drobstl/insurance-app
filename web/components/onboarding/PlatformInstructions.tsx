'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 1 Track B — platform-aware onboarding step instructions.
 *
 * SOURCE OF TRUTH: Daniel's May 7, 2026 morning decision — go with
 * Loom-driven coachmarks instead of in-app multi-step text
 * instructions. Reasoning: the OnboardingOverlay's coachmark
 * primitive is a 380px floating card, designed for one-sentence
 * prompts. Cramming "how to use the iOS Share menu" into a coachmark
 * produces a wall of text. Loom is also the better TEACHING medium
 * for this content — agents learn by watching once, not by reading
 * numbered lists.
 *
 * Renders inline next to the install / Web Push step descriptions.
 * Detects platform on mount and shows the right tiny block:
 *
 * - iOS Safari (not yet installed): "Watch how to install" Loom link.
 * - iOS standalone (already in PWA): nothing — PWAInstaller auto-
 *   marks pwaInstalled and the overlay auto-advances anyway.
 * - Android (any browser): "Watch how to install" Loom link.
 * - Desktop: URL + copy button + Loom link, framed as "get AFL on
 *   your phone too" so the agent doesn't think they're abandoning
 *   their laptop workflow.
 *
 * For the Web Push step:
 * - iOS standalone / Android: "Watch how to allow notifications"
 *   Loom link.
 * - iOS Safari: amber warning to switch to the installed PWA first.
 * - Desktop: amber warning to switch to phone.
 *
 * LOOM URL UPDATE PROCEDURE: when Daniel finishes recording, he
 * sends me (or any future agent) the three URLs and we swap the
 * placeholder constants below in a single small commit. Placeholder
 * URLs render as a "Video coming soon" badge instead of a play
 * button so the testing UI is honest about what's missing.
 */

type Platform =
  | 'ios-safari'
  | 'ios-standalone'
  | 'android-chrome'
  | 'android-other'
  | 'desktop'
  | 'unknown';

const DASHBOARD_URL = 'https://agentforlife.app/dashboard';

// Placeholder Loom URLs — swap with real recordings.
// (One commit per swap, ~30 seconds of work each.)
const LOOM_URLS = {
  installIos: 'https://www.loom.com/share/PLACEHOLDER_INSTALL_IOS_60SEC',
  installAndroid: 'https://www.loom.com/share/PLACEHOLDER_INSTALL_ANDROID_60SEC',
  enableNotifications: 'https://www.loom.com/share/PLACEHOLDER_ENABLE_NOTIFICATIONS_30SEC',
} as const;

function isPlaceholderUrl(url: string): boolean {
  return url.includes('PLACEHOLDER');
}

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches)
    || nav.standalone === true;

  if (isIOS) return isStandalone ? 'ios-standalone' : 'ios-safari';
  if (isAndroid) {
    const isChrome = /chrome/i.test(ua) && !/edg|opr|samsung/i.test(ua);
    return isChrome ? 'android-chrome' : 'android-other';
  }
  return 'desktop';
}

interface PlatformInstructionsProps {
  stepId: 'pwaInstall' | 'webPushPermission';
}

export default function PlatformInstructions({ stepId }: PlatformInstructionsProps) {
  const [platform, setPlatform] = useState<Platform>('unknown');

  useEffect(() => {
    // SSR-safe: detection runs after hydration. eslint-disable
    // because reading navigator.userAgent during render breaks SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(detectPlatform());
    const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;
    if (!mql) return;
    const listener = () => setPlatform(detectPlatform());
    mql.addEventListener?.('change', listener);
    return () => mql.removeEventListener?.('change', listener);
  }, []);

  if (platform === 'unknown') return null;

  if (stepId === 'pwaInstall') {
    return <InstallBlock platform={platform} />;
  }
  return <WebPushBlock platform={platform} />;
}

function InstallBlock({ platform }: { platform: Platform }) {
  if (platform === 'ios-standalone') {
    // Auto-advances via PWAInstaller; render nothing to avoid a
    // brief flash of "you're installed" content.
    return null;
  }
  if (platform === 'desktop') {
    return <DesktopBlock loomUrl={LOOM_URLS.installIos} />;
  }
  const loomUrl = platform === 'ios-safari'
    ? LOOM_URLS.installIos
    : LOOM_URLS.installAndroid;
  return <VideoLink url={loomUrl} label="Watch how to install (60s)" />;
}

function WebPushBlock({ platform }: { platform: Platform }) {
  if (platform === 'ios-safari') {
    return (
      <WarnBlock>
        First, install AFL to your home screen and open it from there. Notifications can only be turned on inside the installed app.
      </WarnBlock>
    );
  }
  if (platform === 'desktop') {
    return (
      <WarnBlock>
        Switch to AFL on your phone (open it from the home screen icon you installed) to continue.
      </WarnBlock>
    );
  }
  return (
    <VideoLink url={LOOM_URLS.enableNotifications} label="Watch how to allow notifications (30s)" />
  );
}

function VideoLink({ url, label }: { url: string; label: string }) {
  if (isPlaceholderUrl(url)) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-[#727272] bg-[#fafafa] px-3 py-2 text-[12px] text-[#5f5f5f]">
        <span className="font-semibold">Video coming soon</span>
        <span className="opacity-70">— Daniel is recording it</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-2 rounded-lg border-2 border-[#0D4D4D] bg-white px-3 py-2 text-[13px] font-bold text-[#0D4D4D] hover:bg-[#0D4D4D] hover:text-white transition-colors w-full justify-center"
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
      <span>{label}</span>
    </a>
  );
}

function WarnBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-[#f1c97a] bg-[#fff8e8] px-3 py-2.5 text-[12px] text-[#7a4a00] leading-snug">
      {children}
    </div>
  );
}

function DesktopBlock({ loomUrl }: { loomUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DASHBOARD_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-lg border border-[#0D4D4D] bg-white px-3 py-2 text-[12px] text-[#2d3748]">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0D4D4D]/70 mb-1">
          On your phone, open:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[#0D4D4D] font-mono text-[12px] truncate">
            {DASHBOARD_URL}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded bg-[#0D4D4D] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#0a3d3d] transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <VideoLink url={loomUrl} label="Watch how to install on your phone (60s)" />
    </div>
  );
}
