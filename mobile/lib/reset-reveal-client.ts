import { API_BASE } from './api-base';

/** Mirrors the server's ResetRevealData (web/lib/reset-reveal.ts). */
export interface ResetRevealData {
  firstName: string;
  agentFirstName: string;
  agentPhotoBase64: string;
  mortgageBalance: number | null;
  monthlyPayment: number | null;
  hasRealNumbers: boolean;
  schedulingUrl: string;
}

export type ResetRevealEvent = 'shown' | 'dismissed' | 'engaged';

/**
 * Ask the server whether to show the reveal right now. The server owns
 * eligibility + cadence, so the app just renders whatever comes back. Returns
 * the reveal data when it should show, or null otherwise. Best-effort.
 */
export async function fetchResetRevealDecision(clientCode: string): Promise<ResetRevealData | null> {
  if (!clientCode) return null;
  try {
    const res = await fetch(`${API_BASE}/api/mobile/reset-reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientCode }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.show === true && data.reveal ? (data.reveal as ResetRevealData) : null;
  } catch {
    return null;
  }
}

/**
 * Record that the reveal was shown / dismissed / engaged. Drives the cadence
 * (so it stays an event, not a nag) and, on 'engaged', the agent-side nudge.
 * Best-effort, fire-and-forget.
 */
export async function recordResetRevealEvent(clientCode: string, event: ResetRevealEvent): Promise<void> {
  if (!clientCode) return;
  try {
    await fetch(`${API_BASE}/api/mobile/reset-reveal/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientCode, event }),
    });
  } catch {
    // best-effort — never block or surface
  }
}
