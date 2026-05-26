/**
 * Shared platform detection + `sms:` URL helpers for the agent welcome
 * compose UX.
 *
 * Used by both:
 * - The inline compose surface in the create-client flow
 *   (`web/app/dashboard/clients/page.tsx`, Mode 1 real-time per
 *   `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` §4.1)
 * - The welcome action item card in the queue page
 *   (`web/components/WelcomeActionItemCard.tsx`, Mode 1 recovery
 *   today + Mode 2 bulk drip working surface when bulk import
 *   re-enables)
 *
 * Both surfaces share IDENTICAL platform-detection logic and `sms:`
 * URL construction. Only the surrounding visual layout differs (full-
 * screen modal stage vs compact list-item card), so the per-surface
 * UI lives in each component while the underlying logic lives here.
 *
 * Limitation: from a desktop browser we can detect the desktop OS but
 * NOT the paired phone. So we know "this is a Mac" but can't tell
 * Mac+iPhone (Continuity works) from Mac+Android (Continuity doesn't
 * exist). The compose surfaces always render Copy and QR alongside
 * Send so the (~10–20%) of agents on unsupported combos have a
 * working escape hatch without us needing a setup question during
 * onboarding.
 */

export type AgentPlatform =
  | 'mac'
  | 'windows'
  | 'ios'
  | 'android'
  | 'linux'
  | 'chromeos'
  | 'unknown';

export function detectAgentPlatform(): AgentPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  // Mobile UA strings can contain desktop hints — check mobile first.
  if (/iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua)) return 'ios';
  // iPadOS 13+ identifies as MacIntel; sniff the touch hint.
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Mac OS X|Macintosh/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'unknown';
}

/**
 * Build an `sms:` URL for the agent's current device. Used when the
 * user clicks/taps a "Send via iMessage / Messages" button — the URL
 * fires from the agent's browser, so the form has to match what the
 * agent's desktop OS expects.
 *
 * iOS / macOS canonical form uses `&body=`; Android / Phone Link
 * canonical form uses `?body=`. macOS Continuity routes through the
 * paired iPhone so we use the iOS form there.
 */
export function buildSmsUrlForPlatform(phone: string, body: string, platform: AgentPlatform): string {
  const phoneClean = phone.trim();
  const bodyEncoded = encodeURIComponent(body);
  const useAmp = platform === 'ios' || platform === 'mac';
  const separator = useAmp ? '&' : '?';
  return `sms:${phoneClean}${separator}body=${bodyEncoded}`;
}

/**
 * Build the payload for QR-code encoding. Uses the legacy
 * `SMSTO:NUMBER:BODY` format rather than RFC 5724 `sms:?body=`.
 *
 * Why: Samsung's stock Camera / Bixby Vision scanner on One UI does
 * not recognize `sms:NUMBER?body=...` as an SMS intent — it sees a
 * QR, decodes the text, and offers nothing actionable, which looks
 * to the agent like the QR "isn't picked up." `SMSTO:` is the
 * de-facto QR standard that virtually every Android scanner (and
 * iOS Camera) routes to the default messaging app, including
 * Samsung's. Body is literal text after the second colon — no URL
 * encoding.
 */
export function buildSmsUrlForQr(phone: string, body: string): string {
  const phoneClean = phone.trim();
  return `SMSTO:${phoneClean}:${body}`;
}

/**
 * True iff the platform reliably supports firing `sms:` URLs from a
 * browser to the OS messaging app. Linux + ChromeOS have no reliable
 * `sms:` handler; 'unknown' is also treated as unsupported so we fail
 * safe rather than firing a URL that does nothing.
 *
 * On supported platforms the compose surface still renders Copy and
 * QR alongside Send so an agent on Mac+Android (where Mac is reported
 * supported but the actual sms: handler routes to a non-existent
 * iPhone) has a working alternative.
 */
export function platformSupportsInlineSend(platform: AgentPlatform): boolean {
  return platform === 'mac'
    || platform === 'windows'
    || platform === 'ios'
    || platform === 'android';
}

/** True iff the agent is browsing from a phone. Used to hide the QR
 * code (scanning a QR on the same phone showing it makes no sense)
 * and to adjust copy that says things like "scan with your phone." */
export function platformIsMobile(platform: AgentPlatform): boolean {
  return platform === 'ios' || platform === 'android';
}

/**
 * Device-aware label for the primary Send button. The label varies so
 * the agent's expectation matches what'll actually open.
 */
export function getSendButtonLabel(platform: AgentPlatform): string {
  switch (platform) {
    case 'mac': return 'Send via iMessage';
    case 'windows': return 'Send via Messages';
    case 'ios':
    case 'android': return 'Open Messages';
    default: return 'Send welcome text';
  }
}

/**
 * Short caption explaining what the Send button will actually do on
 * the agent's current platform. Surfaced near the buttons so an agent
 * on Mac+Android (or any unsupported combo) understands why Copy or
 * QR is the path for them.
 */
export function getSendCaption(platform: AgentPlatform): string {
  switch (platform) {
    case 'mac':
      return 'Send opens iMessage on your Mac (routes through your iPhone via Continuity). If nothing happens, tap Copy or scan the QR.';
    case 'windows':
      return 'Send opens your default messaging app (Phone Link if paired with Android). If nothing happens, tap Copy or scan the QR.';
    case 'ios':
    case 'android':
      return 'Send opens Messages with everything pre-filled.';
    case 'linux':
    case 'chromeos':
    case 'unknown':
    default:
      return 'Tap Copy or scan the QR with your phone — your platform doesn\'t support direct send.';
  }
}
