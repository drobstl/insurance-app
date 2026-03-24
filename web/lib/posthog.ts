'use client';

import posthog from 'posthog-js';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from './analytics-events';

const clientPiiKeyPattern = /(client.*(name|email|phone)|policy.*number|ssn)/i;

let hasInitialized = false;

type EventValue = string | number | boolean | null | undefined;
type EventProperties = Record<string, EventValue>;

function sanitizeEventProperties(props?: EventProperties): EventProperties | undefined {
  if (!props) return undefined;
  const safe: EventProperties = {};

  Object.entries(props).forEach(([key, value]) => {
    if (!clientPiiKeyPattern.test(key)) {
      safe[key] = value;
    }
  });

  return safe;
}

function markSessionRiskSignal(eventName: AnalyticsEventName): void {
  if (typeof window === 'undefined') return;
  try {
    if (
      eventName === ANALYTICS_EVENTS.API_REQUEST_FAILED ||
      eventName === ANALYTICS_EVENTS.ACTION_FAILED
    ) {
      window.sessionStorage.setItem('afl_session_had_error', '1');
    }
    if (eventName === ANALYTICS_EVENTS.EMPTY_STATE_SEEN) {
      window.sessionStorage.setItem('afl_session_saw_empty_state', '1');
    }
    if (
      eventName === ANALYTICS_EVENTS.API_REQUEST_FAILED ||
      eventName === ANALYTICS_EVENTS.ACTION_FAILED ||
      eventName === ANALYTICS_EVENTS.EMPTY_STATE_SEEN
    ) {
      window.sessionStorage.setItem('afl_session_last_risk_signal_at', String(Date.now()));
    }
  } catch {
    // no-op if sessionStorage is unavailable
  }
}

export function initPostHog(): void {
  if (typeof window === 'undefined' || hasInitialized) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;
  const configuredHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const resolvedApiHost =
    !configuredHost || configuredHost.includes('posthog.com')
      ? '/ingest'
      : configuredHost;

  const config = {
    api_host: resolvedApiHost,
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    capture_dead_clicks: true,
    enable_recording: true,
    enable_heatmaps: true,
  } as unknown as Parameters<typeof posthog.init>[1];

  posthog.init(apiKey, config);

  hasInitialized = true;
}

export function captureEvent<T extends AnalyticsEventName>(
  eventName: T,
  properties?: AnalyticsEventProperties<T>,
): void {
  if (typeof window === 'undefined') return;
  initPostHog();
  markSessionRiskSignal(eventName);
  posthog.capture(eventName, sanitizeEventProperties(properties as EventProperties | undefined));
}

export function identifyAgent(distinctId: string, properties?: EventProperties): void {
  if (typeof window === 'undefined') return;
  initPostHog();
  posthog.identify(distinctId, sanitizeEventProperties(properties));
}

export function resetPostHog(): void {
  if (typeof window === 'undefined') return;
  initPostHog();
  posthog.reset();
}