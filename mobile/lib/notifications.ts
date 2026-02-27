// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = 'message' | 'anniversary' | 'birthday' | 'holiday';

export interface AgentNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  holiday?: string;
  includeBookingLink?: boolean;
  sentAt: string | null;
  readAt: string | null;
  status: 'sent' | 'failed';
}

const API_BASE = __DEV__ ? 'http://192.168.1.210:3000' : 'https://agentforlife.app';

// ── API Helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch unread notifications for a client via server API, then call the
 * callback. Starts polling every 30 seconds. Returns a cleanup function
 * that stops polling (mirrors the old onSnapshot unsubscribe pattern).
 */
export function subscribeToUnreadNotifications(
  agentId: string,
  clientId: string,
  onNotifications: (notifications: AgentNotification[]) => void,
  onError?: (error: Error) => void,
  clientCode?: string,
): () => void {
  let active = true;

  const poll = async () => {
    if (!active || !clientCode) return;
    try {
      const qs = `agentId=${agentId}&clientId=${clientId}&clientCode=${encodeURIComponent(clientCode)}`;
      const res = await fetch(`${API_BASE}/api/mobile/notifications?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (active) onNotifications(data.notifications ?? []);
    } catch (err) {
      if (active) onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  poll();
  const interval = setInterval(poll, 30_000);

  return () => {
    active = false;
    clearInterval(interval);
  };
}

/**
 * Mark a notification as read via server API.
 */
export async function markNotificationAsRead(
  agentId: string,
  clientId: string,
  notificationId: string,
  clientCode?: string,
): Promise<void> {
  if (!clientCode) return;
  const res = await fetch(`${API_BASE}/api/mobile/notifications/mark-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, clientId, clientCode, notificationId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}
