'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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
  agencyName?: string;
  agencyLogoBase64?: string;
  businessCardBase64?: string;
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
  beneficiaryWelcomeTemplateEn?: string;
  beneficiaryWelcomeTemplateEs?: string;
  beneficiaryHolidayTouchpointsEnabled?: boolean;
  beneficiaryAIFollowupsEnabled?: boolean;
  beneficiaryMaxTouchesPer30Days?: number;
  skipWelcomeSmsConfirmation?: boolean;
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
          agencyName: data.agencyName,
          agencyLogoBase64: data.agencyLogoBase64,
          businessCardBase64: data.businessCardBase64,
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
          beneficiaryWelcomeTemplateEn: data.beneficiaryWelcomeTemplateEn,
          beneficiaryWelcomeTemplateEs: data.beneficiaryWelcomeTemplateEs,
          beneficiaryHolidayTouchpointsEnabled: data.beneficiaryHolidayTouchpointsEnabled,
          beneficiaryAIFollowupsEnabled: data.beneficiaryAIFollowupsEnabled,
          beneficiaryMaxTouchesPer30Days: data.beneficiaryMaxTouchesPer30Days,
          skipWelcomeSmsConfirmation: data.skipWelcomeSmsConfirmation,
          onboardingComplete: data.onboardingComplete,
          pendingSubscriptionCelebration: data.pendingSubscriptionCelebration === true,
          onboarding: normalizeOnboardingState(data.onboarding),
          tipsSeen: data.tipsSeen || {},
          celebratedBadgeIds: data.celebratedBadgeIds || [],
          licenses: data.licenses || {},
          appointmentMode: data.appointmentMode === 'video' ? 'video' : 'phone',
          defaultMeetingLink: data.defaultMeetingLink,
          autoCreateGoogleMeet: data.autoCreateGoogleMeet === true,
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
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
