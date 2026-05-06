# AgentForLife Operations Guide

> **IMPORTANT**: Keep this file private. Do not commit sensitive credentials.
> This documents the services and accounts that power AgentForLife.

## Quick Links

| Service | URL | Purpose |
|---------|-----|---------|
| Firebase Console | https://console.firebase.google.com/project/insurance-agent-app-6f613 | Database, Auth, Storage |
| Vercel Dashboard | https://vercel.com/agent-for-life | Web hosting & deployments |
| Stripe Dashboard | https://dashboard.stripe.com | Payments & subscriptions |
| GitHub Repo | https://github.com/drobstl/insurance-app | Source code |

## Account Ownership

| Service | Primary Account | Backup Account |
|---------|-----------------|----------------|
| Firebase | deardanielroberts@gmail.com | (ADD A BACKUP!) |
| Vercel | (your vercel email) | - |
| Stripe | (your stripe email) | - |

## Critical Services

### Firebase (insurance-agent-app-6f613)
- **Project ID**: `insurance-agent-app-6f613`
- **Region**: (check in Firebase console)
- **Services Used**: Firestore, Authentication, Storage

**Firestore Collections**:
- `agents` - Agent profiles and settings
- `agents/{agentId}/clients` - Client data with unique codes
- `agents/{agentId}/clients/{clientId}/notifications` - Client notification cards (holiday, birthday, messages)
- `agents/{agentId}/policies` - Policy information

**Security Rules**: Updated 2026-02-15 (no expiration)

### Vercel (agent-for-life)
- **Production URL**: https://agentforlife.app
- **Auto-deploys from**: `main` branch

**Environment Variables Required**:
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `STRIPE_PRICE_ID_MONTHLY` - Monthly subscription price ID
- `STRIPE_PRICE_ID_ANNUAL` - Annual subscription price ID
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `NEXT_PUBLIC_APP_URL` - https://agentforlife.app
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` - Firebase Admin service account (base64 JSON). Also used for Cloud Tasks auth and webhook secret derivation.
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude (PDF extraction, AI conversations)
- `CLOUD_TASKS_PROJECT_ID` - GCP project ID (`insurance-agent-app-6f613`)
- `CLOUD_TASKS_LOCATION` - Cloud Tasks queue region (`us-central1`)
- `CLOUD_TASKS_QUEUE` - Cloud Tasks queue name (`pdf-ingestion-v3`)
- `INGESTION_V3_PROCESSOR_BASE_URL` - Base URL for task callbacks (`https://agentforlife.app`)
- `LINQ_PHONE_NUMBER` - Pooled Linq line phone number (E.164, e.g. `+15555551234`). Read by `getLinqPhoneNumber()` in `web/lib/linq.ts`; per-agent override possible via `agents/{agentId}.linqPhoneNumber`.
- `LINQ_OUTBOUND_DISABLED` (optional kill switch) - Set to `"true"` to halt every outbound call into Linq's API at the lib layer (`createChat`, `sendMessage`, `uploadAttachment`, `shareContactCard`). Inbound webhook handling and signature verification are intentionally NOT gated. Three crons (`conservation-outreach`, `referral-drip`, `policy-review-drip`) switch to drain mode while paused: due alerts/referrals are stamped `linqPausedSkippedAt` instead of being sent, so the backlog never queues up to replay on resume. See commit `e017d55`.

