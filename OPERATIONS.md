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
