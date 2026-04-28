'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  onPause?: () => void;
  onSkip?: () => void;
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
  | 'settings-tab-profile'
  | 'settings-tab-branding'
  | 'settings-name-input'
  | 'settings-phone-input'
  | 'settings-photo-upload'
  | 'settings-agency-input'
  | 'settings-logo-upload'
  | 'settings-save-button'
  | 'clients-add-client'
  | 'clients-addflow-expand-manual'
  | 'clients-addflow-create-client'
  | 'clients-addflow-confirm-create'
  | 'clients-send-welcome'
  | 'patch-launcher';

type ProfileSubStep = 'name' | 'agency' | 'phone' | 'visual' | 'save';
type TargetAdvanceMode = 'next' | 'click';

interface TargetBehavior {
  mode: TargetAdvanceMode;
  blockedReason: string;
  blockedMessage: string;
}

function isTextEntryElement(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  const nonTextTypes = new Set(['button', 'submit', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color']);
  return !nonTextTypes.has(element.type);
}

const TARGET_BEHAVIORS: Record<TargetName, TargetBehavior> = {
  'nav-settings': {
    mode: 'click',
    blockedReason: 'nav_settings_click_required',
    blockedMessage: 'Click Settings in the left sidebar.',
  },
  'nav-clients': {
    mode: 'click',
    blockedReason: 'nav_clients_click_required',
    blockedMessage: 'Click Clients in the left sidebar.',
  },
  'settings-tab-profile': {
    mode: 'click',
    blockedReason: 'settings_tab_profile_click_required',
    blockedMessage: 'Click Profile to continue.',
  },
  'settings-tab-branding': {
    mode: 'click',
    blockedReason: 'settings_tab_branding_click_required',
    blockedMessage: 'Click Branding to continue.',
  },
  'settings-name-input': {
    mode: 'next',
    blockedReason: 'settings_name_pending',
    blockedMessage: 'Enter your full name, then click Next.',
  },
  'settings-phone-input': {
    mode: 'next',
    blockedReason: 'settings_phone_pending',
    blockedMessage: 'Enter your phone number, then click Next.',
  },
  'settings-photo-upload': {
    mode: 'click',
    blockedReason: 'settings_photo_click_required',
    blockedMessage: 'Upload a photo or logo to continue.',
  },
  'settings-agency-input': {
    mode: 'next',
    blockedReason: 'settings_agency_pending',
    blockedMessage: 'Enter your agency name, then click Next.',
  },
  'settings-logo-upload': {
    mode: 'click',
    blockedReason: 'settings_logo_click_required',
    blockedMessage: 'Upload a photo or logo to continue.',
  },
  'settings-save-button': {
    mode: 'click',
    blockedReason: 'settings_save_click_required',
    blockedMessage: 'Wait for autosave or use Save Settings.',
  },
  'clients-add-client': {
    mode: 'click',
    blockedReason: 'clients_add_client_click_required',
    blockedMessage: 'Click Add Client to continue.',
  },
  'clients-addflow-expand-manual': {
    mode: 'click',
    blockedReason: 'clients_expand_manual_click_required',
    blockedMessage: 'Upload an application or click Expand Manual Entry to continue.',
  },
  'clients-addflow-create-client': {
    mode: 'next',
    blockedReason: 'clients_create_fields_pending',
    blockedMessage: 'Fill required client fields, then click Next.',
  },
  'clients-addflow-confirm-create': {
    mode: 'click',
    blockedReason: 'clients_confirm_create_click_required',
    blockedMessage: 'Click Confirm & Create to continue.',
  },
  'clients-send-welcome': {
    mode: 'click',
    blockedReason: 'clients_send_welcome_click_required',
    blockedMessage: 'Use Send Welcome Text to continue.',
  },
  'patch-launcher': {
    mode: 'click',
    blockedReason: 'patch_launcher_click_required',
    blockedMessage: 'Open Patch and send one message to continue.',
  },
};

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
  const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-onboarding-target="${name}"]`));
  for (const target of targets) {
    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const isInteractable = style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.pointerEvents !== 'none'
      && Number.parseFloat(style.opacity || '1') > 0.05;
    if (rect.width > 0 && rect.height > 0 && isInteractable) {
      return target;
    }
  }
  return null;
}

function getFirstIncompleteProfileSubStep(agentProfile: {
  name?: string;
  agencyName?: string;
  phoneNumber?: string;
  photoBase64?: string | null;
  photoURL?: string | null;
  agencyLogoBase64?: string | null;
}): ProfileSubStep {
  if ((agentProfile.name || '').trim().length === 0) return 'name';
  if ((agentProfile.agencyName || '').trim().length === 0) return 'agency';
  if ((agentProfile.phoneNumber || '').trim().length === 0) return 'phone';
  if (!(agentProfile.photoBase64 || agentProfile.photoURL || agentProfile.agencyLogoBase64)) return 'visual';
  return 'save';
}

function getProfileGuidedTargets(baseStep: ProfileSubStep): TargetName[] {
  if (baseStep === 'name') {
    return ['settings-name-input', 'settings-tab-branding', 'settings-agency-input', 'settings-tab-profile', 'settings-phone-input', 'settings-photo-upload'];
  }
  if (baseStep === 'agency') {
    return ['settings-tab-branding', 'settings-agency-input', 'settings-tab-profile', 'settings-phone-input', 'settings-photo-upload'];
  }
  if (baseStep === 'phone') return ['settings-tab-profile', 'settings-phone-input', 'settings-photo-upload'];
  if (baseStep === 'visual') return ['settings-photo-upload'];
  return [];
}

export default function OnboardingOverlay({
  agentName,
  onComplete,
  onPause,
  onSkip,
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
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [activeTargetName, setActiveTargetName] = useState<TargetName | null>(null);
  const [activeTargetElement, setActiveTargetElement] = useState<HTMLElement | null>(null);
  const [guidedIndex, setGuidedIndex] = useState(0);
  const [profileFlowStart, setProfileFlowStart] = useState<ProfileSubStep | null>(null);
  const [focusedProfileTarget, setFocusedProfileTarget] = useState<TargetName | null>(null);
  const [activeTargetDisabled, setActiveTargetDisabled] = useState(false);
  const [actionAck, setActionAck] = useState<string | null>(null);
  const [typedSinceFocusTarget, setTypedSinceFocusTarget] = useState<TargetName | null>(null);
  const profileAutoCompleteInFlightRef = useRef(false);
  const lastAutoScrollKeyRef = useRef<string | null>(null);
  const prevProfileCompletedRef = useRef<boolean>(false);

  const firstName = agentName?.split(' ')[0] || 'there';

  const profileLooksComplete = useMemo(() => {
    const hasIdentity = Boolean(agentProfile.name?.trim() && agentProfile.agencyName?.trim() && agentProfile.phoneNumber?.trim());
    const hasVisual = Boolean(agentProfile.photoBase64 || agentProfile.photoURL || agentProfile.agencyLogoBase64);
    return hasIdentity && hasVisual;
  }, [agentProfile.name, agentProfile.agencyName, agentProfile.phoneNumber, agentProfile.photoBase64, agentProfile.photoURL, agentProfile.agencyLogoBase64]);
  const isOnSettingsRoute = pathname.startsWith('/dashboard/settings');
  const profileSubStep = useMemo<ProfileSubStep>(() => getFirstIncompleteProfileSubStep(agentProfile), [
    agentProfile.name,
    agentProfile.agencyName,
    agentProfile.phoneNumber,
    agentProfile.photoBase64,
    agentProfile.photoURL,
    agentProfile.agencyLogoBase64,
  ]);

  const milestones = useMemo(() => {
    const required = agentProfile.onboarding?.requiredMilestones;
    return {
      profileCompleted: required?.profileCompleted === true,
      firstClientCreated: required?.firstClientCreated === true,
      firstWelcomeSent: required?.firstWelcomeSent === true,
      firstPatchPromptSent: required?.firstPatchPromptSent === true,
    };
  }, [agentProfile.onboarding?.requiredMilestones]);

  const allRequiredDone = milestones.profileCompleted
    && milestones.firstClientCreated
    && milestones.firstWelcomeSent
    && milestones.firstPatchPromptSent;
  const step = STEPS[currentStep];
  const currentMilestoneIncomplete = step.milestone ? !milestones[step.milestone] : false;

  useEffect(() => {
    const persistedStep = agentProfile.onboarding?.currentStep;
    if (typeof persistedStep !== 'number' || !Number.isFinite(persistedStep)) return;
    setCurrentStep(Math.max(0, Math.min(STEPS.length - 1, persistedStep)));
  }, [agentProfile.onboarding?.currentStep]);

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

  useEffect(() => {
    setGuidedIndex(0);
    setProfileFlowStart(null);
  }, [step.id, pathname]);

  useEffect(() => {
    if (step.id !== 'profile' || !isOnSettingsRoute || milestones.profileCompleted) return;
    if (profileFlowStart) return;
    setProfileFlowStart(profileSubStep);
  }, [step.id, isOnSettingsRoute, milestones.profileCompleted, profileFlowStart, profileSubStep]);

  useEffect(() => {
    const editableTargets = new Set<TargetName>([
      'settings-name-input',
      'settings-agency-input',
      'settings-phone-input',
    ]);
    const syncFocusedTarget = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        setFocusedProfileTarget(null);
        return;
      }
      const targetName = active.getAttribute('data-onboarding-target') as TargetName | null;
      setFocusedProfileTarget(targetName && editableTargets.has(targetName) ? targetName : null);
    };
    const handleFocusIn = () => syncFocusedTarget();
    const handleFocusOut = () => window.setTimeout(syncFocusedTarget, 0);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  const guidedTargets = useMemo<TargetName[]>(() => {
    if (step.id === 'profile') {
      if (!isOnSettingsRoute) return ['nav-settings'];
      const baseStep = profileFlowStart ?? profileSubStep;
      return getProfileGuidedTargets(baseStep);
    }
    if (step.id === 'firstClient') {
      return pathname.startsWith('/dashboard/clients')
        ? ['clients-add-client', 'clients-addflow-expand-manual', 'clients-addflow-create-client', 'clients-addflow-confirm-create']
        : ['nav-clients'];
    }
    if (step.id === 'firstWelcome') {
      return pathname.startsWith('/dashboard/clients')
        ? ['clients-send-welcome']
        : ['nav-clients'];
    }
    if (step.id === 'patch') return ['patch-launcher'];
    return [];
  }, [step.id, isOnSettingsRoute, pathname, profileFlowStart, profileSubStep]);
  const activeGuidedTarget = guidedTargets[Math.min(guidedIndex, Math.max(0, guidedTargets.length - 1))] ?? null;
  const displayedGuidedTarget = focusedProfileTarget ?? activeGuidedTarget;
  const hasGuidedSequence = (step.id === 'profile' || step.id === 'firstClient') && step.milestone && !milestones[step.milestone];

  const primaryTargetCandidates = useMemo<TargetName[]>(() => {
    if (focusedProfileTarget) return [focusedProfileTarget];
    if (activeGuidedTarget) return [activeGuidedTarget];
    if (step.id === 'profile') {
      if (!isOnSettingsRoute) return ['nav-settings'];
      if (profileSubStep === 'save') return ['settings-save-button'];
      return [];
    }
    if (step.id === 'firstClient' || step.id === 'firstWelcome') return ['nav-clients'];
    if (step.id === 'patch') return ['patch-launcher'];
    return [];
  }, [focusedProfileTarget, activeGuidedTarget, step.id, isOnSettingsRoute, profileSubStep]);
  const needsTarget = step.id !== 'welcome';

  useEffect(() => {
    if (!needsTarget) {
      setTargetRect(null);
      setActiveTargetElement(null);
      return;
    }

    let frame = 0;
    const sync = () => {
      const resolved = primaryTargetCandidates
        .map((name) => ({ name, element: findTarget(name) }))
        .find((candidate): candidate is { name: TargetName; element: HTMLElement } => candidate.element !== null);
      setTargetRect(resolved?.element.getBoundingClientRect() ?? null);
      setActiveTargetName(resolved?.name ?? null);
      setActiveTargetElement(resolved?.element ?? null);
      const isDisabled = Boolean(
        resolved?.element
        && (
          resolved.element.matches(':disabled')
          || resolved.element.getAttribute('aria-disabled') === 'true'
        )
      );
      setActiveTargetDisabled(isDisabled);
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

  useEffect(() => {
    if (!activeTargetName || !activeTargetElement || !currentMilestoneIncomplete || activeTargetDisabled) {
      return;
    }
    const behavior = TARGET_BEHAVIORS[activeTargetName];
    if (behavior.mode !== 'click') return;
    activeTargetElement.classList.add('afl-onboarding-click-pulse');
    return () => {
      activeTargetElement.classList.remove('afl-onboarding-click-pulse');
    };
  }, [
    activeTargetName,
    activeTargetElement,
    currentMilestoneIncomplete,
    activeTargetDisabled,
  ]);

  useEffect(() => {
    if (!displayedGuidedTarget || activeTargetName !== displayedGuidedTarget || !activeTargetElement) {
      return;
    }
    if (TARGET_BEHAVIORS[displayedGuidedTarget].mode !== 'next') return;
    if (!isTextEntryElement(activeTargetElement)) return;

    setTypedSinceFocusTarget((prev) => (prev === displayedGuidedTarget ? prev : null));
    const handleInput = () => {
      setTypedSinceFocusTarget(displayedGuidedTarget);
    };
    activeTargetElement.addEventListener('input', handleInput);
    return () => activeTargetElement.removeEventListener('input', handleInput);
  }, [displayedGuidedTarget, activeTargetName, activeTargetElement]);

  useEffect(() => {
    if (!activeTargetElement || !displayedGuidedTarget) return;
    if (activeTargetName !== displayedGuidedTarget) return;
    if (focusedProfileTarget) return;

    const scrollKey = `${step.id}:${guidedIndex}:${displayedGuidedTarget}`;
    if (lastAutoScrollKeyRef.current === scrollKey) return;

    const rect = activeTargetElement.getBoundingClientRect();
    const topClearance = 86;
    const bottomClearance = 170;
    const isComfortablyVisible = rect.top >= topClearance && rect.bottom <= (window.innerHeight - bottomClearance);

    if (!isComfortablyVisible) {
      lastAutoScrollKeyRef.current = scrollKey;
      activeTargetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
      setActionAck('Bringing the next action into view...');
      return;
    }

    lastAutoScrollKeyRef.current = scrollKey;
  }, [
    activeTargetElement,
    activeTargetName,
    displayedGuidedTarget,
    focusedProfileTarget,
    guidedIndex,
    step.id,
  ]);

  useEffect(() => {
    if (!hasGuidedSequence || !activeGuidedTarget) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const clicked = target.closest<HTMLElement>('[data-onboarding-target]');
      if (!clicked) return;
      const clickedTarget = clicked.getAttribute('data-onboarding-target') as TargetName | null;
      if (!clickedTarget) return;
      if (clickedTarget !== activeGuidedTarget) return;
      if (TARGET_BEHAVIORS[clickedTarget].mode !== 'click') return;

      const nextIndex = guidedIndex + 1;
      if (nextIndex < guidedTargets.length) {
        // Move one guidance step after the real UI click.
        setGuidedIndex(nextIndex);
        setActionAck('Nice - moving to next action.');
      }
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [activeGuidedTarget, guidedIndex, guidedTargets, hasGuidedSequence]);

  useEffect(() => {
    if (!hasGuidedSequence || !activeGuidedTarget) return;
    if (activeTargetName === activeGuidedTarget) return;

    const currentExists = Boolean(findTarget(activeGuidedTarget));
    if (currentExists) return;

    const nextAvailableIndex = guidedTargets.findIndex((target, index) => {
      if (index <= guidedIndex) return false;
      return Boolean(findTarget(target));
    });
    if (nextAvailableIndex <= guidedIndex) return;

    setGuidedIndex(nextAvailableIndex);
    setActionAck('Adjusted to the next available action.');
  }, [
    hasGuidedSequence,
    activeGuidedTarget,
    activeTargetName,
    guidedTargets,
    guidedIndex,
  ]);

  useEffect(() => {
    if (!actionAck) return;
    const timer = window.setTimeout(() => setActionAck(null), 1100);
    return () => window.clearTimeout(timer);
  }, [actionAck]);

  const goToNextStep = () => {
    if (currentStep >= STEPS.length - 1) return;
    setCurrentStep((prev) => Math.min(STEPS.length - 1, prev + 1));
  };
  useEffect(() => {
    if (step.id === 'profile' && milestones.profileCompleted) {
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'profile' });
      goToNextStep();
      return;
    }
    if (step.id === 'firstClient' && milestones.firstClientCreated) {
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'firstClient' });
      goToNextStep();
      return;
    }
    if (step.id === 'firstWelcome' && milestones.firstWelcomeSent) {
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'firstWelcome' });
      goToNextStep();
    }
  }, [step.id, milestones.profileCompleted, milestones.firstClientCreated, milestones.firstWelcomeSent]);

  useEffect(() => {
    const wasProfileCompleted = prevProfileCompletedRef.current;
    if (!wasProfileCompleted && milestones.profileCompleted) {
      const remainingSteps = [
        milestones.firstClientCreated,
        milestones.firstWelcomeSent,
        milestones.firstPatchPromptSent,
      ].filter((done) => !done).length;
      const stepWord = remainingSteps === 1 ? 'step' : 'steps';
      setActionAck(`Profile complete. Just ${remainingSteps} more ${stepWord} to go - you're an onboarding all-star.`);
    }
    prevProfileCompletedRef.current = milestones.profileCompleted;
  }, [
    milestones.profileCompleted,
    milestones.firstClientCreated,
    milestones.firstWelcomeSent,
    milestones.firstPatchPromptSent,
  ]);

  useEffect(() => {
    if (step.id !== 'profile') {
      profileAutoCompleteInFlightRef.current = false;
      return;
    }
    if (milestones.profileCompleted) return;
    if (!profileLooksComplete) return;
    if (profileAutoCompleteInFlightRef.current) return;
    profileAutoCompleteInFlightRef.current = true;

    void markOnboardingMilestone('profileCompleted')
      .then(() => {
        setActionAck('Profile already complete - moving on.');
      })
      .catch(() => {
        profileAutoCompleteInFlightRef.current = false;
      });
  }, [
    step.id,
    milestones.profileCompleted,
    profileLooksComplete,
    markOnboardingMilestone,
  ]);

  const handleFinish = async () => {
    if (!allRequiredDone) return;
    await completeOnboarding();
    captureEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      total_steps: STEPS.length,
    });
    onComplete();
  };

  const blockStep = (reason: string, message: string) => {
    setActionAck(message);
    captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_BLOCKED, {
      step_name: step.id,
      reason,
    });
  };

  const handlePrimary = async () => {
    if (step.id === 'welcome') {
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'welcome' });
      goToNextStep();
      return;
    }

    if (step.id === 'profile' && !milestones.profileCompleted && !isOnSettingsRoute) {
      router.push('/dashboard/settings');
      return;
    }

    if (step.id === 'firstClient' && !milestones.firstClientCreated && !pathname.startsWith('/dashboard/clients')) {
      router.push('/dashboard/clients');
      return;
    }

    if (step.id === 'firstWelcome' && !milestones.firstWelcomeSent && !pathname.startsWith('/dashboard/clients')) {
      router.push('/dashboard/clients');
      return;
    }

    if (step.id === 'patch' && !milestones.firstPatchPromptSent) {
      window.dispatchEvent(new CustomEvent('afl:open-patch-assistant', { detail: { prompt: 'What should I do next?' } }));
      blockStep('awaiting_patch_prompt', 'Patch opened. Send one message to continue.');
      return;
    }

    if (step.milestone && !milestones[step.milestone]) {
      if (step.id === 'profile' || step.id === 'firstClient') {
        if (!displayedGuidedTarget) {
          blockStep('guided_target_missing', 'Waiting for the highlighted action to load.');
          return;
        }
        if (activeTargetName !== displayedGuidedTarget) {
          blockStep('guided_target_not_ready', 'Complete the highlighted action first.');
          return;
        }
        const targetBehavior = TARGET_BEHAVIORS[displayedGuidedTarget];
        if (targetBehavior.mode !== 'next') {
          blockStep(targetBehavior.blockedReason, targetBehavior.blockedMessage);
          return;
        }

        const nextIndex = guidedIndex + 1;
        if (nextIndex < guidedTargets.length) {
          const nextTarget = findTarget(guidedTargets[nextIndex]);
          if (nextTarget) {
            setGuidedIndex(nextIndex);
          } else {
            blockStep('next_target_not_ready', 'Use the highlighted action first.');
          }
          return;
        }

        if (step.id === 'profile') {
          blockStep('profile_autosave_pending', 'Waiting for autosave to finish this profile step.');
          return;
        }
      }
      blockStep('milestone_pending', 'Finish the highlighted action to continue.');
      return;
    }

    if (step.id === 'patch') {
      await handleFinish();
      return;
    }

    captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: step.id });
    goToNextStep();
  };

  useEffect(() => {
    const handleSettingsSaved = async () => {
      if (step.id !== 'profile') return;
      if (!isOnSettingsRoute) return;
      if (!profileLooksComplete) return;

      if (!milestones.profileCompleted) {
        await markOnboardingMilestone('profileCompleted');
      }
      captureEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, { step_name: 'profile' });
      goToNextStep();
    };

    window.addEventListener('afl:settings-saved', handleSettingsSaved);
    return () => window.removeEventListener('afl:settings-saved', handleSettingsSaved);
  }, [
    step.id,
    isOnSettingsRoute,
    profileLooksComplete,
    milestones.profileCompleted,
    markOnboardingMilestone,
  ]);

  const primaryLabel = (() => {
    if (step.id === 'welcome') return step.buttonLabel;
    if (step.id === 'profile' && !milestones.profileCompleted) return 'Next';
    if (step.id === 'firstClient' && !milestones.firstClientCreated) return 'Next';
    if (step.id === 'firstWelcome' && !milestones.firstWelcomeSent) return 'Next';
    if (step.milestone && !milestones[step.milestone]) return 'Next';
    if (step.id === 'patch') return milestones.firstPatchPromptSent ? 'Finish Setup' : step.buttonLabel;
    if (step.milestone && milestones[step.milestone]) return 'Continue';
    return step.buttonLabel;
  })();
  const showPrimaryButton = (() => {
    if (step.id === 'welcome') return true;
    if (step.id === 'patch') return true;
    if (step.id === 'profile' && !milestones.profileCompleted) {
      if (!displayedGuidedTarget) return false;
      if (activeTargetName !== displayedGuidedTarget) return false;
      if (profileSubStep === 'save') return false;
      if (TARGET_BEHAVIORS[displayedGuidedTarget].mode === 'next'
        && activeTargetElement
        && isTextEntryElement(activeTargetElement)
        && typedSinceFocusTarget !== displayedGuidedTarget) {
        return false;
      }
      return TARGET_BEHAVIORS[displayedGuidedTarget].mode === 'next';
    }
    if (step.id === 'firstClient' && !milestones.firstClientCreated) {
      if (!displayedGuidedTarget) return false;
      if (activeTargetName !== displayedGuidedTarget) return false;
      if (TARGET_BEHAVIORS[displayedGuidedTarget].mode === 'next'
        && activeTargetElement
        && isTextEntryElement(activeTargetElement)
        && typedSinceFocusTarget !== displayedGuidedTarget) {
        return false;
      }
      return TARGET_BEHAVIORS[displayedGuidedTarget].mode === 'next';
    }
    if (step.id === 'firstWelcome' && !milestones.firstWelcomeSent) return false;
    return true;
  })();
  const stepDescription = (() => {
    if (step.id !== 'profile' || !isOnSettingsRoute || milestones.profileCompleted) return step.description;
    if (displayedGuidedTarget === 'settings-name-input') return 'Enter your full name in the highlighted field.';
    if (displayedGuidedTarget === 'settings-tab-branding') return 'Click Branding to continue to the next setup item.';
    if (displayedGuidedTarget === 'settings-agency-input') return 'Enter your agency name in the highlighted field.';
    if (displayedGuidedTarget === 'settings-tab-profile') return 'Click Profile to continue to the next setup item.';
    if (displayedGuidedTarget === 'settings-phone-input') return 'Enter your phone number in Personal Info.';
    if (displayedGuidedTarget === 'settings-photo-upload' || displayedGuidedTarget === 'settings-logo-upload') {
      return 'Upload a profile photo or agency logo.';
    }
    return 'Click Save Settings to complete this step.';
  })();
  const contextualDescription = (() => {
    if (step.id === 'profile' && !milestones.profileCompleted) {
      if (!isOnSettingsRoute) return 'Click Settings in the left sidebar.';
      if (displayedGuidedTarget === 'settings-name-input') return 'Enter your full name, then click Next.';
      if (displayedGuidedTarget === 'settings-tab-branding') return 'Click Branding.';
      if (displayedGuidedTarget === 'settings-agency-input') return 'Enter your agency name, then click Next.';
      if (displayedGuidedTarget === 'settings-tab-profile') return 'Click Profile.';
      if (displayedGuidedTarget === 'settings-phone-input') return 'Enter your phone number, then click Next.';
      if (displayedGuidedTarget === 'settings-photo-upload' || displayedGuidedTarget === 'settings-logo-upload') {
        return 'Upload a photo or logo, then wait for autosave.';
      }
      if (profileLooksComplete) return 'Profile already complete. Finalizing this step now.';
      return 'Wait for autosave to complete this profile step.';
    }
    if (step.id === 'firstClient' && !milestones.firstClientCreated) {
      if (!pathname.startsWith('/dashboard/clients')) return 'Go to Clients to start this step.';
      if (activeGuidedTarget === 'clients-add-client') return 'Click Add Client to open the guided create flow.';
      if (activeGuidedTarget === 'clients-addflow-expand-manual') {
        return 'Upload an application PDF or click Expand Manual Entry.';
      }
      if (activeGuidedTarget === 'clients-addflow-create-client') return 'Fill the required client fields, then click Next.';
      if (activeGuidedTarget === 'clients-addflow-confirm-create') return 'Click Confirm & Create, then this step auto-completes.';
      return 'Create one client to unlock the next onboarding step.';
    }
    if (step.id === 'firstWelcome' && !milestones.firstWelcomeSent) {
      if (!pathname.startsWith('/dashboard/clients')) return 'Go to Clients to send your first welcome text.';
      if (activeGuidedTarget === 'clients-send-welcome' && activeTargetDisabled) {
        return 'Send Welcome Text is disabled because this client has no phone number. Add a phone, then return here.';
      }
      if (activeGuidedTarget === 'clients-send-welcome') return 'Review the draft and send the welcome text.';
      return 'Finish creating a client first, then send the welcome text.';
    }
    if (step.id === 'patch' && !milestones.firstPatchPromptSent) {
      return 'Open Patch and send one message. Once sent, this step unlocks automatically.';
    }
    return stepDescription;
  })();
  const blockedUiHint = (() => {
    if (displayedGuidedTarget && activeTargetName === displayedGuidedTarget) {
      const behavior = TARGET_BEHAVIORS[displayedGuidedTarget];
      if (behavior.mode === 'next'
        && activeTargetElement
        && isTextEntryElement(activeTargetElement)
        && typedSinceFocusTarget !== displayedGuidedTarget) {
        return 'Start typing in the highlighted field to enable Next.';
      }
      if (behavior.mode === 'click') return behavior.blockedMessage;
    }
    if (step.id === 'profile' || step.id === 'firstClient') {
      if (displayedGuidedTarget && activeTargetName !== displayedGuidedTarget) {
        return 'Waiting for the highlighted target to be available.';
      }
      if (step.id === 'profile' && profileLooksComplete && !milestones.profileCompleted) {
        return 'Finalizing profile step...';
      }
    }
    return 'Use the highlighted UI action to continue';
  })();
  const topActionHint = (() => {
    if (!needsTarget || !targetRect || !displayedGuidedTarget || activeTargetName !== displayedGuidedTarget) return null;
    const behavior = TARGET_BEHAVIORS[displayedGuidedTarget];
    return behavior.mode === 'next' ? 'Use highlighted field' : 'Click highlighted target';
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
      {!spotlight && (
        <div className="fixed inset-0 bg-black/50 pointer-events-auto" />
      )}
      {spotlight && (
        <>
          <div
            className="fixed left-0 right-0 top-0 bg-black/55 pointer-events-auto transition-[height] duration-300 ease-out"
            style={{ height: spotlight.top }}
          />
          <div
            className="fixed left-0 bg-black/55 pointer-events-auto transition-[top,width,height] duration-300 ease-out"
            style={{ top: spotlight.top, width: spotlight.left, height: spotlight.height }}
          />
          <div
            className="fixed right-0 bg-black/55 pointer-events-auto transition-[top,width,height] duration-300 ease-out"
            style={{ top: spotlight.top, width: Math.max(0, spotlight.viewportWidth - spotlight.right), height: spotlight.height }}
          />
          <div
            className="fixed left-0 right-0 bottom-0 bg-black/55 pointer-events-auto transition-[top] duration-300 ease-out"
            style={{ top: spotlight.bottom }}
          />
          <div
            className="fixed rounded-xl border-2 border-[#3DD6C3] shadow-[0_0_0_9999px_rgba(0,0,0,0.06),0_0_0_3px_rgba(61,214,195,0.25)] pointer-events-none transition-[left,top,width,height] duration-300 ease-out"
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
            }}
          />
          <div
            className="fixed rounded-xl border-2 border-[#3DD6C3] animate-[pulse_0.85s_ease-out_infinite] pointer-events-none transition-[left,top,width,height] duration-300 ease-out"
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
              boxShadow: '0 0 0 8px rgba(61,214,195,0.40), 0 0 26px rgba(61,214,195,0.60)',
            }}
          />
        </>
      )}

      <div
        className="fixed w-[min(380px,calc(100vw-24px))] rounded-xl border-2 border-[#0D4D4D]/20 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] pointer-events-auto transition-[left,top,transform] duration-300 ease-out"
        style={{
          left: coachmarkStyle.left,
          top: coachmarkStyle.top,
          transform: coachmarkStyle.transform,
        }}
      >
        <div className="px-4 py-4">
          <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-1 rounded-full bg-[#0D4D4D] text-[#3DD6C3] text-[10px] font-semibold uppercase tracking-wide">
            Onboarding
          </div>
          {currentStep === 0 && (
            <p className="text-sm font-semibold text-[#0D4D4D] mb-1">Welcome, {firstName}</p>
          )}
          <div className="flex items-center gap-2 mb-1 min-h-[14px]">
            {topActionHint && <span className="text-[11px] text-[#727272]">{topActionHint}</span>}
          </div>
          <h3 className="text-base font-bold text-[#0D4D4D]">{step.title}</h3>
          <p className="text-sm text-[#4b4b4b] mt-1 leading-snug">{contextualDescription}</p>
          {actionAck && (
            <p className="text-xs text-[#0D4D4D] font-semibold mt-1">{actionAck}</p>
          )}

          <div className={`mt-3 flex items-center gap-2 ${currentStep > 0 ? 'justify-end' : 'justify-center'}`}>
            {showPrimaryButton ? (
              <button
                onClick={() => {
                  void handlePrimary();
                }}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#3DD6C3] hover:bg-[#32c4b2] text-[#0D4D4D] afl-onboarding-primary-pulse"
              >
                {primaryLabel}
              </button>
            ) : (
              <div className="text-[11px] text-[#727272] font-medium">{blockedUiHint}</div>
            )}
          </div>
          {(onPause || onSkip) && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#ececec] pt-3">
              {onPause ? (
                <button
                  onClick={onPause}
                  className="px-3 py-1.5 rounded text-xs font-semibold border border-[#d0d0d0] bg-[#f8f8f8] text-[#0D4D4D] hover:bg-white"
                >
                  Pause
                </button>
              ) : <span />}
              {onSkip ? (
                <button
                  onClick={onSkip}
                  className="px-3 py-1.5 rounded text-xs font-semibold border border-[#ffd7d7] bg-[#fff5f5] text-[#b42318] hover:bg-[#ffecec]"
                >
                  Skip tutorial
                </button>
              ) : null}
            </div>
          )}
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
          className="fixed pointer-events-none transition-[left,top,height] duration-300 ease-out"
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
      <style jsx global>{`
        @keyframes aflOnboardingClickPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(61, 214, 195, 0.75);
          }
          70% {
            box-shadow: 0 0 0 11px rgba(61, 214, 195, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(61, 214, 195, 0);
          }
        }
        @keyframes aflOnboardingPrimaryPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(61, 214, 195, 0.65);
          }
          70% {
            box-shadow: 0 0 0 9px rgba(61, 214, 195, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(61, 214, 195, 0);
          }
        }
        .afl-onboarding-click-pulse {
          animation: aflOnboardingClickPulse 0.95s ease-out infinite;
        }
        .afl-onboarding-primary-pulse {
          animation: aflOnboardingPrimaryPulse 1s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
