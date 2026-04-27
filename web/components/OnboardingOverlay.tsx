'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  type OnboardingMilestoneKey,
  useDashboard,
} from '../app/dashboard/DashboardContext';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

interface OnboardingOverlayProps {
  agentName: string;
  onComplete: () => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  buttonLabel: string;
  route?: string;
  milestone?: OnboardingMilestoneKey;
}

type TargetName =
  | 'nav-settings'
  | 'nav-clients'
  | 'clients-add-client'
  | 'clients-send-welcome'
  | 'patch-launcher';

const STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to AgentForLife',
    description: 'Five quick actions: profile, first client, first welcome text, then Patch.',
    buttonLabel: 'Start Setup',
  },
  {
    id: 'profile',
    title: 'Set up your profile',
    description: 'Complete name, agency, phone, and photo/logo.',
    buttonLabel: 'Open Settings',
    route: '/dashboard/settings',
    milestone: 'profileCompleted',
  },
  {
    id: 'firstClient',
    title: 'Add your first client',
    description: 'Go to Clients, click Add Client, and create one record.',
    buttonLabel: 'Open Clients',
    route: '/dashboard/clients',
    milestone: 'firstClientCreated',
  },
  {
    id: 'firstWelcome',
    title: 'Send your first welcome message',
    description: 'In the welcome step, send the text with app link + code.',
    buttonLabel: 'Open Clients',
    route: '/dashboard/clients',
    milestone: 'firstWelcomeSent',
  },
  {
    id: 'patch',
    title: 'Say hi to Patch',
    description: 'Open Patch and send one quick message.',
    buttonLabel: 'Open Patch',
    milestone: 'firstPatchPromptSent',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findTarget(name: TargetName): HTMLElement | null {
  const target = document.querySelector<HTMLElement>(`[data-onboarding-target="${name}"]`);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return target;
}

export default function OnboardingOverlay({
  agentName,
  onComplete,
}: OnboardingOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    agentProfile,
    markOnboardingMilestone,
    setOnboardingCurrentStep,
    completeOnboarding,
  } = useDashboard();
  const [currentStep, setCurrentStep] = useState(agentProfile.onboarding?.currentStep ?? 0);
  const [started, setStarted] = useState((agentProfile.onboarding?.currentStep ?? 0) > 0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const firstName = agentName?.split(' ')[0] || 'there';

  const profileLooksComplete = useMemo(() => {
    const hasIdentity = Boolean(agentProfile.name?.trim() && agentProfile.agencyName?.trim() && agentProfile.phoneNumber?.trim());
    const hasVisual = Boolean(agentProfile.photoBase64 || agentProfile.photoURL || agentProfile.agencyLogoBase64);
    return hasIdentity && hasVisual;
  }, [agentProfile.name, agentProfile.agencyName, agentProfile.phoneNumber, agentProfile.photoBase64, agentProfile.photoURL, agentProfile.agencyLogoBase64]);

  const milestones = useMemo(() => {
    const required = agentProfile.onboarding?.requiredMilestones;
    return {
      profileCompleted: profileLooksComplete || required?.profileCompleted === true,
      firstClientCreated: required?.firstClientCreated === true,
      firstWelcomeSent: required?.firstWelcomeSent === true,
      firstPatchPromptSent: required?.firstPatchPromptSent === true,
    };
  }, [agentProfile.onboarding?.requiredMilestones, profileLooksComplete]);

  const allRequiredDone = milestones.profileCompleted
    && milestones.firstClientCreated
    && milestones.firstWelcomeSent
    && milestones.firstPatchPromptSent;

  useEffect(() => {
    const persistedStep = agentProfile.onboarding?.currentStep;
    if (typeof persistedStep !== 'number' || !Number.isFinite(persistedStep)) return;
    setCurrentStep(Math.max(0, Math.min(STEPS.length - 1, persistedStep)));
    if (persistedStep > 0) setStarted(true);
  }, [agentProfile.onboarding?.currentStep]);

  useEffect(() => {
    if (profileLooksComplete && !agentProfile.onboarding?.requiredMilestones?.profileCompleted) {
      void markOnboardingMilestone('profileCompleted');
    }
  }, [profileLooksComplete, agentProfile.onboarding?.requiredMilestones?.profileCompleted, markOnboardingMilestone]);

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
      step_name: STEPS[currentStep]?.id,
    });
  }, [currentStep]);

  useEffect(() => {
    void setOnboardingCurrentStep(currentStep);
  }, [currentStep, setOnboardingCurrentStep]);

  useEffect(() => {
    if (!allRequiredDone || currentStep !== STEPS.length - 1) return;
    captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'patch' });
  }, [allRequiredDone, currentStep]);

  const step = STEPS[currentStep];
  const primaryTargetCandidates = useMemo<TargetName[]>(() => {
    if (step.id === 'profile') return ['nav-settings'];
    if (step.id === 'firstClient') {
      return pathname.startsWith('/dashboard/clients') ? ['clients-add-client'] : ['nav-clients'];
    }
    if (step.id === 'firstWelcome') return ['clients-send-welcome', 'clients-add-client', 'nav-clients'];
    if (step.id === 'patch') return ['patch-launcher'];
    return [];
  }, [step.id, pathname]);
  const activeTargetName = primaryTargetCandidates[0];
  const stepComplete = step.milestone ? milestones[step.milestone] : started;
  const needsTarget = step.id !== 'welcome';

  useEffect(() => {
    if (!needsTarget) {
      setTargetRect(null);
      return;
    }

    let frame = 0;
    const sync = () => {
      const element = primaryTargetCandidates
        .map((name) => findTarget(name))
        .find((candidate): candidate is HTMLElement => candidate !== null);
      setTargetRect(element ? element.getBoundingClientRect() : null);
    };

    const queueSync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    queueSync();
    window.addEventListener('resize', queueSync);
    window.addEventListener('scroll', queueSync, true);
    const interval = window.setInterval(queueSync, 300);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', queueSync);
      window.removeEventListener('scroll', queueSync, true);
      window.clearInterval(interval);
    };
  }, [primaryTargetCandidates, needsTarget]);

  const goToNextStep = () => {
    if (currentStep >= STEPS.length - 1) return;
    setCurrentStep((prev) => Math.min(STEPS.length - 1, prev + 1));
  };

  const handleFinish = async () => {
    if (!allRequiredDone) return;
    await completeOnboarding();
    captureEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      total_steps: STEPS.length,
    });
    onComplete();
  };

  const handlePrimary = async () => {
    if (step.id === 'welcome') {
      setStarted(true);
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'welcome' });
      goToNextStep();
      return;
    }

    if (step.id === 'patch' && !milestones.firstPatchPromptSent) {
      window.dispatchEvent(new CustomEvent('afl:open-patch-assistant', { detail: { prompt: 'What should I do next?' } }));
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_BLOCKED, {
        step_name: step.id,
        reason: 'awaiting_patch_prompt',
      });
      return;
    }

    if (step.milestone && !milestones[step.milestone]) {
      if (step.route) {
        router.push(step.route);
      }
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_BLOCKED, {
        step_name: step.id,
        reason: 'milestone_pending',
      });
      return;
    }

    if (step.id === 'patch') {
      await handleFinish();
      return;
    }

    captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: step.id });
    goToNextStep();
  };

  const primaryLabel = (() => {
    if (step.id === 'welcome') return step.buttonLabel;
    if (step.id === 'patch') return milestones.firstPatchPromptSent ? 'Finish Setup' : step.buttonLabel;
    if (step.milestone && milestones[step.milestone]) return 'Continue';
    return step.buttonLabel;
  })();

  const spotlight = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') return null;
    const padding = 10;
    const left = clamp(targetRect.left - padding, 0, window.innerWidth);
    const top = clamp(targetRect.top - padding, 0, window.innerHeight);
    const right = clamp(targetRect.right + padding, 0, window.innerWidth);
    const bottom = clamp(targetRect.bottom + padding, 0, window.innerHeight);
    return {
      viewportWidth: window.innerWidth,
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      centerX: left + (right - left) / 2,
    };
  }, [targetRect]);

  const coachmarkStyle = useMemo(() => {
    if (!spotlight || typeof window === 'undefined') {
      return { left: '50%', top: 70, transform: 'translateX(-50%)', placement: 'floating' as const };
    }
    const cardWidth = Math.min(360, window.innerWidth - 24);
    const belowTop = spotlight.bottom + 14;
    const aboveTop = spotlight.top - 14 - 170;
    const canPlaceBelow = belowTop + 170 <= window.innerHeight - 12;
    const left = clamp(spotlight.centerX - cardWidth / 2, 12, window.innerWidth - cardWidth - 12);
    return {
      left,
      top: canPlaceBelow ? belowTop : Math.max(12, aboveTop),
      transform: 'none',
      placement: canPlaceBelow ? ('below' as const) : ('above' as const),
    };
  }, [spotlight]);

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {spotlight && (
        <>
          <div className="fixed left-0 right-0 top-0 bg-black/40 pointer-events-auto" style={{ height: spotlight.top }} />
          <div className="fixed left-0 bg-black/40 pointer-events-auto" style={{ top: spotlight.top, width: spotlight.left, height: spotlight.height }} />
          <div className="fixed right-0 bg-black/40 pointer-events-auto" style={{ top: spotlight.top, width: Math.max(0, spotlight.viewportWidth - spotlight.right), height: spotlight.height }} />
          <div className="fixed left-0 right-0 bottom-0 bg-black/40 pointer-events-auto" style={{ top: spotlight.bottom }} />
          <div
            className="fixed rounded-xl border-2 border-[#3DD6C3] shadow-[0_0_0_9999px_rgba(0,0,0,0.05)] pointer-events-none"
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
            }}
          />
        </>
      )}

      <div
        className="fixed w-[min(360px,calc(100vw-24px))] rounded-xl border border-black/10 bg-white shadow-xl pointer-events-auto"
        style={{
          left: coachmarkStyle.left,
          top: coachmarkStyle.top,
          transform: coachmarkStyle.transform,
        }}
      >
        <div className="h-1.5 bg-gray-100 rounded-t-xl">
          <div
            className="h-full bg-[#3DD6C3] transition-all duration-500 ease-out rounded-t-xl"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-4 py-4">
          {currentStep === 0 && (
            <p className="text-sm font-semibold text-[#0D4D4D] mb-1">Welcome, {firstName}</p>
          )}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#3DD6C3]">
              Step {currentStep + 1} of {STEPS.length}
            </span>
            {needsTarget && activeTargetName && (
              <span className="text-[11px] text-[#727272]">Click highlighted target</span>
            )}
          </div>
          <h3 className="text-base font-bold text-[#0D4D4D]">{step.title}</h3>
          <p className="text-sm text-[#4b4b4b] mt-1 leading-snug">{step.description}</p>

          {needsTarget && !targetRect && (
            <p className="text-xs text-[#8a5a00] bg-[#fff7db] border border-[#f5c451]/50 rounded px-2 py-1.5 mt-2">
              Waiting for target. Navigate if needed.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${
                currentStep === 0
                  ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'text-[#0D4D4D] border-[#d0d0d0] hover:bg-[#f8f8f8]'
              }`}
            >
              Back
            </button>
            <button
              onClick={() => {
                void handlePrimary();
              }}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[#3DD6C3] hover:bg-[#32c4b2] text-[#0D4D4D]"
            >
              {primaryLabel}
            </button>
          </div>
        </div>

        {spotlight && coachmarkStyle.placement !== 'floating' && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-[#3DD6C3] text-lg leading-none"
            style={{
              top: coachmarkStyle.placement === 'below' ? -14 : undefined,
              bottom: coachmarkStyle.placement === 'above' ? -14 : undefined,
            }}
          >
            {coachmarkStyle.placement === 'below' ? '↓' : '↑'}
          </div>
        )}
      </div>

      {spotlight && coachmarkStyle.placement !== 'floating' && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: spotlight.centerX - 1,
            top: coachmarkStyle.placement === 'below' ? coachmarkStyle.top - 10 : spotlight.bottom + 6,
            height: coachmarkStyle.placement === 'below'
              ? Math.max(8, spotlight.top - (coachmarkStyle.top - 10))
              : Math.max(8, coachmarkStyle.top - spotlight.bottom - 10),
            borderLeft: '2px dashed rgba(61,214,195,0.9)',
          }}
        />
      )}
    </div>
  );
}
