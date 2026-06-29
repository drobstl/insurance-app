'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  type LeadTag,
  type LeadTagColor,
  parseLeadTags,
  newLeadTagId,
  normalizeTagLabel,
  MAX_LEAD_TAGS,
} from '../../lib/lead-tag';
import { auth, db } from '../../firebase';
import { isAdminEmail } from '../../lib/admin';
import { identifyAgent, resetPostHog, captureEvent } from '../../lib/posthog';
import { ANALYTICS_EVENTS } from '../../lib/analytics-events';

export interface OnboardingMilestones {
  profileCompleted: boolean;
  firstClientCreated: boolean;
  firstWelcomeSent: boolean;
  firstPatchPromptSent: boolean;
  // Optional / tracked-only per docs/AFL_Welcome_Flow_Amendment_2026-05-07.md
  // §4.2 + §4.3. PWAInstaller still writes these when the agent
  // installs / grants Web Push, and the dashboard exposes them as
  // an opt-in upsell, but they no longer gate `onboardingComplete`.
  // They re-activate as required setup at the moment the bulk
  // import (Mode 2) wizard is enabled in Phase 2.
  pwaInstalled: boolean;
  webPushGranted: boolean;
}

export interface OnboardingState {
  version: number;
  currentStep: number;
  requiredMilestones: OnboardingMilestones;
}

export type OnboardingMilestoneKey = keyof OnboardingMilestones;

const PROFILE_FETCH_TIMEOUT_MS = 12000;

/**
 * Normalize a Firestore timestamp-ish value to epoch millis. Handles
 * the four shapes a date field can arrive in across the SDK + our
 * writers: a Firestore `Timestamp` (`.toMillis()`), a JS `Date`, a
 * plain `{ seconds }` object (a serialized Timestamp, e.g. after a
 * round-trip), and a raw number. Returns undefined for anything else.
 */
function tsToMillis(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object') {
    const obj = v as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') {
      try {
        return obj.toMillis();
      } catch {
        return undefined;
      }
    }
    if (typeof obj.seconds === 'number') return obj.seconds * 1000;
  }
  return undefined;
}

function normalizeOnboardingState(raw: unknown): OnboardingState {
  const source = typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {};
  const milestonesRaw =
    typeof source.requiredMilestones === 'object' && source.requiredMilestones
      ? (source.requiredMilestones as Record<string, unknown>)
      : {};

  return {
    version: typeof source.version === 'number' && Number.isFinite(source.version) ? source.version : 1,
    currentStep: typeof source.currentStep === 'number' && Number.isFinite(source.currentStep) ? source.currentStep : 0,
    requiredMilestones: {
      profileCompleted: milestonesRaw.profileCompleted === true,
      firstClientCreated: milestonesRaw.firstClientCreated === true,
      firstWelcomeSent: milestonesRaw.firstWelcomeSent === true,
      firstPatchPromptSent: milestonesRaw.firstPatchPromptSent === true,
      pwaInstalled: milestonesRaw.pwaInstalled === true,
      webPushGranted: milestonesRaw.webPushGranted === true,
    },
  };
}

