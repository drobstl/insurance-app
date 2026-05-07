'use client';

import { useEffect, useState } from 'react';

/**
 * Phase 1 Track B — platform-aware onboarding step instructions.
 *
 * Renders inline next to the install / Web Push step descriptions in
 * OnboardingOverlay. Detects whether the user is on iOS Safari (not
 * yet installed), iOS standalone PWA, Android Chrome, Android other
 * browser, or desktop — and shows the right step-by-step guidance.
 *
 * Why this matters: a brand-new agent who signs up at their laptop
 * and gets to "Install AFL on your phone" needs us to spell out
 * (a) that the install is on their phone, not their laptop, and
 * (b) how to actually do it on iOS Safari (Add to Home Screen is
 * buried in the Share menu — most non-technical users don't know
 * this is even possible). Without this, install completion drops
 * dramatically. Equivalent guidance for Android.
 */

type Platform =
  | 'ios-safari'
  | 'ios-standalone'
  | 'android-chrome'
  | 'android-other'
  | 'desktop'
  | 'unknown';

const DASHBOARD_URL = 'https://agentforlife.app/dashboard';

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
    // SSR-safe: detection runs after hydration, then again whenever
    // display-mode changes (rare; fires when the user installs the
    // PWA mid-flow and re-opens from the home screen icon).
    // The setState-in-effect lint flags this pattern but it's the
    // canonical SSR-safe platform-detect approach — we cannot read
    // navigator.userAgent during render without breaking SSR.
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
    return <InstallInstructions platform={platform} />;
  }
  return <WebPushInstructionsView platform={platform} />;
}

function InstallInstructions({ platform }: { platform: Platform }) {
  if (platform === 'ios-standalone') {
    return (
      <NoteBlock tone="success">
        You&apos;re already in the installed app — perfect. Tap Continue.
      </NoteBlock>
    );
  }
  if (platform === 'ios-safari') {
    return (
      <StepsBlock
        intro="On your iPhone, in Safari:"
        steps={[
          <>Tap the <strong>Share</strong> button at the bottom of Safari (the square icon with an arrow pointing up).</>,
          <>Scroll down and tap <strong>Add to Home Screen</strong>.</>,
          <>Tap <strong>Add</strong> in the top right.</>,
          <>Close Safari, then open AFL from the new icon on your home screen. Sign in if asked.</>,
        ]}
        footer="When you open AFL from the home screen icon, this step completes automatically."
      />
    );
  }
  if (platform === 'android-chrome' || platform === 'android-other') {
    return (
      <StepsBlock
        intro="On your Android phone, in Chrome (or your default browser):"
        steps={[
          <>Tap the <strong>menu</strong> (three dots) in the top right of the browser.</>,
          <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong> if Install isn&apos;t there).</>,
          <>Tap <strong>Install</strong> to confirm.</>,
          <>Open AFL from the new icon on your home screen. Sign in if asked.</>,
        ]}
        footer="When you open AFL from the home screen icon, this step completes automatically."
      />
    );
  }
  // platform === 'desktop'
  return (
    <DesktopSwitchBlock />
  );
}

function WebPushInstructionsView({ platform }: { platform: Platform }) {
  if (platform === 'ios-safari') {
    return (
      <NoteBlock tone="warn">
        You need to be in the <strong>installed AFL app</strong> for this step.
        Close Safari and open AFL from the home screen icon you just added — then come back to this screen and tap Allow notifications again.
      </NoteBlock>
    );
  }
  if (platform === 'desktop') {
    return (
      <NoteBlock tone="warn">
        This step happens on your phone, not your computer. Switch to AFL on your phone (open it from the home screen icon you installed) to continue.
      </NoteBlock>
    );
  }
  // ios-standalone, android-chrome, android-other
  return (
    <NoteBlock tone="info">
      When you tap Allow notifications, your phone will pop up an iOS-style confirmation. Tap <strong>Allow</strong>.
      We&apos;ll send you a phone notification the moment a new client needs a welcome — same way iMessage notifications work.
    </NoteBlock>
  );
}

function StepsBlock({
  intro,
  steps,
  footer,
}: {
  intro: string;
  steps: React.ReactNode[];
  footer?: string;
}) {
  return (
    <div className="mt-3 rounded-lg border border-[#3DD6C3] bg-[#f6fffd] px-3 py-3 text-[12px] text-[#2d3748] leading-snug">
      <p className="font-semibold text-[#0D4D4D] mb-2">{intro}</p>
      <ol className="list-decimal pl-5 space-y-1.5">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {footer ? (
        <p className="mt-2 text-[11px] text-[#0D4D4D]/80 italic">{footer}</p>
      ) : null}
    </div>
  );
}

function NoteBlock({
  tone,
  children,
}: {
  tone: 'info' | 'warn' | 'success';
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    info: 'border-[#3DD6C3] bg-[#f6fffd] text-[#2d3748]',
    warn: 'border-[#f1c97a] bg-[#fff8e8] text-[#7a4a00]',
    success: 'border-[#86efac] bg-[#f0fdf4] text-[#14532d]',
  };
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2.5 text-[12px] leading-snug ${styles[tone]}`}>
      {children}
    </div>
  );
}

function DesktopSwitchBlock() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DASHBOARD_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers — silently no-op.
    }
  };

  return (
    <div className="mt-3 rounded-lg border-2 border-[#0D4D4D] bg-[#f6fffd] px-3 py-3 text-[12px] text-[#2d3748] leading-snug">
      <p className="font-bold text-[#0D4D4D] mb-2">You&apos;re on your computer.</p>
      <p className="mb-2">
        AFL installs on your <strong>phone</strong>, not your laptop. To continue, open this URL on your phone in Safari (iPhone) or Chrome (Android):
      </p>
      <div className="flex items-center gap-2 mb-2 rounded border border-[#0D4D4D]/30 bg-white px-2 py-1.5">
        <code className="flex-1 text-[#0D4D4D] font-mono text-[11px] truncate">{DASHBOARD_URL}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-[#0D4D4D] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#0a3d3d] transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mb-2">
        On your phone, sign in with the same email and password you used here. You&apos;ll land back on this screen and the step-by-step install instructions will show up automatically for your phone.
      </p>
      <p className="text-[11px] text-[#0D4D4D]/80 italic">
        Tip: text or email this link to yourself if you don&apos;t want to type it.
      </p>
    </div>
  );
}
