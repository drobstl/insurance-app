'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Live client-activation status for the close-of-sale ritual.
 *
 * Subscribes to `agents/{agentId}/clients/{clientId}` and derives a
 * four-state machine that the agent sees in real time during a live
 * close. The load-bearing user moment is Card 3 of the Close Sale
 * conveyor-belt panel (see CONTEXT.md → Phase 2 follow-up → Close-the-
 * sale ritual): the agent stays on the phone with the client and
 * watches this status flip to green before delivering the closing line
 * ("I can see it activated and your notifications are on. You're all
 * set."). Without live activation visibility the ritual breaks — the
 * agent has no concrete signal that activation landed and the sale
 * never "closes" from the client's app perspective.
 *
 * STATE MACHINE (derived from Firestore client doc):
 *
 *   waiting              ← no `clientActivatedAt` set yet
 *   activated_pending    ← activated within the last
 *                          PUSH_PROMPT_RESOLVE_WINDOW_MS and no push
 *                          token yet (push permission prompt is on
 *                          screen but user hasn't tapped)
 *   activated_granted    ← `clientActivatedAt` + valid `pushToken` +
 *                          no `pushPermissionRevokedAt`
 *   activated_denied     ← activated for longer than the resolve
 *                          window with no token, OR token was once
 *                          present but `pushPermissionRevokedAt` is
 *                          set (revoked)
 *
 * The "denied" state is inferred — Firestore doesn't carry an explicit
 * "user tapped Deny" flag. On iOS/Android the push permission prompt
 * fires immediately when the user lands in-app after activation, so
 * anything past the resolve window with no token is almost certainly
 * a denial. The conservative window (10s) keeps the UI from prematurely
 * flashing the yellow warning state while the user is still on the
 * native permission prompt.
 *
 * PUSH PERMISSION SCHEMA (per `web/lib/push-permission-lifecycle.ts`):
 *   - `pushToken: string` set when granted
 *   - `pushPermissionRevokedAt: Timestamp` stamped when Expo returns
 *     `DeviceNotRegistered` (the canonical "user revoked" signal)
 *   - Token may be set AND revoked field present simultaneously
 *     (mid-cleanup) — `isPushEligible` treats that as not eligible
 *
 * USAGE:
 *   const { state, coaching, activatedAt } =
 *     useClientActivationStatus(agentId, clientId);
 *
 * Pair with `<ClientActivationStatusRow>` for the standard rendering,
 * or consume `state` + `coaching` directly for custom rendering
 * (e.g., embedded inside the Close Sale Card 3 conveyor-belt card).
 */

export type ActivationState =
  | 'waiting'
  | 'activated_pending'
  | 'activated_granted'
  | 'activated_denied';

export interface ActivationStatus {
  state: ActivationState;
  /** Coaching text to surface to the agent at this state. */
  coaching: string;
  /** When the client tapped Activate, if known. Null while waiting. */
  activatedAt: Date | null;
  /** True until the first onSnapshot fires (avoids initial flash). */
  loading: boolean;
}

/**
 * Window after activation during which a missing push token reads as
 * "user is still tapping through the prompt" rather than "user denied."
 * Calibrated to comfortably exceed typical iOS/Android prompt resolve
 * times (~1-3 seconds) without making the agent wait too long for
 * the green or yellow state to settle.
 */
export const PUSH_PROMPT_RESOLVE_WINDOW_MS = 10_000;

const COACHING: Record<ActivationState, string> = {
  waiting:
    'Tell client to tap the link in the text and install the app.',
  activated_pending:
    'Push permission prompt is on their screen now. Tell them to tap Allow — that\'s how anniversary, holiday, birthday, and retention lanes reach them.',
  activated_granted:
    'Deliver the line: "I can see it activated and your notifications are on. You\'re all set."',
  activated_denied:
    'Activated but notifications are off. Walk them through enabling notifications in Settings before hanging up.',
};

interface ClientDocShape {
  clientActivatedAt?: Timestamp | null;
  pushToken?: unknown;
  pushPermissionRevokedAt?: unknown;
}

export function useClientActivationStatus(
  agentId: string | null | undefined,
  clientId: string | null | undefined,
): ActivationStatus {
  const [state, setState] = useState<ActivationState>('waiting');
  const [activatedAt, setActivatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId || !clientId) {
      // Intentional sync reset when ids drop out — we want the hook
      // to forget the previous client's state immediately rather than
      // hold stale "activated" status while the caller transitions
      // between clients. The react-hooks/set-state-in-effect rule
      // would have us key-remount the parent or compute during render
      // instead; both are heavier than this targeted reset for a
      // case that fires at most once per client switch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState('waiting');
      setActivatedAt(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, 'agents', agentId, 'clients', clientId);

    // One-shot timer for the "pending → denied" transition. The
    // onSnapshot listener doesn't re-fire just because time elapsed,
    // so when we land in `activated_pending` we arm a timer for the
    // remaining window. Any subsequent snapshot (granted, revoked,
    // anything) clears it.
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const clearPendingTimer = () => {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    };

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setLoading(false);
        const data = snapshot.data() as ClientDocShape | undefined;

        if (!data?.clientActivatedAt) {
          clearPendingTimer();
          setState('waiting');
          setActivatedAt(null);
          return;
        }

        const activatedTs = data.clientActivatedAt;
        const activatedDate =
          typeof activatedTs === 'object' &&
          activatedTs !== null &&
          'toDate' in activatedTs &&
          typeof activatedTs.toDate === 'function'
            ? activatedTs.toDate()
            : null;
        setActivatedAt(activatedDate);

        const hasValidToken =
          typeof data.pushToken === 'string' && data.pushToken.trim().length > 0;
        const isRevoked = !!data.pushPermissionRevokedAt;

        // Token present AND not revoked = unambiguous green state.
        if (hasValidToken && !isRevoked) {
          clearPendingTimer();
          setState('activated_granted');
          return;
        }

        // Revoked-at field set = previously granted, then permanently
        // dropped (DeviceNotRegistered). Treat as denied for the live
        // ritual — the agent's next action is the same (coach the
        // client into Settings to re-enable).
        if (isRevoked) {
          clearPendingTimer();
          setState('activated_denied');
          return;
        }

        // Activated but no token and no revocation field. Could be
        // "user is still on the native prompt" or "user already tapped
        // Deny." Decide by activation age.
        const ageMs = activatedDate
          ? Date.now() - activatedDate.getTime()
          : Number.POSITIVE_INFINITY;

        if (ageMs < PUSH_PROMPT_RESOLVE_WINDOW_MS) {
          setState('activated_pending');
          clearPendingTimer();
          const remainingMs = PUSH_PROMPT_RESOLVE_WINDOW_MS - ageMs;
          pendingTimer = setTimeout(() => {
            // Fired only if no snapshot updated in the meantime (any
            // update would've cleared this timer in clearPendingTimer
            // above). Flip to denied to coach the agent.
            setState('activated_denied');
            pendingTimer = null;
          }, remainingMs);
          return;
        }

        // Past the window with no token: denied.
        setState('activated_denied');
      },
      (err) => {
        console.warn('[useClientActivationStatus] snapshot error', err);
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
      clearPendingTimer();
    };
  }, [agentId, clientId]);

  return {
    state,
    coaching: COACHING[state],
    activatedAt,
    loading,
  };
}
