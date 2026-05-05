import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

/**
 * Push permission lifecycle helpers.
 *
 * ARCHITECTURAL RULE — May 4, 2026 (strategy decisions §4 + CONTEXT.md
 * `Channel Rules` → `Push permission lifecycle`):
 *
 * - A bare `pushToken` field is NOT proof a client currently allows push.
 *   Routing must check eligibility through {@link isPushEligible} (or fetch
 *   the token through {@link readValidPushToken}), which gates on both token
 *   presence AND the absence of a {@link PUSH_PERMISSION_REVOKED_FIELD}
 *   timestamp.
 * - Every Expo push send must go through {@link sendExpoPush} so permanent
 *   delivery failures (currently `DeviceNotRegistered`) atomically clear the
 *   stored `pushToken` and stamp `pushPermissionRevokedAt`. This distinguishes
 *   "never opted in" (no token, no field) from "opted in then revoked" (no
 *   token + field set).
 * - Push-only lanes (anniversary, holiday cards, birthday cards) MUST
 *   short-circuit on `!isPushEligible(...)` BEFORE calling Expo. Lanes with a
 *   fallback (welcome, retention, beneficiary post-activation) fall back per
 *   the channel matrix.
 *
 * If you find yourself wanting to route around this helper, surface the
 * question against `docs/AFL_Strategy_Decisions_2026-05-04.md` §4 instead of
 * re-introducing a `!!pushToken` check elsewhere in the codebase.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Firestore field name used everywhere we record push-permission revocation. */
export const PUSH_PERMISSION_REVOKED_FIELD = 'pushPermissionRevokedAt' as const;

/**
 * Expo push receipt error codes that mean the token is permanently dead and
 * must be invalidated. Kept conservative on purpose — we only invalidate on
 * codes Expo explicitly tells us to "stop sending messages to the
 * corresponding Expo push token" (https://docs.expo.dev/push-notifications/sending-notifications/#push-ticket-errors).
 *
 * Codes like `MessageTooBig`, `MessageRateExceeded`, `MismatchSenderId`, and
 * `InvalidCredentials` indicate sender-side / payload issues and must NOT
 * cause us to drop a token.
 */
export const PERMANENT_PUSH_ERROR_CODES = ['DeviceNotRegistered'] as const;

export type PermanentPushErrorCode = (typeof PERMANENT_PUSH_ERROR_CODES)[number];

export type PushSendOutcome =
  | { status: 'ok' }
  | { status: 'transient_error'; errorCode: string | null; message?: string | null }
  | { status: 'token_invalidated'; reason: PermanentPushErrorCode };

/**
 * The minimal push-state shape stored on a Firestore client (or beneficiary)
 * document. `unknown` because we read these from arbitrary `DocumentData`.
 */
export interface PushPermissionState {
  pushToken?: unknown;
  /**
   * `pushPermissionRevokedAt` is a Firestore server timestamp. We never read
   * it as a Date here — only its presence matters for routing.
   */
  pushPermissionRevokedAt?: unknown;
}

/**
 * Locator for the document holding the push token. We invalidate against this
 * ref (NOT against the calling cron's review/alert doc) so that a single
 * client doc is the single source of truth for `pushToken` +
 * `pushPermissionRevokedAt`.
 */
export interface PushTokenHolderRef {
  ref: FirebaseFirestore.DocumentReference;
  agentId: string;
  clientId?: string;
  beneficiaryId?: string;
}

/**
 * True iff the document has a usable, non-revoked push token. Replaces every
 * `!!pushToken` check in the codebase.
 */
export function isPushEligible(data: PushPermissionState | null | undefined): boolean {
  if (!data) return false;
  const token = typeof data.pushToken === 'string' ? data.pushToken.trim() : '';
  if (!token) return false;
  if (data.pushPermissionRevokedAt) return false;
  return true;
}

/**
 * Returns the trimmed push token if and only if the doc is eligible to receive
 * push (has a token and is not revoked). Otherwise returns null. Use this in
 * the channel loop instead of reading `pushToken` directly.
 */
export function readValidPushToken(data: PushPermissionState | null | undefined): string | null {
  if (!isPushEligible(data)) return null;
  return (data!.pushToken as string).trim();
}

