'use client';

import { useEffect, useRef, useState, use } from 'react';

/**
 * /pair/[code] — Universal bridge from the scanned QR to the AFL app.
 *
 * Why a real HTTPS page (not just a `agentforlife://` link in the QR):
 *   iOS Camera + most third-party QR scanners are flaky with custom
 *   URL schemes — they often won't show an "Open in Agent for Life"
 *   banner and may treat the QR contents as plain text. HTTPS URLs
 *   always render as a tappable link. So we encode an HTTPS URL in the
 *   QR; that lands here; we bounce immediately to the custom scheme;
 *   iOS hands it to the installed AFL app.
 *
 * App-not-installed detection:
 *   We fire the custom scheme, then watch `document.visibilityState`.
 *   When iOS hands a URL to an installed app, Safari backgrounds and
 *   the page becomes hidden. If after ~1.5s we're still visible, the
 *   app didn't open — almost always because it's not installed. We
 *   swap to a "install the app" UI that leads with the App Store
 *   instead of leaving the agent staring at a useless retry button.
 */

const APP_STORE_URL = 'https://apps.apple.com/app/agentforlife';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.danielroberts.agentforlife';
const APP_NOT_FOUND_DETECT_MS = 1500;

export default function PairBridgePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [appNotFound, setAppNotFound] = useState(false);
  const detectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!code || typeof window === 'undefined') return;
    const url = `agentforlife://pair/${encodeURIComponent(code)}`;

    // Fire the custom-scheme redirect after a frame so the page has a
    // chance to paint. iOS sometimes buries the prompt under the load.
    const launchTimer = window.setTimeout(() => {
      window.location.href = url;
    }, 50);

    // Detection: if the app opens, the tab backgrounds (visibilityState
    // becomes 'hidden') almost immediately. If after ~1.5s we're still
    // visible, the app didn't open.
    detectTimerRef.current = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setAppNotFound(true);
      }
    }, APP_NOT_FOUND_DETECT_MS);

    // If visibility flips to hidden, the app opened — cancel the
    // "not found" detection so we don't flash the wrong UI on return.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && detectTimerRef.current !== null) {
        window.clearTimeout(detectTimerRef.current);
        detectTimerRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(launchTimer);
      if (detectTimerRef.current !== null) {
        window.clearTimeout(detectTimerRef.current);
        detectTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [code]);

  const manualLink = `agentforlife://pair/${encodeURIComponent(code || '')}`;

  // ── App-not-installed state ── (after detection timeout)
  if (appNotFound) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.iconCircle}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0D4D4D" strokeWidth="2">
              <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 style={styles.title}>Install Agent for Life first</h1>
          <p style={styles.body}>
            Looks like the app isn’t on this phone yet. Install it from the App Store, then
            come back and scan the QR again — it’ll work the moment it’s installed.
          </p>
          <a href={APP_STORE_URL} style={styles.primaryButton}>
            Get it on the App Store
          </a>
          <a href={PLAY_STORE_URL} style={styles.secondaryLink}>
            Or get it on Google Play
          </a>
          <p style={styles.divider}>Already installed?</p>
          <a href={manualLink} style={styles.tertiaryLink}>
            Tap here to open Agent for Life
          </a>
        </div>
      </div>
    );
  }

  // ── Default state — "opening the app..." ──
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Opening Agent for Life…</h1>
        <p style={styles.body}>
          You’ll be redirected to the app in a second.
        </p>
        <a href={manualLink} style={styles.primaryButton}>
          Open Agent for Life
        </a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D4D4D',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    maxWidth: 360,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f4f9f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0D4D4D',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
    lineHeight: 1.5,
  },
  primaryButton: {
    display: 'inline-block',
    backgroundColor: '#0D4D4D',
    color: '#ffffff',
    padding: '14px 24px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    textDecoration: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  secondaryLink: {
    display: 'block',
    marginTop: 12,
    color: '#0D4D4D',
    fontSize: 14,
    textDecoration: 'underline',
  },
  divider: {
    marginTop: 28,
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  tertiaryLink: {
    color: '#0D4D4D',
    fontSize: 14,
    textDecoration: 'underline',
  },
};
