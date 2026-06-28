// Patch's just-in-time nudges — the value-teaching layer that introduces a
// deeper feature at the moment it's relevant, so a new agent comes to
// understand everything we built without a wall of day-one setup.
//
// Discipline ("earn the interruption"): one at a time, only when the predicate
// says there's real value, dismissible — and once dismissed, gone for good.
// The engine (in DashboardAssistant) caps it to one unprompted nudge per
// session and never fires for a brand-new agent who's still in setup.
//
// Adding a nudge is just a registry entry: a one-line message, a CTA, and a
// `when(ctx)` predicate over signals we already have.

export interface NudgeContext {
  pathname: string;
  /** agentProfile.membershipTier */
  tier: string;
  phonePaired: boolean;
  /** fetched from the google-calendar integration status */
  calendarConnected: boolean;
}

export interface PatchNudge {
  id: string;
  /** higher wins when more than one is eligible */
  priority: number;
  /** one line, plain English, sells the why */
  message: string;
  cta: { label: string; href?: string; patchPrompt?: string };
  when: (ctx: NudgeContext) => boolean;
}

const isProTier = (tier: string) => tier === 'pro' || tier === 'agency' || tier === 'trial';
const onLeadsOrCalendar = (path: string) =>
  path.startsWith('/dashboard/leads') || path.startsWith('/dashboard/calendar');

export const PATCH_NUDGES: PatchNudge[] = [
  {
    id: 'pair-phone',
    priority: 80,
    message: 'Pair your phone so you get buzzed the moment a lead books — and can text clients in two taps.',
    cta: { label: 'Pair phone', href: '/dashboard/pair-phone' },
    when: (c) => !c.phonePaired && !c.pathname.startsWith('/dashboard/pair-phone'),
  },
  {
    id: 'connect-calendar',
    priority: 70,
    message: 'Connect your calendar so booking a lead never double-books you.',
    cta: { label: 'Connect', href: '/dashboard/settings?tab=account' },
    when: (c) => isProTier(c.tier) && !c.calendarConnected && onLeadsOrCalendar(c.pathname),
  },
];

/** The highest-priority eligible nudge the agent hasn't dismissed, or null. */
export function pickNudge(ctx: NudgeContext, dismissedIds: string[]): PatchNudge | null {
  const eligible = PATCH_NUDGES.filter((n) => !dismissedIds.includes(n.id) && n.when(ctx)).sort(
    (a, b) => b.priority - a.priority,
  );
  return eligible[0] ?? null;
}

const DISMISS_KEY = 'patch-nudges-dismissed-v1';

export function getDismissedNudges(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
  } catch {
    return [];
  }
}

export function dismissNudge(id: string): void {
  if (typeof window === 'undefined') return;
  const current = getDismissedNudges();
  if (current.includes(id)) return;
  window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...current, id]));
}
