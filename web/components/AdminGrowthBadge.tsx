'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/**
 * Unread "new signups" badge for the admin nav. Self-contained: fetches
 * its own count from `/api/admin/growth?countOnly=1` (admin-gated) and
 * renders a small red pill when there are signups the admin hasn't viewed
 * yet. Renders nothing for non-admins (the API 403s) or when count is 0.
 *
 * The count clears when the admin opens /dashboard/admin/growth (that page
 * POSTs a "viewed" timestamp).
 */
export default function AdminGrowthBadge({ user }: { user: User | null }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/growth?countOnly=1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { unreadCount?: number };
        if (!cancelled) setCount(json.unreadCount ?? 0);
      } catch {
        /* best-effort — a failed lookup just hides the badge */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (count <= 0) return null;

  return (
    <span
      className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-bold leading-none shrink-0"
      title={`${count} new signup${count === 1 ? '' : 's'}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
