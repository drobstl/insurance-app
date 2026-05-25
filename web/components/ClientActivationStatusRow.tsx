'use client';

import {
  useClientActivationStatus,
  type ActivationState,
} from '../lib/use-client-activation-status';

/**
 * Renders the live activation state for a client during (and just
 * after) the close-of-sale ritual. Two variants:
 *
 *   variant="card" — full presentation for embedding inside Card 3 of
 *     the Close Sale conveyor-belt panel. Larger dot, coaching as the
 *     primary affordance. Designed to be the focal element on screen
 *     while the agent is still on the phone with the client.
 *
 *   variant="row"  — compact horizontal layout for pinning at the top
 *     of the client detail page. Same state machine, same coaching,
 *     but tuned to coexist with other client-profile content rather
 *     than dominate it. Used by Starter agents (who enter activation
 *     via Add Client → Add Policy, not via the Close Sale panel) and
 *     by anyone re-opening a freshly-created client to verify
 *     activation landed.
 *
 * Both variants share the same hook (`useClientActivationStatus`) so
 * the state derivation is single-sourced. The hook subscribes to
 * Firestore via onSnapshot; this component is purely presentational.
 *
 * Tier reach: this component is intentionally NOT tier-gated. The
 * activation ritual is product-level load-bearing per CONTEXT.md →
 * Tier gating matrix. Starter agents get it on the client detail
 * surface; Growth+ get it inside the Close Sale panel.
 */

interface Props {
  /** Owning agent id. Required for the Firestore subscription path. */
  agentId: string | null | undefined;
  /** Client doc id under that agent. */
  clientId: string | null | undefined;
  /** Presentation density — see component doc above. */
  variant: 'card' | 'row';
  /** Optional className passthrough for parent-level positioning. */
  className?: string;
}

interface StateVisual {
  dotClass: string;
  label: string;
}

const STATE_VISUALS: Record<ActivationState, StateVisual> = {
  waiting: {
    dotClass: 'bg-gray-400 animate-pulse',
    label: 'Waiting for client to install the app',
  },
  activated_pending: {
    dotClass: 'bg-blue-500 animate-pulse',
    label: 'App opened — push permission prompt is on screen',
  },
  activated_granted: {
    dotClass: 'bg-green-500',
    label: '✓ Activated · notifications on',
  },
  activated_denied: {
    dotClass: 'bg-yellow-500',
    label: '⚠ Activated · notifications off',
  },
};

// Background + border keyed to state. Subtle enough to coexist on a
// busy detail page (row variant); tuned to feel like a focal beat
// inside the Card 3 conveyor card (card variant).
const STATE_SURFACE: Record<ActivationState, string> = {
  waiting: 'bg-gray-50 border-gray-200',
  activated_pending: 'bg-blue-50 border-blue-200',
  activated_granted: 'bg-green-50 border-green-300',
  activated_denied: 'bg-yellow-50 border-yellow-300',
};

export function ClientActivationStatusRow({
  agentId,
  clientId,
  variant,
  className,
}: Props) {
  const { state, coaching, loading } = useClientActivationStatus(
    agentId,
    clientId,
  );

  // Render nothing during initial snapshot load so the UI doesn't
  // flash "waiting" before settling on the real state. The window
  // is sub-second in practice.
  if (loading) return null;

  const visual = STATE_VISUALS[state];
  const surface = STATE_SURFACE[state];

  if (variant === 'card') {
    return (
      <div
        className={`rounded-xl border ${surface} p-5 ${className ?? ''}`.trim()}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 mb-3">
          <span className={`h-3 w-3 rounded-full shrink-0 ${visual.dotClass}`} />
          <p className="text-sm font-semibold text-[#0D4D4D]">{visual.label}</p>
        </div>
        <p className="text-sm leading-relaxed text-[#2D3748]">{coaching}</p>
      </div>
    );
  }

  // 'row' variant.
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border ${surface} px-4 py-3 ${className ?? ''}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${visual.dotClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#0D4D4D]">{visual.label}</p>
        <p className="text-xs text-[#4B5563] mt-0.5 leading-snug">{coaching}</p>
      </div>
    </div>
  );
}