**Phase 1 Track B (Welcome flow + PWA + Web Push) env vars** — added May 5–6, 2026:
- `WEB_PUSH_VAPID_PUBLIC_KEY` - base64-url VAPID public key for agent-side Web Push.
- `WEB_PUSH_VAPID_PRIVATE_KEY` - base64-url VAPID private key.
- `WEB_PUSH_VAPID_SUBJECT` - `mailto:` address or HTTPS URL identifying the application (e.g. `mailto:daniel@brainstormlabs.co`).
- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` - SAME value as `WEB_PUSH_VAPID_PUBLIC_KEY`, exposed to the browser for `pushManager.subscribe(applicationServerKey)`.

To generate keys (one-time, local machine):
```bash
cd web
npx web-push generate-vapid-keys
```
Output gives you `Public Key:` (use for both `WEB_PUSH_VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`) and `Private Key:` (use for `WEB_PUSH_VAPID_PRIVATE_KEY`).

Add all four to Vercel via Project → Settings → Environment Variables, then redeploy. Without these set, `sendAgentWebPush` (in `web/lib/web-push-lifecycle.ts`) logs `[web-push-lifecycle] VAPID not configured` and returns zero attempts — the welcome queue still works (cards still render, agents can still tap "Send from my phone"), agents just don't get the phone notification when a welcome lands.

### Stripe
- **Webhook Endpoint**: https://agentforlife.app/api/webhooks/stripe
- **Products**: Monthly ($9.99/mo), Annual ($100/yr)

## Health Monitoring

**Health Check Endpoint**: https://agentforlife.app/api/health
**Ingestion Signing Check**: https://agentforlife.app/api/health/ingestion-signing

Set up monitoring with a free service:
1. Go to https://uptimerobot.com (free tier)
2. Create account
3. Add new monitor:
   - Monitor Type: HTTP(s)
   - URL: https://agentforlife.app/api/health
   - Monitoring Interval: 5 minutes
4. Set up alert contacts (your email/phone)

### Ingestion Upload Alerting (NEW)

The application upload path now emits structured alert logs and a canary check:

- **Cron canary**: `/api/cron/ingestion-signing-canary` runs every 15 minutes (configured in `web/vercel.json`)
- **On-demand health check**: `/api/health/ingestion-signing` returns `503` when signed upload is broken
- **Alert log marker**: `[ingestion-v3-alert]` in Vercel logs

Where to see alerts:
1. **Vercel Dashboard → Project → Observability → Logs**
2. Filter for: `ingestion-v3-alert`
3. You will see fields like:
   - `errorCode=SIGNATURE_MISMATCH`
   - `errorCode=INVALID_JWT_SIGNATURE`
   - `stage=cors_config|generate_signed_url|signed_put`

Recommended monitor setup:
1. Add an UptimeRobot/Better Uptime monitor for `https://agentforlife.app/api/health/ingestion-signing`
2. Alert if HTTP status is not `200`
3. Keep interval at 5 minutes
4. Add SMS + email escalation for this monitor

## Phase 1 Track B — Welcome flow + PWA + Web Push (shipped May 5–6, 2026)

> Source-of-truth: `CONTEXT.md > Channel Rules > The two-step welcome flow`. Code: commits `a1e1d06`, `99e134f`, `55ab665`, `9bc9025`. Architecture rule: mobile-only on agent side; no desktop send fallback; PWA + Web Push as HARD onboarding gates; client Activate is a HARD gate to the rest of the mobile app.

### What it ships

| Surface | Location | Purpose |
|---------|----------|---------|
| Welcomes queue page | `/dashboard/welcomes` | Agent's mobile-first action item queue (oldest first, color-shift age affordances). Desktop is read-only; mobile installed PWA shows the one-tap "Send from my phone" sms: anchor. |
| `actionItems` collection | `agents/{agentId}/actionItems/{itemId}` | Forward-compat across welcome / anniversary / retention / referral lanes (`web/lib/action-item-types.ts`). Phase 1 writes ONLY welcome entries. |
| Welcome action item writer | `web/lib/welcome-action-item-writer.ts` | Idempotent on `welcome:{clientId}`. Queued at "create profile" UI action; refreshed in place on profile edit. |
| 30-day expiration cron | `/api/cron/welcome-action-item-expiry` (daily 16:00 UTC) | Lane-agnostic; expires overdue items per-lane. |
| Linq webhook welcome-activation handler | `web/lib/welcome-activation-handler.ts` | Detects activation inbound via byPhone placeholder + clientCode regex (defense in depth); sends first response with vCard MMS; tracks thumbs-up reciprocity. Independent of `THREAD_ROUTER_ENABLED`. |
| vCard generation | `web/lib/vcard.ts` + `web/lib/agent-vcard-store.ts` | RFC 2426 vCard 3.0 with embedded compressed photo. Source-fingerprint cache; regenerated on agent name/photo/agency change via `/api/agent/vcard/regenerate`. |
| Agent-side PWA + Web Push | `web/public/manifest.webmanifest` + `web/public/sw.js` + `web/lib/web-push-lifecycle.ts` + `web/components/PWAInstaller.tsx` | NEW infrastructure, separate from Track A's Expo client push. VAPID-keyed; multi-device subscription array; atomic invalidation on 404/410/403. |
| Two new HARD onboarding milestones | `OnboardingMilestones.pwaInstalled` + `.webPushGranted` | Skip Tutorial cannot bypass these. |
| Mobile Activate screen | `mobile/app/activate.tsx` | First screen after login for unactivated clients; HARD gate (no Skip button); composes pre-filled `sms:` outbound to Linq line per v3.1 §3.3. |

