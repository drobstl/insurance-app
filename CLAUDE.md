# CLAUDE.md - AI Assistant Guide for AgentForLife

## Project Overview

**AgentForLife** is an insurance agent retention and referral system consisting of two applications:
- **Mobile App** (`/mobile`): React Native/Expo app for insurance clients to view policies and send referrals
- **Web App** (`/web`): Next.js dashboard for insurance agents to manage clients, policies, and subscriptions

The product helps insurance agents reduce chargebacks and generate referrals by providing clients with easy access to their policy information and a simple referral mechanism.

## Repository Structure

```
insurance-app/
├── mobile/                 # React Native/Expo mobile app
│   ├── app/               # Expo Router screens (file-based routing)
│   │   ├── _layout.tsx    # Root layout with navigation
│   │   ├── index.tsx      # Login screen (client code entry)
│   │   ├── agent-profile.tsx  # Agent profile & referral screen
│   │   └── policies.tsx   # Client policies list
│   ├── components/        # Reusable React Native components
│   │   ├── ui/           # UI primitives (collapsible, icons)
│   │   ├── confetti.tsx  # Celebration animation
│   │   └── themed-*.tsx  # Theme-aware components
│   ├── constants/        # App constants and theme
│   ├── hooks/           # Custom React hooks (useColorScheme, useThemeColor)
│   ├── assets/          # Images, icons, splash screen
│   ├── app.json         # Expo configuration
│   ├── eas.json         # EAS Build configuration
│   └── firebase.ts      # Firebase initialization
│
├── web/                   # Next.js web application
│   ├── app/              # Next.js App Router
│   │   ├── layout.tsx    # Root layout with Montserrat font
│   │   ├── page.tsx      # Landing/marketing page
│   │   ├── login/        # Agent login page
│   │   ├── signup/       # Agent registration
│   │   ├── dashboard/    # Main agent dashboard (client/policy management)
│   │   ├── subscribe/    # Subscription checkout page
│   │   ├── privacy/      # Privacy policy
│   │   ├── terms/        # Terms of service
│   │   └── api/          # API routes
│   │       ├── stripe/   # Stripe checkout & portal sessions
│   │       └── webhooks/ # Stripe webhook handler
│   ├── lib/              # Utility libraries
│   │   ├── stripe.ts     # Stripe server-side client
│   │   └── stripe-client.ts  # Stripe client-side
│   ├── public/           # Static assets
│   └── firebase.ts       # Firebase initialization
│
└── CLAUDE.md             # This file
```

## Tech Stack

### Mobile App
- **Framework**: Expo SDK 54, React Native 0.81
- **Router**: Expo Router 6 (file-based routing)
- **State**: React useState/useEffect hooks
- **Database**: Firebase Firestore (read-only for clients)
- **Features**: SMS referrals, contact picker, clipboard, sharing
- **Language**: TypeScript with strict mode

### Web App
- **Framework**: Next.js 16.1 (App Router)
- **React**: React 19
- **Styling**: TailwindCSS 4
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Payments**: Stripe (subscriptions, checkout, billing portal)
- **Language**: TypeScript

### Shared Services
- **Firebase Project**: `insurance-agent-app-6f613`
- **Authentication**: Firebase Auth (email/password for agents)
- **Database**: Firestore with structure:
  ```
  agents/{agentId}/
    - name, email, phoneNumber, photoBase64
    - agencyName, agencyLogoBase64, businessCardBase64
    - referralMessage
    - subscriptionStatus, stripeCustomerId, subscriptionId
    clients/{clientId}/
      - name, email, phone, clientCode
      policies/{policyId}/
        - policyType, policyNumber, insuranceCompany
        - coverageAmount, premiumAmount, status
  ```

## Development Commands

### Mobile App (`/mobile`)
```bash
cd mobile
npm install              # Install dependencies
npm start                # Start Expo dev server
npm run ios             # Run on iOS simulator
npm run android         # Run on Android emulator
npm run lint            # Run ESLint
```

### Web App (`/web`)
```bash
cd web
npm install              # Install dependencies
npm run dev             # Start Next.js dev server (localhost:3000)
npm run build           # Production build
npm run start           # Start production server
npm run lint            # Run ESLint
```

