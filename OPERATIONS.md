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
- `agents/{agentId}/policies` - Policy information

**Security Rules**: Updated 2026-02-01 (no expiration)

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
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` - Firebase Admin service account (base64 JSON)

### Stripe
- **Webhook Endpoint**: https://agentforlife.app/api/webhooks/stripe
- **Products**: Monthly ($9.99/mo), Annual ($100/yr)

## Health Monitoring

**Health Check Endpoint**: https://agentforlife.app/api/health

Set up monitoring with a free service:
1. Go to https://uptimerobot.com (free tier)
2. Create account
3. Add new monitor:
   - Monitor Type: HTTP(s)
   - URL: https://agentforlife.app/api/health
   - Monitoring Interval: 5 minutes
4. Set up alert contacts (your email/phone)

## Maintenance Calendar

Set these as recurring calendar reminders:

| Frequency | Task |
|-----------|------|
| Monthly | Check Vercel deployment logs for errors |
| Monthly | Review Stripe webhook logs |
| Quarterly | Test full user flow (signup → subscribe → add client → client app) |
| Quarterly | Review Firebase security rules |
| Annually | Rotate Stripe webhook secret |
| Annually | Review and update environment variables |

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

*Last Updated: 2026-02-01*
