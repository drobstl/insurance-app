# Google Drive Integration Spec

## Goal

Allow agents to connect Google Drive and import PDF files directly from Drive into AFL's existing ingestion pipeline.

## Delivery Order

- Phase 0: bulk local upload hardening (completed).
- Phase 1: Google Drive connected source (this spec covers Task 1 backend foundations).

## Task 1 Scope

Build OAuth/token backend primitives and integration routes:

- `web/lib/google-oauth.ts`
- `web/lib/google-drive-store.ts`
- `web/app/api/integrations/google/auth/route.ts`
- `web/app/api/integrations/google/callback/route.ts`
- `web/app/api/integrations/google/disconnect/route.ts`
- `web/app/api/integrations/google/token/route.ts`
- `web/app/api/integrations/google/status/route.ts`

## OAuth Configuration

- OAuth client id:
  - `527695351928-3mkhjhni5spi4rd28n1cj617o4vm06cl.apps.googleusercontent.com`
- Scope:
  - `https://www.googleapis.com/auth/drive.file`
- Callback route:
  - `/api/integrations/google/callback`
- Post-callback redirect:
  - `/dashboard` with query params for success/error.

## Firestore Storage

Persist Drive token record at:

- `integrations/{agentId}/google/drive`

Use this document for:

- access token
- refresh token
- expiry metadata
- scope/token type
- timestamps

Temporary OAuth state records are stored under:

- `integrations/{agentId}/google/oauthStates/{stateId}`

## Route Contracts (Task 1)

- `POST /api/integrations/google/auth`
  - Auth required (Firebase bearer token).
  - Creates OAuth state, returns consent URL.

- `GET /api/integrations/google/callback`
  - Handles Google `code` + `state` exchange.
  - Stores Drive tokens.
  - Redirects to `/dashboard?google_drive=success` or `/dashboard?google_drive=error&reason=...`.

- `POST /api/integrations/google/disconnect`
  - Auth required.
  - Removes Drive token record.

- `GET /api/integrations/google/token`
  - Auth required.
  - Returns usable access token and refreshes it if expired/near expiry.

- `GET /api/integrations/google/status`
  - Auth required.
  - Returns whether Drive is connected and basic connection metadata.