/**
 * Distinguishes "never opted in" from "previously revoked" for telemetry and
 * skip-reason fields on cron-handled docs.
 */
export type PushPermissionStatus = 'eligible' | 'never_opted_in' | 'revoked';

export function getPushPermissionStatus(data: PushPermissionState | null | undefined): PushPermissionStatus {
  if (!data) return 'never_opted_in';
  if (isPushEligible(data)) return 'eligible';
  if (data.pushPermissionRevokedAt) return 'revoked';
  return 'never_opted_in';
}

interface ExpoPushPayload {
  to: string;
  title?: string;
  body?: string;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  data?: Record<string, unknown>;
  categoryId?: string;
  _contentAvailable?: boolean;
}

interface ExpoPushTicketResponse {
  data?: {
    status?: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: { error?: string };
  };
  errors?: Array<{ code?: string; message?: string }>;
}

function maskToken(token: string): string {
  if (!token) return '';
  return token.length <= 6 ? '***' : `***${token.slice(-6)}`;
}

/**
 * Sends an Expo push and applies push permission lifecycle rules.
 *
 * On a permanent-failure error code (currently only `DeviceNotRegistered`),
 * atomically clears the `pushToken` field and sets
 * {@link PUSH_PERMISSION_REVOKED_FIELD} on `holder.ref`. The invalidation is
 * conditional on the stored token still equalling the one we sent to, so
 * concurrent re-registration from the mobile app is not clobbered.
 *
 * Callers are expected to:
 * - Push-only lanes: short-circuit on `!isPushEligible(...)` BEFORE calling
 *   this helper, and treat `token_invalidated` / `transient_error` as a skip
 *   per the lane's no-fallback rule.
 * - Fallback lanes: continue to the next channel on any non-`ok` outcome.
 */
export async function sendExpoPush(
  payload: ExpoPushPayload,
  holder?: PushTokenHolderRef,
): Promise<PushSendOutcome> {
  if (!payload.to) {
    return { status: 'transient_error', errorCode: 'missing_token' };
  }

  let res: Response;
  try {
    res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(payload),
    });
  } catch (fetchErr) {
    console.error('[push-lifecycle] expo fetch failed', {
      agentId: holder?.agentId,
      clientId: holder?.clientId,
      beneficiaryId: holder?.beneficiaryId,
      error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    });
    return { status: 'transient_error', errorCode: 'fetch_failed' };
  }

  let parsed: ExpoPushTicketResponse;
  try {
    parsed = (await res.json()) as ExpoPushTicketResponse;
  } catch {
    return { status: 'transient_error', errorCode: 'invalid_response' };
  }

  const ticket = parsed?.data;
  if (ticket?.status === 'ok') {
    return { status: 'ok' };
  }

  const errorCode = ticket?.details?.error ?? null;
  const message = ticket?.message ?? null;

  if (errorCode && (PERMANENT_PUSH_ERROR_CODES as readonly string[]).includes(errorCode)) {
    const reason = errorCode as PermanentPushErrorCode;
    if (holder) {
      try {
        await holder.ref.firestore.runTransaction(async (tx) => {
          const snap = await tx.get(holder.ref);
          const current = snap.data()?.pushToken;
          if (typeof current === 'string' && current === payload.to) {
            tx.update(holder.ref, {
              pushToken: FieldValue.delete(),
              [PUSH_PERMISSION_REVOKED_FIELD]: FieldValue.serverTimestamp(),
            });
          }
        });
      } catch (markErr) {
        console.error('[push-lifecycle] failed to invalidate token', {
          agentId: holder.agentId,
          clientId: holder.clientId,
          beneficiaryId: holder.beneficiaryId,
          reason,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    }
    console.log('[push-lifecycle] token invalidated', {
      agentId: holder?.agentId,
      clientId: holder?.clientId,
      beneficiaryId: holder?.beneficiaryId,
      reason,
      previousTokenSuffix: maskToken(payload.to),
    });
    return { status: 'token_invalidated', reason };
  }

  console.error('[push-lifecycle] expo push transient failure', {
    agentId: holder?.agentId,
    clientId: holder?.clientId,
    beneficiaryId: holder?.beneficiaryId,
    ticketStatus: ticket?.status ?? 'unknown',
    errorCode,
    message,
  });
  return { status: 'transient_error', errorCode, message };
}