export interface AgentProfile {
  name?: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
  photoBase64?: string;
  subscriptionStatus?: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
  /**
   * Tier identifier set by the Stripe webhook on
   * `checkout.session.completed` / `subscription.updated`, and by the
   * founding-member activation route. One of:
   *   `'starter' | 'growth' | 'pro' | 'agency' | 'founding' | 'unknown'`.
   *
   * Drives tier-based feature gating in `web/lib/tier-gating.ts`.
   * Founding members keep `'founding'` until they upgrade to Pro, at
   * which point the webhook sets it to `'pro'` (with a permanent $50
   * founding Stripe Coupon making the effective price $49/mo). The
   * `isFoundingMember` flag persists across that upgrade for badge
   * purposes.
   */
  membershipTier?: string;
  /**
   * No-card trial window (Entry-mechanism cutover, Phase 1). Both are
   * epoch millis, normalized from the Firestore Timestamp at fetch time
   * via `tsToMillis`. `trialEndsAt` drives the trial branch of the
   * tier-gating helpers (`isTrialActive` / `hasProAccess`) and the
   * SubscriptionGate. Set only for `membershipTier === 'trial'` agents.
   */
  trialEndsAt?: number;
  trialStartedAt?: number;
  agencyName?: string;
  /** National Producer Number — read aloud for ID verification on calls. */
  npn?: string;
  agencyLogoBase64?: string;
  businessCardBase64?: string;
  /** Family photo shown on the Rapport credibility slide of the lead presentation. */
  familyPhotoBase64?: string;
  /**
   * Optional custom "A-rated carriers" strip image (base64) for the
   * presentation's Rapport slide. Unset → the bundled default strip
   * (web/public/carriers/strip.png).
   */
  carrierStripBase64?: string;
  referralMessage?: string;
  isFoundingMember?: boolean;
  schedulingUrl?: string;
  autoHolidayCards?: boolean;
  aiAssistantEnabled?: boolean;
  anniversaryMessageStyle?: 'check_in' | 'lower_price' | 'custom';
  anniversaryMessageCustom?: string;
  anniversaryMessageCustomTitle?: string;
  policyReviewAIEnabled?: boolean;
  welcomeSmsTemplate?: string;
  /** Optional "teed up" first-touch intro SMS, customizable per agent.
   *  Falls back to DEFAULT_INTRO_TEXT (lib/lead-intro-text.ts). */
  introTextTemplate?: string;
  forwardInboundSms?: boolean;
  onboardingComplete?: boolean;
  pendingSubscriptionCelebration?: boolean;
  onboarding?: OnboardingState;
  tipsSeen?: Record<string, boolean>;
  celebratedBadgeIds?: string[];
  inviteCode?: string;
  referralRewardsGiven?: number;
  /**
   * Per-state insurance license registry. Keyed by USPS 2-letter state
   * code; entries carry license number + expiration date + the
   * Firebase Storage path to the uploaded PDF. Used by the booking-
   * confirmation flow (Chunk 4e) to attach the state-matched license
   * PDF when sending appointment confirmations.
   *
   * See `web/lib/agent-licenses.ts` for the canonical types + helpers.
   */
  licenses?: Record<string, {
    number: string;
    expiresOn: string | null;
    pdfStoragePath: string;
    uploadedAt: string;
  }>;
  /**
   * Default appointment style. 'phone' agents never see the meeting-
   * link / video-invite fields in the booking flow. 'video' agents
   * get them pre-checked. Per-appointment override is always available.
   */
  appointmentMode?: 'phone' | 'video';
  /**
   * Optional default meeting link for the agent (Zoom personal room,
   * Google Meet permalink, etc.). Used as the prefill for the
   * appointment meeting-link field when the agent picks Video mode
   * and doesn't have Google Meet auto-generation turned on.
   */
  defaultMeetingLink?: string;
  /**
   * When true AND Google Calendar is connected, booking a video
   * appointment auto-creates a unique Google Meet link on the
   * Calendar event (via `conferenceData.createRequest`). Stored on
   * the appointment as `meetingUrl`. Off → falls back to
   * defaultMeetingLink.
   */
  autoCreateGoogleMeet?: boolean;
  /**
   * How the calendar (web/components/LeadsCalendar.tsx) renders the
   * agent's Google Calendar events behind their AFL sits. 'focus'
   * (default) = muted gray hatched busy blocks; 'normal' = each event
   * shown with its own title in a distinct color. Persisted here so the
   * preference follows the agent across devices.
   */
  calendarViewMode?: 'focus' | 'normal';
  /**
   * How far ahead of an appointment the cron should send a push reminder
   * to the lead (Chunk 4f-extension). Defaults to 1 hour. Set to 0 to
   * disable auto push reminders entirely. The agent's manual "Send
   * reminder" SMS button is always available regardless.
   */
  reminderPushHoursBefore?: number;
  /**
   * Default delivery channel for booking confirmations + reminders.
   * 'text' (default) uses the agent's phone (Web Share / sms:); 'email'
   * sends from AFL's verified domain with the agent's name and replies
   * routed to the agent's inbox. Switchable per-send in the drawer.
   * Persisted at `agents/{agentId}.confirmationChannel`.
   */
  confirmationChannel?: 'text' | 'email';
  /**
   * Whether to include the app-download link + the lead's login code in
   * booking confirmations (so booked leads land on the agent's branded
   * prep page). Pro+ surface, default ON — but the link is only actually
   * injected when the agent has a real intro video recorded
   * (`leadContent.intro.url`), so an agent who never records one never
   * sends an empty prep page. Only an explicit `false` opts out.
   * Persisted at `agents/{agentId}.includeAppAccessInConfirmations`.
   */
  includeAppAccessInConfirmations?: boolean;
  /**
   * Per-agent video manifest for the mobile lead-home screen.
   * Videos live in Bunny.net Stream — uploaded via TUS direct-from-browser
   * (/api/lead-content/upload-url provisions, /api/lead-content/commit
   * persists). `url` is the HLS playlist; consumed by /api/mobile/lead-content
   * which merges this over platform defaults.
   */
  leadContent?: {
    intro?: { url: string; iframeUrl?: string; thumbnailUrl?: string; videoId?: string; title?: string; updatedAt?: string };
    faqs?: Array<{ id: string; title: string; url: string; iframeUrl?: string; thumbnailUrl?: string; videoId?: string; updatedAt?: string }>;
    caseStudies?: Array<{ id: string; title: string; url: string; iframeUrl?: string; thumbnailUrl?: string; videoId?: string; updatedAt?: string }>;
  };
  /**
   * Per-agent dial-script template shown as an overlay during a live
   * call. Supports `{agentfirstname}`, `{leadname}`, `{leadage}` etc.
   * (see web/lib/dial-script.ts). Empty/undefined falls back to
   * DEFAULT_DIAL_SCRIPT.
   */
  dialScript?: string;
  /**
   * How many times the agent wants to dial a lead before the call
   * queue auto-advances. 1 = current behavior (advance after every
   * outcome). 2 = double-dial — stay on the lead until they've been
   * dialed twice OR a terminal outcome (booked / not_interested /
   * wrong_number / do_not_call / callback_requested) is chipped.
   * 3 = triple-dial — same logic, three attempts. Transient outcomes
   * `no_answer` and `left_vm` count toward the dial-count threshold;
   * terminal outcomes always advance regardless of count. Defaults to
   * 1. Persisted at `agents/{agentId}.dialPersistence`.
   */
  dialPersistence?: 1 | 2 | 3;
  /**
   * Derived: whether this agent has paired their phone with the AFL
   * mobile app and push is active. True iff a `pushToken` is stored on
   * the agent doc AND `pushPermissionRevokedAt` is unset (lifecycle
   * rule per push-permission-lifecycle.ts).
   *
   * Used by the pair-phone prompts (dashboard banner, confirmation
   * drawer callout, profile-dropdown badge) to know whether to nudge.
   */
  phonePaired?: boolean;
  /**
   * FirstPromoter affiliate enrollment, populated when the agent
   * clicks "Get my link" on /dashboard/refer-and-earn. Written by
   * `/api/affiliate/create` after creating (or recovering) a promoter
   * in FirstPromoter. The `refLink` is the tracking URL the agent
   * shares; `refToken` is the bare affiliate username (e.g. for
   * embedding in dedicated landing pages). Pay-out stats live in
   * FirstPromoter — we don't mirror them here.
   */
  affiliate?: {
    firstPromoterPromoterId?: number;
    refLink?: string;
    refToken?: string | null;
    coupon?: string | null;
    createdAt?: unknown;
  };
  /**
   * SMEs (Subject Matter Experts in the agent's upline) the agent has
   * booked FIF resets with — remembered so the reset-capture form
   * prefills the name + their external calendar link instead of asking
   * every time. Most-recent-first, capped at 10. Written by
   * `rememberFifResetSme`; never touched by the settings page.
   */
  fifResetSmes?: Array<{ name: string; calendarUrl?: string }>;
  /**
   * Agent has switched the in-app reset reveal on (default off). Gates the
   * per-client "advanced market sit" product picker in the client detail.
   */
  resetRevealEnabled?: boolean;
  /**
   * Agent-defined lead tags (id + label + color), managed from the lead
   * detail panel's tag editor. Mirrors `fifResetSmes`: an inline array on the
   * agent doc, written via the tag CRUD callbacks below + optimistic state.
   */
  leadTags?: LeadTag[];
}

