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
  // Phase 1 Track B — HARD onboarding gates per
  // docs/AFL_Phase_1_Planning_Notes_2026-05-04.md §2 and CONTEXT.md >
  // Channel Rules > Phase 1 implementation constraints. Without both,
  // the welcome flow does not work for that agent — no notification
  // surface, no fast send surface. Skip Tutorial cannot satisfy these.
  pwaInstalled: boolean;
  webPushGranted: boolean;
}

export interface OnboardingState {
  version: number;
  currentStep: number;
  requiredMilestones: OnboardingMilestones;
}

export type OnboardingMilestoneKey = keyof OnboardingMilestones;

const DEFAULT_ONBOARDING_MILESTONES: OnboardingMilestones = {
  profileCompleted: false,
  firstClientCreated: false,
  firstWelcomeSent: false,
  firstPatchPromptSent: false,
  pwaInstalled: false,
  webPushGranted: false,
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  version: 1,
  currentStep: 0,
  requiredMilestones: DEFAULT_ONBOARDING_MILESTONES,
};
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

function areAllOnboardingMilestonesComplete(milestones: OnboardingMilestones): boolean {
  return Object.values(milestones).every(Boolean);
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
  setOnboardingCurrentStep: (step: number) => Promise<void>;
  completeOnboarding: () => Promise<void>;
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

  const setOnboardingCurrentStep = useCallback(async (step: number) => {
    if (!user) return;
    const safeStep = Number.isFinite(step) ? Math.max(0, Math.round(step)) : 0;
    const currentOnboarding = normalizeOnboardingState(agentProfile.onboarding);

    if (currentOnboarding.currentStep === safeStep) return;

    const nextOnboarding: OnboardingState = {
      ...currentOnboarding,
      currentStep: safeStep,
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
      console.error('Error setting onboarding step:', error);
    }
  }, [user, agentProfile.onboarding]);

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    const currentOnboarding = normalizeOnboardingState(agentProfile.onboarding);
    const completed = areAllOnboardingMilestonesComplete(currentOnboarding.requiredMilestones);
    if (!completed) return;

    try {
      await setDoc(
        doc(db, 'agents', user.uid),
        {
          onboarding: {
            ...currentOnboarding,
            updatedAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          },
          onboardingComplete: true,
        },
        { merge: true },
      );
      setAgentProfile((prev) => ({
        ...prev,
        onboarding: currentOnboarding,
        onboardingComplete: true,
      }));
    } catch (error) {
      console.error('Error completing onboarding:', error);
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
        setOnboardingCurrentStep,
        completeOnboarding,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
