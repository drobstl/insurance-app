# AgentForLife

Insurance agent SaaS platform with AI-powered client retention, referral automation, and policy rewrite alerts.

## Architecture

- **`web/`** — Next.js 16 web app (agent dashboard, marketing site, 39+ API routes). Uses npm.
- **`mobile/`** — React Native / Expo SDK 54 mobile app (client-facing). Uses npm.
- Both share a Firebase backend (Firestore, Auth, Storage) — no local database.

## Cursor Cloud specific instructions

### Running services

- **Web dev server**: `cd web && npm run dev` — starts on port 3000. No `.env.local` is needed to serve pages; env vars are only required when specific API routes are called (Stripe, Firebase Admin, Anthropic, Resend, Linq).
- **Mobile (Expo)**: `cd mobile && npx expo start --web` for web preview, or `npx expo export --platform web` to verify the build. Native iOS/Android builds require EAS Cloud or a macOS host.

### Lint

- Web: `cd web && npx eslint .` — pre-existing warnings/errors in the codebase (unescaped entities, unused vars, hook deps).
- Mobile: `cd mobile && npx expo lint` — warnings only.

### Key env vars for full API functionality

See `OPERATIONS.md` for the complete list. The most critical are:
`FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `LINQ_API_TOKEN`, `LINQ_PHONE_NUMBER`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`.

### Gotchas

- Firebase client config is hardcoded in `web/firebase.ts` and `mobile/firebase.ts` (public API keys, not secrets).
- `web/lib/env-check.ts` defines `validateServerEnv()` but it is **not** auto-called at startup — only invocable manually.
- The `canvas` npm package in the mobile app may emit native compilation warnings during install on Linux; these are safe to ignore for web-only development.
- Next.js 16 uses Turbopack by default in dev mode; HMR is fast but initial compile of large pages can take ~2s.
