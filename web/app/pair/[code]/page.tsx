'use client';

import { useEffect, useState, use } from 'react';

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
 * Failure modes covered:
 *   - App not installed → custom scheme silently fails, nothing
 *     happens. The visible "Open Agent for Life" button + install
 *     instructions handle this without a confusing dead-end.
 *   - Auto-redirect blocked by browser → button below is the manual
 *     escape hatch.
 *   - Code expired / already used → app shows the error after exchange.
 *     We don't validate here; the bridge is dumb on purpose.
 */
export default function PairBridgePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (!code) return;
    const url = `agentforlife://pair/${encodeURIComponent(code)}`;
    // Use a setTimeout so the page has a frame to render before iOS
    // shows the "Open in..." confirmation. Without this delay, some
    // iOS versions bury the prompt under the loading state.
    const t = window.setTimeout(() => {
      window.location.href = url;
      setRedirected(true);
    }, 50);
    return () => window.clearTimeout(t);
  }, [code]);

  const manualLink = `agentforlife://pair/${encodeURIComponent(code || '')}`;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Opening Agent for Life…</h1>
        <p style={styles.body}>
          {redirected
            ? 'If the app didn’t open, tap the button below.'
            : 'You’ll be redirected to the app in a second.'}
        </p>
        <a href={manualLink} style={styles.button}>
          Open Agent for Life
        </a>
        <p style={styles.helper}>
          Don’t have the app yet?{' '}
          <a
            style={styles.link}
            href="https://apps.apple.com/app/agentforlife"
          >
            Install it
          </a>
          , then scan the QR again.
        </p>
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
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0D4D4D',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
    lineHeight: 1.5,
  },
  button: {
    display: 'inline-block',
    backgroundColor: '#0D4D4D',
    color: '#ffffff',
    padding: '14px 24px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    textDecoration: 'none',
  },
  helper: {
    fontSize: 13,
    color: '#888',
    marginTop: 24,
    lineHeight: 1.5,
  },
  link: {
    color: '#0D4D4D',
    textDecoration: 'underline',
  },
};
