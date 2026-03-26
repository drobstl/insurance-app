'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { isAdminEmail } from '../../lib/admin';
import { identifyAgent, resetPostHog } from '../../lib/posthog';

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
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
