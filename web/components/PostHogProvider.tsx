'use client';

import { Suspense, useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PostHogReactProvider } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureEvent, initPostHog } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;

    initPostHog();
    const query = searchParams?.toString();
    const currentUrl = `${window.location.origin}${pathname}${query ? `?${query}` : ''}`;

    posthog.capture('$pageview', {
      $current_url: currentUrl,
    });
  }, [pathname, searchParams]);

  return null;
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
    captureEvent(ANALYTICS_EVENTS.POSTHOG_CLIENT_BOOT, {
      path: window.location.pathname,
    });
  }, []);

  return (
    <PostHogReactProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PostHogReactProvider>
  );
}
