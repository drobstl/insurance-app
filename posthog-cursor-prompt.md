# PostHog Integration for AgentForLife Web Dashboard

## Context

AFL is a Next.js App Router app. The web code lives in `web/`. Our users are independent insurance agents who use the AFL web dashboard to manage referrals, conservation, client relationships, and automated touchpoints. We just created a PostHog account and need to integrate the SDK for product analytics, session replay, and heatmaps so we can understand how agents use the dashboard and where they get stuck or drop off.

## Current Architecture (don't change these — integrate around them)

- **Root layout:** `web/app/layout.tsx` — currently has no provider wrappers, just `{children}` inside `<body>`. The layout uses Montserrat font via `next/font/google`.
- **Firebase auth:** `web/firebase.ts` exports `auth` via `getAuth(app)`. This is how we identify agents.
- **Lib folder:** `web/lib/` exists and is where utility modules live.
- **Hooks folder:** `web/hooks/` exists.
- **Components folder:** `web/components/` exists.

## Environment Variables

Add these to `.env.local`:
```
NEXT_PUBLIC_POSTHOG_KEY=<our project API key>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## What to Build

### 1. PostHog Client Module (`web/lib/posthog.ts`)

Create a singleton PostHog client initialization module. Configure with:
- `api_host` from env var
- `capture_pageview: false` (we handle manually for App Router)
- `capture_pageleave: true`
- `enable_recording: true` (session replay)
- `enable_heatmaps: true`

### 2. PostHog Provider (`web/components/PostHogProvider.tsx`)

Create a `'use client'` provider component that:
- Initializes PostHog on mount
- Wraps children in `PostHogProvider` from `posthog-js/react`
- Includes a `PostHogPageView` child component that uses `usePathname()` and `useSearchParams()` from `next/navigation` to fire `posthog.capture('$pageview')` on every route change

### 3. Wire into Root Layout (`web/app/layout.tsx`)

Wrap `{children}` in the new PostHog provider. Keep everything else (Montserrat font, metadata, etc.) exactly as-is. The provider must be a client component wrapping the server layout's children.

### 4. Agent Identification

Find where Firebase auth state is observed in the app (look for `onAuthStateChanged` or equivalent). When an agent is authenticated, call `posthog.identify()` with:
- **distinct_id:** Firebase `user.uid`
- **properties:** `email`, `displayName`, and any agent profile data available (agency name, subscription tier, signup date)

On logout, call `posthog.reset()`.

If there's a central auth hook or context already in the codebase, add the PostHog identify/reset calls there rather than creating a new listener.

### 5. Custom Event Tracking

Search the codebase for the features below and add `posthog.capture()` calls at the appropriate points. Use the event names exactly as listed. Include relevant properties (but NEVER include client PII — no client names, emails, phone numbers, or policy numbers).

**Referrals:**
- `referral_created` — when an agent creates a new referral
- `referral_link_shared` — when a referral link is copied or shared

**Conservation:**
- `conservation_alert_viewed` — when an agent views a conservation alert
- `conservation_call_initiated` — when an agent starts a conservation call/outreach

**Policy Reviews:**
- `policy_review_started` — when an agent starts a policy review
- `policy_review_completed` — when a policy review is finished

**AI Voice:**
- `ai_voice_call_started` — when an AI voice interaction begins
- `ai_voice_call_completed` — when it finishes (include `call_duration_seconds` and `call_type` as properties)

**Client Management:**
- `client_added` — when an agent adds a client (include `method`: manual, csv_import, pdf_parse, book_of_business)
- `client_removed` — when a client is removed

**Anniversary Rewrites:**
- `anniversary_rewrite_initiated` — when an agent triggers an anniversary rewrite outreach

**Onboarding:**
- `onboarding_step_completed` — if there's an onboarding flow, track each step (include `step_name` property)

**Settings:**
- `settings_updated` — when agent updates their profile/settings (include `setting_changed` property)

**Dashboard AI (Patch):**
- `patch_conversation_started` — when an agent opens a Patch chat
- `patch_message_sent` — when an agent sends a message to Patch

### 6. Install Packages

```bash
npm install posthog-js
```

Check if `@posthog/nextjs` is needed or if `posthog-js/react` is sufficient for the provider. Use whichever is the current recommended approach.

### 7. Next.js Config

If `posthog-js` needs to be added to `transpilePackages` in `next.config.ts`, do so.

## Important Rules

- All PostHog code must only run client-side (`'use client'` directive where needed)
- Don't break any existing functionality
- Don't remove or modify Firebase Analytics — PostHog runs alongside it
- Never send client PII (names, emails, phone numbers, policy numbers, SSNs) in event properties. Agent info is fine.
- Keep the implementation clean — minimal files, follow existing code patterns in the repo
