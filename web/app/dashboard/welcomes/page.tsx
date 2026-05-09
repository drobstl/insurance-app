'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy redirect: `/dashboard/welcomes` → `/dashboard/action-items?lane=welcome`.
 *
 * The welcomes-only page was replaced May 9, 2026 by the cross-lane
 * Action Items surface. Existing call sites (the inline compose
 * surface's "Skip — send later" link, the ClientDetailModal "View
 * queue" CTA) and any agent bookmarks land here and forward
 * automatically without breaking.
 */
export default function LegacyWelcomesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/action-items?lane=welcome');
  }, [router]);
  return (
    <div className="min-h-screen pt-16 md:pt-6 px-4">
      <p className="text-sm text-[#5f5f5f]">Redirecting…</p>
    </div>
  );
}