interface DashboardContextValue {
  user: User | null;
  loading: boolean;
  profileLoading: boolean;
  agentProfile: AgentProfile;
  setAgentProfile: React.Dispatch<React.SetStateAction<AgentProfile>>;
  isAdmin: boolean;
  handleLogout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  dismissTip: (sectionKey: string) => Promise<void>;
  markOnboardingMilestone: (milestone: OnboardingMilestoneKey) => Promise<void>;
  rememberFifResetSme: (sme: { name: string; calendarUrl?: string }) => Promise<void>;
  createLeadTag: (input: { label: string; color: LeadTagColor }) => Promise<LeadTag | null>;
  updateLeadTag: (id: string, patch: { label?: string; color?: LeadTagColor }) => Promise<void>;
  deleteLeadTag: (id: string) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [agentProfile, setAgentProfile] = useState<AgentProfile>({});
  const providerStartedAtRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const signinRedirectEmittedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
        setProfileLoading(true);
      } else {
        setUser(null);
        setAgentProfile({});
        setLoading(false);
        setProfileLoading(false);
        if (!signinRedirectEmittedRef.current) {
          signinRedirectEmittedRef.current = true;
          captureEvent(ANALYTICS_EVENTS.DASHBOARD_AUTH_GATE_RESOLVED, {
            outcome: 'redirect_signin',
            duration_ms: Math.round(performance.now() - providerStartedAtRef.current),
          });
        }
        resetPostHog();
        const pathname = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        const cameFromStripeSuccess = pathname.startsWith('/dashboard') && params.get('subscription') === 'success';
        router.push(cameFromStripeSuccess
          ? '/login?reason=session-expired-after-checkout'
          : '/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    let profileTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const agentDoc = await Promise.race([
        getDoc(doc(db, 'agents', user.uid)),
        new Promise<never>((_, reject) => {
          profileTimeout = setTimeout(() => reject(new Error('agent_profile_timeout')), PROFILE_FETCH_TIMEOUT_MS);
        }),
      ]);
      if (agentDoc.exists()) {
        const data = agentDoc.data();
        setAgentProfile({
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber,
          photoBase64: data.photoBase64,
          photoURL: data.photoURL,
          subscriptionStatus: data.subscriptionStatus,
          stripeCustomerId: data.stripeCustomerId,
          subscriptionId: data.subscriptionId,
          membershipTier: typeof data.membershipTier === 'string' ? data.membershipTier : undefined,
          trialEndsAt: tsToMillis(data.trialEndsAt),
          trialStartedAt: tsToMillis(data.trialStartedAt),
          agencyName: data.agencyName,
          npn: typeof data.npn === 'string' ? data.npn : undefined,
          agencyLogoBase64: data.agencyLogoBase64,
          businessCardBase64: data.businessCardBase64,
          // These two were missing from the loader, so after any refresh they
          // came back undefined even when saved — and the settings autosave
          // then wrote them back as null, silently wiping a saved family photo
          // / custom carrier strip on the next edit. Load them like the others.
          familyPhotoBase64: data.familyPhotoBase64,
          carrierStripBase64: data.carrierStripBase64,
          referralMessage: data.referralMessage,
          isFoundingMember: data.isFoundingMember,
          schedulingUrl: data.schedulingUrl,
          autoHolidayCards: data.autoHolidayCards,
          aiAssistantEnabled: data.aiAssistantEnabled,
          anniversaryMessageStyle: data.anniversaryMessageStyle,
          anniversaryMessageCustom: data.anniversaryMessageCustom,
          anniversaryMessageCustomTitle: data.anniversaryMessageCustomTitle,
          policyReviewAIEnabled: data.policyReviewAIEnabled,
          welcomeSmsTemplate: data.welcomeSmsTemplate,
          introTextTemplate: typeof data.introTextTemplate === 'string' ? data.introTextTemplate : undefined,
          forwardInboundSms: data.forwardInboundSms,
          onboardingComplete: data.onboardingComplete,
          pendingSubscriptionCelebration: data.pendingSubscriptionCelebration === true,
          onboarding: normalizeOnboardingState(data.onboarding),
          tipsSeen: data.tipsSeen || {},
          celebratedBadgeIds: data.celebratedBadgeIds || [],
          licenses: data.licenses || {},
          appointmentMode: data.appointmentMode === 'video' ? 'video' : 'phone',
          defaultMeetingLink: data.defaultMeetingLink,
          // Tri-state: undefined = "use the default", which is ON when Google
          // Calendar is connected (a fresh per-meeting Meet link). Only an
          // explicit false (the agent opted out) disables it. The on-by-default
          // decision lives in AppointmentPicker (usingAutoMeet).
          autoCreateGoogleMeet:
            typeof data.autoCreateGoogleMeet === 'boolean' ? data.autoCreateGoogleMeet : undefined,
          calendarViewMode: data.calendarViewMode === 'normal' ? 'normal' : 'focus',
          reminderPushHoursBefore: typeof data.reminderPushHoursBefore === 'number'
            ? data.reminderPushHoursBefore
            : 1,
          confirmationChannel: data.confirmationChannel === 'email' ? 'email' : 'text',
          // Undefined is treated as ON downstream (default ON for Pro+);
          // preserve a literal `false` so an explicit opt-out survives.
          includeAppAccessInConfirmations: data.includeAppAccessInConfirmations,
          leadContent: data.leadContent || undefined,
          dialScript: typeof data.dialScript === 'string' ? data.dialScript : undefined,
          dialPersistence: (data.dialPersistence === 2 || data.dialPersistence === 3)
            ? data.dialPersistence
            : 1,
          phonePaired: Boolean(
            typeof data.pushToken === 'string' &&
            data.pushToken &&
            !data.pushPermissionRevokedAt,
          ),
          affiliate: data.affiliate && typeof data.affiliate === 'object' ? data.affiliate : undefined,
          fifResetSmes: Array.isArray(data.fifResetSmes)
            ? (data.fifResetSmes as Array<{ name?: unknown; calendarUrl?: unknown }>)
                .filter((s) => s && typeof s.name === 'string' && s.name.trim())
                .map((s) => {
                  const name = String((s as { name: string }).name).trim();
                  const url =
                    typeof s.calendarUrl === 'string' && s.calendarUrl.trim()
                      ? s.calendarUrl.trim()
                      : undefined;
                  return url ? { name, calendarUrl: url } : { name };
                })
            : [],
          leadTags: parseLeadTags(data.leadTags),
          resetRevealEnabled: data.resetRevealEnabled === true,
        });
      } else {
        setAgentProfile({});
      }
    } catch (error) {
      console.error('Error fetching agent profile:', error);
    } finally {
      if (profileTimeout) clearTimeout(profileTimeout);
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Live-subscribe to the agent doc so fields like `phonePaired`
  // update across the dashboard the moment the underlying Firestore
  // doc changes — e.g., the moment the mobile app calls
  // /api/agent-push-token/register after a fresh QR pair. Without
  // this, the agent has to refresh the page to see "Set up my phone"
  // flip from "Setup needed" to "paired" + the booking-drawer
  // callout switch from "pair next time" to "already sent to your
  // phone — resend".
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'agents', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        // Only patch the fields that can change asynchronously without
        // a dashboard-initiated write. Everything else stays under
        // fetchProfile's control to avoid clobbering optimistic
        // updates from the settings UI.
        setAgentProfile((prev) => ({
          ...prev,
          phonePaired: Boolean(
            typeof data.pushToken === 'string' &&
            data.pushToken &&
            !data.pushPermissionRevokedAt,
          ),
        }));
      },
      (err) => {
        console.warn('agent doc snapshot listener failed:', err);
      },
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    identifyAgent(user.uid, {
      email: user.email || undefined,
      displayName: user.displayName || undefined,
      agencyName: agentProfile.agencyName || undefined,
      subscriptionStatus: agentProfile.subscriptionStatus || undefined,
      onboardingComplete: agentProfile.onboardingComplete,
      isFoundingMember: agentProfile.isFoundingMember,
    });
  }, [
    user,
    agentProfile.agencyName,
    agentProfile.subscriptionStatus,
    agentProfile.onboardingComplete,
    agentProfile.isFoundingMember,
  ]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      resetPostHog();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [router]);

  const dismissTip = useCallback(async (sectionKey: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'agents', user.uid), { [`tipsSeen.${sectionKey}`]: true });
      setAgentProfile(prev => ({
        ...prev,
        tipsSeen: { ...prev.tipsSeen, [sectionKey]: true },
      }));
    } catch (error) {
      console.error('Error dismissing tip:', error);
    }
  }, [user]);

  const markOnboardingMilestone = useCallback(async (milestone: OnboardingMilestoneKey) => {
    if (!user) return;

    const currentOnboarding = normalizeOnboardingState(agentProfile.onboarding);
    if (currentOnboarding.requiredMilestones[milestone]) {
      return;
    }

    const nextMilestones: OnboardingMilestones = {
      ...currentOnboarding.requiredMilestones,
      [milestone]: true,
    };
    const nextOnboarding: OnboardingState = {
      ...currentOnboarding,
      requiredMilestones: nextMilestones,
    };
    try {
      await setDoc(
        doc(db, 'agents', user.uid),
        {
          onboarding: {
            ...nextOnboarding,
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true },
      );
      setAgentProfile((prev) => ({
        ...prev,
        onboarding: nextOnboarding,
      }));
    } catch (error) {
      console.error('Error marking onboarding milestone:', error);
    }
  }, [user, agentProfile.onboarding]);

  // Append/refresh an SME in the agent's remembered list when they book a
  // FIF reset, so the capture form prefills next time. De-duped by
  // case-insensitive name, most-recent-first, capped at 10. A repeat SME
  // moves to the front; a freshly-pasted calendar link wins, otherwise the
  // previously-remembered link is preserved. Direct Firestore merge +
  // optimistic state, same pattern as dismissTip / markOnboardingMilestone.
  const rememberFifResetSme = useCallback(async (sme: { name: string; calendarUrl?: string }) => {
    if (!user) return;
    const name = sme.name.trim();
    if (!name) return;
    const pastedUrl = sme.calendarUrl?.trim() || undefined;
    const prevList = agentProfile.fifResetSmes ?? [];
    const prior = prevList.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
    const remaining = prevList.filter((s) => s.name.trim().toLowerCase() !== name.toLowerCase());
    const resolvedUrl = pastedUrl ?? prior?.calendarUrl;
    // Omit the key entirely when there's no URL — Firestore rejects an
    // explicit `undefined` field value.
    const entry: { name: string; calendarUrl?: string } = resolvedUrl
      ? { name, calendarUrl: resolvedUrl }
      : { name };
    const nextList = [entry, ...remaining].slice(0, 10);
    try {
      await setDoc(doc(db, 'agents', user.uid), { fifResetSmes: nextList }, { merge: true });
      setAgentProfile((prev) => ({ ...prev, fifResetSmes: nextList }));
    } catch (error) {
      console.error('Error remembering FIF reset SME:', error);
    }
  }, [user, agentProfile.fifResetSmes]);

  // Lead tags — agent-defined labels. Same storage shape as
  // rememberFifResetSme: an inline array on the agent doc, merge-written with
  // optimistic state. Definition deletes reconcile lazily (a lead keeps a
  // dangling tagId; resolveLeadTags drops it), so a delete never fans out
  // writes over the book.
  const createLeadTag = useCallback(
    async (input: { label: string; color: LeadTagColor }): Promise<LeadTag | null> => {
      if (!user) return null;
      const label = normalizeTagLabel(input.label);
      if (!label) return null;
      const prev = agentProfile.leadTags ?? [];
      // Reuse a same-label tag (case-insensitive) rather than near-duplicating.
      const existing = prev.find((t) => t.label.toLowerCase() === label.toLowerCase());
      if (existing) return existing;
      if (prev.length >= MAX_LEAD_TAGS) return null;
      const tag: LeadTag = { id: newLeadTagId(), label, color: input.color };
      const next = [...prev, tag];
      try {
        await setDoc(doc(db, 'agents', user.uid), { leadTags: next }, { merge: true });
        setAgentProfile((p) => ({ ...p, leadTags: next }));
        return tag;
      } catch (error) {
        console.error('Error creating lead tag:', error);
        return null;
      }
    },
    [user, agentProfile.leadTags],
  );

  const updateLeadTag = useCallback(
    async (id: string, patch: { label?: string; color?: LeadTagColor }): Promise<void> => {
      if (!user) return;
      const prev = agentProfile.leadTags ?? [];
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const label = patch.label != null ? normalizeTagLabel(patch.label) : t.label;
        return { ...t, label: label || t.label, color: patch.color ?? t.color };
      });
      try {
        await setDoc(doc(db, 'agents', user.uid), { leadTags: next }, { merge: true });
        setAgentProfile((p) => ({ ...p, leadTags: next }));
      } catch (error) {
        console.error('Error updating lead tag:', error);
      }
    },
    [user, agentProfile.leadTags],
  );

  const deleteLeadTag = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      const prev = agentProfile.leadTags ?? [];
      const next = prev.filter((t) => t.id !== id);
      if (next.length === prev.length) return;
      try {
        await setDoc(doc(db, 'agents', user.uid), { leadTags: next }, { merge: true });
        setAgentProfile((p) => ({ ...p, leadTags: next }));
      } catch (error) {
        console.error('Error deleting lead tag:', error);
      }
    },
    [user, agentProfile.leadTags],
  );

  const isAdmin = isAdminEmail(user?.email);

  return (
    <DashboardContext.Provider
      value={{
        user,
        loading,
        profileLoading,
        agentProfile,
        setAgentProfile,
        isAdmin,
        handleLogout,
        refreshProfile: fetchProfile,
        dismissTip,
        markOnboardingMilestone,
        rememberFifResetSme,
        createLeadTag,
        updateLeadTag,
        deleteLeadTag,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
