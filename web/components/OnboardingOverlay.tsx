'use client';

import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface OnboardingOverlayProps {
  agentUid: string;
  agentName: string;
  onComplete: () => void;
  onOpenProfile: () => void;
  onOpenClients?: () => void;
}

const STEPS = [
  {
    id: 'profile',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    title: 'Set Up Your Profile',
    description: 'Add your photo, phone number, and agency branding. This is what your clients see in the app.',
    buttonLabel: 'Open Settings',
    action: 'profile' as const,
  },
  {
    id: 'newClients',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
    title: 'Add New Clients',
    description: "Add one client at a time—typically at the end of an appointment. They'll instantly receive a text with a link to download the app and their unique code.",
    buttonLabel: 'Next',
    action: 'next' as const,
  },
  {
    id: 'bookOfBusiness',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Import Your Book of Business',
    description: "Have an existing client list? Use CSV import to upload your entire book of business in one go.",
    buttonLabel: 'Go to Clients',
    action: 'clients' as const,
  },
  {
    id: 'navigate',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    title: 'Find Your Way Around',
    description: 'Use Patch in the bottom-right corner to ask any question about how to use the dashboard. Use the sidebar on the left to switch between sections — Clients, Referrals, Retention, Rewrites, and more. Each section will show a quick tip the first time you visit.',
    buttonLabel: "Let's Go",
    action: 'finish' as const,
  },
];

export default function OnboardingOverlay({
  agentUid,
  agentName,
  onComplete,
  onOpenProfile,
  onOpenClients,
}: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const firstName = agentName?.split(' ')[0] || 'there';

  const markStepDone = (stepId: string) => {
    setCompletedSteps((prev) => new Set(prev).add(stepId));
  };

  const handleStepAction = (step: (typeof STEPS)[number]) => {
    markStepDone(step.id);

    if (step.action === 'profile') {
      onOpenProfile();
      handleFinish();
      return;
    } else if (step.action === 'clients') {
      onOpenClients?.();
      handleFinish();
      return;
    } else if (step.action === 'next') {
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        handleFinish();
      }
      return;
    } else if (step.action === 'finish') {
      handleFinish();
      return;
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    try {
      await setDoc(
        doc(db, 'agents', agentUid),
        { onboardingComplete: true },
        { merge: true }
      );
    } catch (err) {
      console.error('Error saving onboarding state:', err);
    }
    onComplete();
  };

  const step = STEPS[currentStep];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-[#3DD6C3] transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {currentStep === 0 && (
          <div className="px-8 pt-8 pb-2 text-center">
            <div className="w-16 h-16 bg-[#0D4D4D] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">👋</span>
            </div>
            <h2 className="text-2xl font-bold text-[#0D4D4D]">
              Welcome, {firstName}!
            </h2>
            <p className="text-[#707070] mt-2">
              A few quick steps and you&rsquo;re ready to go.
            </p>
          </div>
        )}

        <div className="px-8 py-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                completedSteps.has(step.id)
                  ? 'bg-[#3DD6C3]/20 text-[#005851]'
                  : 'bg-[#0D4D4D] text-[#3DD6C3]'
              }`}
            >
              {completedSteps.has(step.id) ? (
                <svg className="w-6 h-6 text-[#3DD6C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.icon
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[#3DD6C3] font-semibold uppercase tracking-wider">
                  Step {currentStep + 1} of {STEPS.length}
                </span>
              </div>
              <h3 className="text-lg font-bold text-[#0D4D4D] mb-1">{step.title}</h3>
              <p className="text-[#707070] text-sm leading-relaxed">{step.description}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 px-8 pb-4">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-8 bg-[#3DD6C3]'
                  : i < currentStep || completedSteps.has(s.id)
                  ? 'w-2 bg-[#3DD6C3]/40'
                  : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="px-8 pb-8 flex items-center justify-between gap-3">
          <button
            onClick={handleSkip}
            className="text-sm text-[#707070] hover:text-[#0D4D4D] font-medium transition-colors"
          >
            {currentStep < STEPS.length - 1 ? 'Skip' : 'Skip All'}
          </button>
          <button
            onClick={() => handleStepAction(step)}
            className="px-6 py-3 bg-[#3DD6C3] hover:bg-[#32c4b2] text-[#0D4D4D] font-semibold rounded-xl transition-all hover:shadow-lg min-h-[44px] text-sm"
          >
            {step.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
