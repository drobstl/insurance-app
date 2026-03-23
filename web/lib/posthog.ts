'use client';

import posthog from 'posthog-js';
import type { AnalyticsEventName, AnalyticsEventProperties } from './analytics-events';

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

export function initPostHog(): void {
  if (typeof window === 'undefined' || hasInitialized) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  const config = {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
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
