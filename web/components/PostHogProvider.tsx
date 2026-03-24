'use client';

import { Suspense, useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PostHogReactProvider } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureEvent, initPostHog } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

const DASHBOARD_LOAD_SLOW_THRESHOLD_MS = 4000;

type InstrumentedWindow = Window & {
  __aflFetchWrapped?: boolean;
  __aflOriginalFetch?: typeof window.fetch;
};

function toPathname(urlLike: string): string {
  try {
    return new URL(urlLike, window.location.origin).pathname;
  } catch {
    return urlLike;
  }
}

function toMethod(init?: RequestInit, request?: Request): string {
  return (init?.method || request?.method || 'GET').toUpperCase();
}

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
    window.sessionStorage.setItem('afl_session_started_at', String(Date.now()));
    window.sessionStorage.removeItem('afl_dashboard_exit_recorded');

    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigationEntry && window.location.pathname.startsWith('/dashboard')) {
      const loadTimeMs = Math.round(
        navigationEntry.domContentLoadedEventEnd || navigationEntry.loadEventEnd || 0,
      );
      if (loadTimeMs >= DASHBOARD_LOAD_SLOW_THRESHOLD_MS) {
        captureEvent(ANALYTICS_EVENTS.DASHBOARD_LOAD_SLOW, {
          path: window.location.pathname,
          load_time_ms: loadTimeMs,
          threshold_ms: DASHBOARD_LOAD_SLOW_THRESHOLD_MS,
        });
      }
    }

    const instrumentedWindow = window as InstrumentedWindow;
    if (!instrumentedWindow.__aflFetchWrapped) {
      const originalFetch = window.fetch.bind(window);
      instrumentedWindow.__aflOriginalFetch = originalFetch;

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const startedAt = performance.now();
        const rawUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        const request = input instanceof Request ? input : undefined;
        const endpoint = toPathname(rawUrl);
        const method = toMethod(init, request);
        const shouldTrackApi = endpoint.startsWith('/api') && !endpoint.includes('/api/posthog/');

        try {
          const response = await originalFetch(input, init);
          if (shouldTrackApi && !response.ok) {
            captureEvent(ANALYTICS_EVENTS.API_REQUEST_FAILED, {
              endpoint,
              status_code: response.status,
              duration_ms: Math.round(performance.now() - startedAt),
              method,
            });
          }
          return response;
        } catch (error) {
          if (shouldTrackApi) {
            captureEvent(ANALYTICS_EVENTS.API_REQUEST_FAILED, {
              endpoint,
              status_code: 0,
              duration_ms: Math.round(performance.now() - startedAt),
              method,
            });
          }
          throw error;
        }
      };

      instrumentedWindow.__aflFetchWrapped = true;
    }

    const maybeCaptureExitRisk = () => {
      if (!window.location.pathname.startsWith('/dashboard')) return;
      if (window.sessionStorage.getItem('afl_dashboard_exit_recorded') === '1') return;

      const startedAt = Number(window.sessionStorage.getItem('afl_session_started_at') || Date.now());
      const sessionDurationMs = Math.max(0, Date.now() - startedAt);
      const hadError = window.sessionStorage.getItem('afl_session_had_error') === '1';
      const sawEmptyState = window.sessionStorage.getItem('afl_session_saw_empty_state') === '1';

      if (hadError) {
        captureEvent(ANALYTICS_EVENTS.DASHBOARD_EXIT_AFTER_ERROR, {
          path: window.location.pathname,
          session_duration_ms: sessionDurationMs,
        });
      }

      if (sawEmptyState) {
        captureEvent(ANALYTICS_EVENTS.DASHBOARD_EXIT_AFTER_EMPTY_STATE, {
          path: window.location.pathname,
          session_duration_ms: sessionDurationMs,
        });
      }

      if (hadError || sawEmptyState) {
        captureEvent(ANALYTICS_EVENTS.CHURN_RISK_FLAGGED, {
          path: window.location.pathname,
          risk_reason: hadError && sawEmptyState ? 'error_and_empty_state' : hadError ? 'error' : 'empty_state',
          session_duration_ms: sessionDurationMs,
        });
      }

      window.sessionStorage.setItem('afl_dashboard_exit_recorded', '1');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        maybeCaptureExitRisk();
      }
    };

    window.addEventListener('pagehide', maybeCaptureExitRisk);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let distinctId = window.localStorage.getItem('afl_posthog_distinct_id');
    if (!distinctId) {
      distinctId = `afl-${crypto.randomUUID()}`;
      window.localStorage.setItem('afl_posthog_distinct_id', distinctId);
    }

    captureEvent(ANALYTICS_EVENTS.POSTHOG_CLIENT_BOOT, {
      path: window.location.pathname,
    });

    // Backend heartbeat ensures we still record usage even if browser-side tracking
    // gets suppressed by extension/privacy/network behavior.
    void fetch('/api/posthog/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distinct_id: distinctId,
        path: window.location.pathname,
      }),
    }).catch(() => {});

    return () => {
      window.removeEventListener('pagehide', maybeCaptureExitRisk);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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