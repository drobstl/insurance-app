'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy redirect: /subscribe → /pricing.
 *
 * Track C (May 10, 2026) replaced the single-tier post-auth
 * checkout page with the public /pricing surface. Existing
 * post-signup links and the Stripe checkout `cancel_url` were
 * updated to point at /pricing directly; this stub catches any
 * stragglers (bookmarks, in-flight emails, the older signup
 * flow) and forwards them.
 */
export default function LegacySubscribeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pricing');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-[#5f5f5f]">
      Redirecting…
    </div>
  );
}
