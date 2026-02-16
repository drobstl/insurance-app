import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = 'message' | 'anniversary' | 'birthday' | 'holiday';

export interface AgentNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  holiday?: string;
  includeBookingLink?: boolean;
  sentAt: Timestamp;
  readAt: Timestamp | null;
  status: 'sent' | 'failed';
}

// ── Firestore Helpers ────────────────────────────────────────────────────────

/**
 * Subscribe to unread notifications for a specific client.
 * Returns the unsubscribe function.
 */
export function subscribeToUnreadNotifications(
  agentId: string,
  clientId: string,
  onNotifications: (notifications: AgentNotification[]) => void,
  onError?: (error: Error) => void,
) {
  const notificationsRef = collection(
    db,
    'agents',
    agentId,
    'clients',
    clientId,
    'notifications',
  );

  // Fetch recent notifications and filter for unread client-side.
  // This avoids needing a Firestore composite index on readAt + sentAt.
  const q = query(
    notificationsRef,
    orderBy('sentAt', 'desc'),
    limit(20),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notifications = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as AgentNotification)
        .filter((n) => !n.readAt)
        .slice(0, 10);
      onNotifications(notifications);
    },
    (error) => {
      console.error('Error subscribing to notifications:', error);
      onError?.(error);
    },
  );
}

/**
 * Mark a notification as read by setting the `readAt` timestamp.
 */
export async function markNotificationAsRead(
  agentId: string,
  clientId: string,
  notificationId: string,
): Promise<void> {
  const notifRef = doc(
    db,
    'agents',
    agentId,
    'clients',
    clientId,
    'notifications',
    notificationId,
  );
  await updateDoc(notifRef, { readAt: Timestamp.now() });
}
