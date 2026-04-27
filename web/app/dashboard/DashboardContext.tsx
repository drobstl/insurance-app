'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { isAdminEmail } from '../../lib/admin';
import { identifyAgent, resetPostHog } from '../../lib/posthog';

export interface OnboardingMilestones {
  profileCompleted: boolean;
  firstClientCreated: boolean;
  firstWelcomeSent: boolean;
  firstPatchPromptSent: boolean;
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
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  version: 1,
  currentStep: 0,
  requiredMilestones: DEFAULT_ONBOARDING_MILESTONES,
};

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
  skipWelcomeSmsConfirmation?: boolean;
  onboardingComplete?: boolean;
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
        resetPostHog();
        router.push('/login');
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
    try {
      const agentDoc = await getDoc(doc(db, 'agents', user.uid));
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
          skipWelcomeSmsConfirmation: data.skipWelcomeSmsConfirmation,
          onboardingComplete: data.onboardingComplete,
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