### Building for Production (Mobile)
```bash
cd mobile
eas build --platform ios --profile production      # iOS App Store build
eas build --platform android --profile production  # Android Play Store build
eas submit --platform ios                          # Submit to App Store
```

## Key Design Patterns

### Mobile Navigation Flow
1. `index.tsx` - Login with client code
2. `agent-profile.tsx` - View agent info, contact buttons, referral
3. `policies.tsx` - View policy details

### Theming & Colors
- **Primary Teal**: `#0D4D4D` (dark teal background)
- **Accent Teal**: `#3DD6C3` (buttons, highlights)
- **Referral Red**: `#e31837` (referral button)
- **Blue CTA**: `#0099FF` (view policies button)
- **Background**: `#F8F9FA` (off-white)

### Component Patterns
- SafeAreaView with separate top/bottom backgrounds for iOS
- Platform-specific status bar handling for Android
- Base64 image encoding for photos stored in Firestore
- Native contact picker for referrals (works iOS & Android)

## API Routes (Web)

### Stripe Integration
- `POST /api/stripe/create-checkout-session` - Create subscription checkout
  - Body: `{ userId, email, plan: 'monthly' | 'annual' }`
- `POST /api/stripe/create-portal-session` - Customer billing portal
- `POST /api/webhooks/stripe` - Handle Stripe events

### Price IDs
- Monthly: `price_1SlMFGE6F9fvCEUdh5pGoMj9`
- Annual: `price_1SldZkE6F9fvCEUdX2TDYuMp`

## Environment Variables

### Web (`/web/.env`)
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=https://agentforlife.app
```

### Mobile
Firebase config is embedded in `/mobile/firebase.ts` (public web config)

## Policy Types
- IUL (Indexed Universal Life)
- Term Life
- Whole Life
- Mortgage Protection
- Accidental
- Other

## Important Conventions

### Code Style
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use StyleSheet.create() for React Native styles
- Inline styles avoided; use theme constants

### File Naming
- React components: PascalCase (e.g., `HelloWave.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useThemeColor.ts`)
- Screens: kebab-case (e.g., `agent-profile.tsx`)
- Constants: camelCase exports

### Firebase Operations
- All client data is read-only in mobile app
- Agents manage data through web dashboard
- Client codes are uppercase alphanumeric
- Use `serverTimestamp()` for createdAt fields

### Referral Flow
1. User taps "Refer [Agent]" button
2. Native contact picker opens
3. Pre-filled SMS with customizable message
4. Optional business card image attachment
5. Falls back to Share API on WiFi-only devices

## Testing Notes
- Mobile: Test on both iOS and Android (different contact picker behavior)
- Web: Test Stripe webhooks with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Check SMS functionality requires cellular (falls back to Share on WiFi)

## Common Tasks

### Adding a New Screen (Mobile)
1. Create file in `/mobile/app/` (e.g., `new-screen.tsx`)
2. Export default function component
3. Add to Stack.Screen in `_layout.tsx` if needed
4. Navigate with `router.push('/new-screen')`

### Adding a New API Route (Web)
1. Create folder in `/web/app/api/`
2. Add `route.ts` with HTTP method exports
3. Use `NextRequest`/`NextResponse` types

### Updating Firestore Schema
1. Update TypeScript interfaces in relevant files
2. Update Firestore security rules (in Firebase Console)
3. Test with emulator if available

## Build & Deploy

### Mobile
- EAS Build handles iOS/Android builds
- App version in `app.json` (version: "1.2.0")
- iOS build number and Android versionCode auto-increment in production

### Web
- Deploy to Vercel or similar
- Set environment variables in deployment platform
- Firebase config is in source (public keys only)

## Troubleshooting

### Common Issues
- **SMS not sending**: Check cellular connection, fall back to Share API
- **Contact picker not opening**: Verify permissions in app.json
- **Stripe errors**: Check API keys, webhook signature
- **Firebase permission denied**: Check Firestore security rules

### Debug Commands
```bash
# Mobile: Check Expo logs
npx expo start --clear

# Web: Check Next.js build
npm run build 2>&1 | head -50
```