### Pre-deploy checklist

Run through this before pushing `main` to production:

1. **VAPID env vars set in Vercel** for all three environments (Production, Preview, Development).
   - Generate locally: `cd web && npx web-push generate-vapid-keys`.
   - Set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`.
   - Without these, the welcome queue still works but agent push notifications silently no-op.
2. **`LINQ_PHONE_NUMBER` set** (probably already is — verify). If unset, mobile Activate falls through to profile and agents see no welcome activation funnel.
3. **Firestore rules deployed.** New `actionItems` and `conversationThreads` rules are in `web/firestore.rules`. Run `firebase deploy --only firestore:rules` from the `web/` directory if rules aren't auto-deployed.
4. **Cron entries verified.** `web/vercel.json` declares `/api/cron/welcome-action-item-expiry` at `0 16 * * *`. Verify it appears in Vercel Project → Settings → Cron Jobs after deploy.
5. **Mobile app rebuild required for Activate screen.** Web changes deploy automatically via Vercel; the mobile React Native app needs `eas build` + App Store / Play Store resubmit. Agents who already have AFL installed will NOT see the Activate screen until they update. New downloads get it immediately.

### How to verify Web Push end-to-end (manual smoke test)

After VAPID env vars are set and a deploy lands:

1. Open `https://agentforlife.app/dashboard` on a phone (Chrome/Edge on Android, Safari on iOS 16.4+).
2. iOS: tap Share → **Add to Home Screen**. Android: dismiss the install prompt or tap **Install AFL on your phone** in the onboarding overlay.
3. Re-open AFL from the home screen icon (display-mode standalone). The onboarding overlay's `pwaInstalled` milestone should auto-flip to checked.
4. Tap **Allow phone notifications** in the overlay. iOS will prompt for permission; tap Allow.
5. Add a test client from the dashboard (`/dashboard/clients` → add manually with a phone number you control).
6. Agent should receive a push notification within 1–2 seconds: "New welcome to send — [Client] is ready for their welcome text — open AFL on your phone to send."
7. Tap the notification → opens `/dashboard/welcomes?welcome={clientId}` in the PWA → tap "Send from my phone" → iMessage opens with the welcome body pre-filled.

If step 6 fails: check Vercel logs for `[web-push-lifecycle]` lines. Most likely cause: VAPID env vars missing or mismatched across browser/server.

### How to verify Linq inbound activation (manual smoke test)

Requires `LINQ_OUTBOUND_DISABLED` to be `"false"` (or unset) for the vCard MMS reply to fire. Inbound activation funnel works regardless of the kill switch state.

1. After the welcome above is sent and the test client receives the SMS on their phone:
2. Have the test client download AFL, enter the client code from the SMS, and tap **Activate** on the gatekeeper screen.
3. Verify the test client's phone composes a pre-filled iMessage to the Linq line with the body `Hi [Agent], it's [Client] — I'm set up on the app!`. Send it.
4. Check Vercel logs for `[welcome-activation] activated` with the test client's `clientId`.
5. Check Firestore: `agents/{agentId}/clients/{clientId}.clientActivatedAt` should be a server timestamp.
6. Check the test client's phone for the agent's vCard MMS reply (only if Linq outbound is enabled).
7. Have the test client reply with 👍 — check Vercel logs for `[welcome-activation] thumbs_up_received`.

### Rollback procedures

The Track B build was designed for one-line rollback per Daniel's locked Q9 ("hard cutover, deprecate-not-delete"). If a critical bug surfaces post-deploy:

**Rollback the welcome queue (revert to legacy welcome-sms path):**
- Edit `web/app/dashboard/clients/page.tsx` (`handleManualCreateAndContinue` and `handleReviewConfirmAndCreate`): remove `void queueWelcomeActionItem(created.id)` lines. The welcome `addFlowStage` returns to the legacy "Send Welcome Text" UI.
- Edit `web/components/ClientDetailModal.tsx` (`handleSendCode`): restore the legacy `/api/client/welcome-sms` POST. The legacy route still exists with full implementation (just marked `@deprecated`).
- Redeploy. Welcome queue page still exists but no new entries are added.

**Rollback the mobile Activate gate (restore direct-to-profile after login):**
- Edit `mobile/app/index.tsx` (`navigateToProfile`): change the `shouldShowActivate` branch to `false` unconditionally, so all clients route to `/agent-profile` directly.
- `eas build` + resubmit to stores. Activate screen still exists but is unreachable.

**Disable agent Web Push without redeploying:**
- Unset `WEB_PUSH_VAPID_PUBLIC_KEY` (or any of the four VAPID vars) in Vercel → redeploy. `sendAgentWebPush` logs `VAPID not configured` and no-ops; queue still works.

**Disable the entire welcome action item writer at the API layer:**
- Add a temporary feature flag in `web/app/api/agent/action-items/welcome/queue/route.ts` (`if (process.env.WELCOME_QUEUE_DISABLED === 'true') return NextResponse.json({ success: true, outcome: 'disabled' });`). Set `WELCOME_QUEUE_DISABLED=true` in Vercel. Future commits can remove the flag once root-cause is fixed.

### Deferred follow-ups (non-blocking, tracked here so they don't get lost)

- **Server-side PostHog ingestion of cron-fired events** (`welcome_action_item_expired`). Today logged as structured `[welcome-action-item-expiry] expired` console lines. PostHog wiring is the next cross-cron follow-up; matches Track A posture (same deferral applied to all Track A push-permission cron events).
- **`web-push generate-vapid-keys` script in CI / setup docs.** First-time setup currently requires manual key generation. A bootstrap script (`scripts/setup-vapid.sh`) that prompts for the email subject and writes to `.env.local` would streamline onboarding new dev environments.
- **VAPID key rotation playbook.** No rotation needed for years (VAPID keys are stable and tied to subscription endpoints), but document the procedure: generate new keys, update Vercel env vars, all existing subscriptions get invalidated by the browser, agents re-subscribe on next dashboard load via `PWAInstaller.tsx`.

## Maintenance Calendar

Set these as recurring calendar reminders:

| Frequency | Task |
|-----------|------|
| Monthly | Check Vercel deployment logs for errors |
| Monthly | Review Stripe webhook logs |
| Monthly | Check Anthropic API usage/billing (PDF extraction costs) |
| Quarterly | Test full user flow (signup → subscribe → add client → client app) |
| Quarterly | Test PDF upload flow (upload → extraction → client created) |
| Quarterly | Review Firebase security rules |
| Annually | Rotate Firebase service account key (update `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` in Vercel — this also changes the webhook secret automatically) |
| Annually | Rotate Stripe webhook secret |
| Annually | Review and update environment variables |

## Planned Upgrades

### Phone OTP Authentication (Priority: HIGH)
**Target Date**: Mid-February 2026 (set calendar reminder for Feb 17, 2026)

**Current State**: Client login uses secure random codes (e.g., X7K9-M2P4-Q8R1)

**Upgrade To**: Phone number + SMS verification + biometric (Face ID / Touch ID)

**Why**: Better security, familiar UX for clients, impossible to brute force

**What's Required**:
1. Add native Firebase packages to mobile app (react-native-firebase)
2. Download GoogleService-Info.plist (iOS) and google-services.json (Android) from Firebase Console
3. Rebuild app with `eas build`
4. Resubmit to App Store and Play Store
5. Phone auth is already enabled in Firebase Console

**Estimated Time**: Half day of coding + 1-2 days for Apple review

## Troubleshooting

### "Client code not working" (Mobile App)
1. Check Firebase Firestore rules haven't expired
2. Verify the client exists in Firestore
3. Check the health endpoint: /api/health

### "Subscription page loading forever"
1. Check Vercel environment variables are set
2. Verify Stripe price IDs match Vercel env vars
3. Check Stripe dashboard for errors
4. Check health endpoint: /api/health

### "Can't access Firebase Console"
1. Make sure you're logged into the correct Google account
2. Primary account: deardanielroberts@gmail.com
3. Check email for any Firebase notifications

## PDF Ingestion Pipeline (v3)

**Architecture:** Browser → signed GCS upload → Firestore job → Cloud Tasks dispatch → Vercel process route → Claude extraction → Firestore result → browser polling picks up result.

**Key files:**
- `web/lib/cloud-tasks.ts` — Cloud Tasks REST API client + webhook secret derivation
- `web/lib/application-extractor.ts` — Claude structured output extraction (schema + prompt)
- `web/lib/ingestion-v3-processor.ts` — Orchestrates extraction, validation, retry, Firestore writes
- `web/lib/ingestion-v3-store.ts` — Firestore CRUD for ingestion jobs
- `web/app/api/ingestion/v3/jobs/[jobId]/process/route.ts` — Cloud Tasks callback endpoint
- `web/components/ApplicationUpload.tsx` — Frontend upload + polling UI

**Auth flow:** Cloud Tasks sends `X-CloudTasks-Webhook-Secret` header (HMAC derived from the service account's `private_key_id`). The process route computes the same HMAC and compares. No OIDC tokens, no `actAs` permissions needed.

**GCP resources:**
- Queue: `projects/insurance-agent-app-6f613/locations/us-central1/queues/pdf-ingestion-v3`
- GCS bucket: `insurance-agent-app-6f613.firebasestorage.app` (signed upload URLs)
- Service account: `firebase-adminsdk-fbsvc@insurance-agent-app-6f613.iam.gserviceaccount.com` (Cloud Tasks Enqueuer + Service Account Token Creator)

### Troubleshooting PDF Uploads

**"Network error" on upload:**
- Browser is failing the cross-origin PUT to GCS. Current code retries 3 times automatically.
- If persistent: check GCS bucket CORS config allows PUT from `https://agentforlife.app`.

**"Upload failed (403) ... SignatureDoesNotMatch"**
- This is a signing failure (service-account key mismatch/stale key).
- Check Vercel logs for `[ingestion-v3-alert] upload signing failure`.
- Verify `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` matches the active key for service account:
  `firebase-adminsdk-fbsvc@insurance-agent-app-6f613.iam.gserviceaccount.com`
- After updating the key, redeploy/restart and re-test:
  - `GET /api/health/ingestion-signing` should return 200
  - Upload flow should no longer require fallback.

**"Couldn't read the application" / extraction failures:**
- Check Vercel function logs for the `/api/ingestion/v3/jobs/*/process` route.
- Common causes:
  - **Anthropic schema error** ("too many union types"): The extraction schema in `application-extractor.ts` must have ≤16 `anyOf` unions total (including nested objects). Count them before adding nullable fields.
  - **Model doesn't support output format**: Ensure the model in `application-extractor.ts` supports `output_config.format.schema`. Claude Sonnet 4.6 (`claude-sonnet-4-6-20250214`) works.
  - **Cloud Tasks 403**: Check that the Firebase SA has Cloud Tasks Enqueuer role. The webhook secret approach eliminates `actAs` issues.

**"Processing failed after maximum retry attempts":**
- The processor retries up to 4 times with 5s/20s/60s backoff. Check logs for the underlying error on each attempt.
- Terminal errors (schema invalid, auth failed) are NOT retried.

**Testing locally:**
- Cloud Tasks cannot call localhost. For local testing, use `INGESTION_V3_PROCESSOR_BASE_URL` pointing to an ngrok tunnel, or bypass Cloud Tasks entirely by calling the process route directly.

## Emergency Contacts

- **Firebase Support**: https://firebase.google.com/support
- **Vercel Support**: https://vercel.com/support
- **Stripe Support**: https://support.stripe.com

## Backup Procedures

### Firestore Data Export
1. Go to Firebase Console → Firestore → Import/Export
2. Click "Export" 
3. Choose a Cloud Storage bucket
4. Export all collections

Recommended: Set up scheduled exports (requires Blaze plan)

---

*Last Updated: 2026-03-28*
