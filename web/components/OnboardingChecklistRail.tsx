'use client';

import type { OnboardingMilestones } from '../app/dashboard/DashboardContext';

type ChecklistKey = keyof OnboardingMilestones;

interface ChecklistItem {
  key: ChecklistKey;
  label: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: 'profileCompleted', label: 'Set up profile' },
  { key: 'firstClientCreated', label: 'Add first client' },
  { key: 'firstWelcomeSent', label: 'Send first welcome text' },
  { key: 'firstPatchPromptSent', label: 'Send first Patch message' },
];

interface OnboardingChecklistRailProps {
  milestones: OnboardingMilestones;
  onboardingVisible: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  profilePhotoAdded?: boolean;
  agencyLogoAdded?: boolean;
  showTestingReset?: boolean;
  onTestingReset?: () => void;
  testingResetStatus?: 'idle' | 'loading' | 'success' | 'error';
  testingResetMessage?: string;
}

function getActiveChecklistKey(milestones: OnboardingMilestones): ChecklistKey | null {
  return CHECKLIST_ITEMS.find((item) => !milestones[item.key])?.key ?? null;
}

export default function OnboardingChecklistRail({
  milestones,
  onboardingVisible,
  onPause,
  onResume,
  onSkip,
  profilePhotoAdded = false,
  agencyLogoAdded = false,
  showTestingReset = false,
  onTestingReset,
  testingResetStatus = 'idle',
  testingResetMessage = '',
}: OnboardingChecklistRailProps) {
  const activeKey = getActiveChecklistKey(milestones);
  const completedCount = CHECKLIST_ITEMS.filter((item) => milestones[item.key]).length;

  return (
    <aside className="hidden md:block fixed right-4 top-20 z-[90] w-[280px]">
      <div className="rounded-xl border border-[#d0d0d0] bg-white shadow-[0_16px_32px_rgba(0,0,0,0.16)]">
        <div className="px-4 py-3 border-b border-[#ececec]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#0D4D4D]">Onboarding progress</p>
            <span className="text-xs font-semibold text-[#727272]">{completedCount}/{CHECKLIST_ITEMS.length}</span>
          </div>
        </div>

        <div className="px-3 py-3 space-y-2">
          {CHECKLIST_ITEMS.map((item) => {
            const done = milestones[item.key];
            const active = !done && activeKey === item.key;

            return (
              <div
                key={item.key}
                className={`rounded-[7px] border px-3 py-2 transition-colors ${
                  done
                    ? 'border-[#45bcaa]/40 bg-[#daf3f0]'
                    : active
                      ? 'border-[#3DD6C3] bg-[#f6fffd]'
                      : 'border-[#e8e8e8] bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done
                        ? 'bg-[#3DD6C3] text-[#0D4D4D]'
                        : active
                          ? 'bg-[#0D4D4D] text-[#3DD6C3]'
                          : 'bg-[#f0f0f0] text-[#8a8a8a]'
                    }`}
                  >
                    {done ? '✓' : active ? '•' : ''}
                  </span>
                  <p className="text-xs font-semibold text-[#0D4D4D]">{item.label}</p>
                </div>
                <p className="mt-1 ml-7 text-[11px] text-[#727272]">
                  {done ? 'Done' : active ? 'In progress' : 'Pending'}
                </p>
              </div>
            );
          })}
        </div>

        {milestones.profileCompleted && (
          <div className="mx-3 mb-3 rounded-[7px] border border-[#e8e8e8] bg-[#fafafa] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5f5f5f]">Recommended next (optional)</p>
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-[#4f4f4f]">{profilePhotoAdded ? '✓' : '•'} Add your profile photo in Settings {'>'} Profile</p>
              <p className="text-[11px] text-[#4f4f4f]">{agencyLogoAdded ? '✓' : '•'} Add your agency logo in Settings {'>'} Branding</p>
              <p className="text-[11px] text-[#4f4f4f]">• Review preferences in Settings {'>'} Referral &amp; AI</p>
            </div>
          </div>
        )}

        <div className="px-3 pb-3">
          <button
            onClick={onboardingVisible ? onPause : onResume}
            className="w-full rounded-[7px] border border-[#d0d0d0] bg-[#f8f8f8] px-3 py-2 text-xs font-semibold text-[#0D4D4D] hover:bg-white transition-colors"
          >
            {onboardingVisible ? 'Pause onboarding' : 'Resume onboarding'}
          </button>
          <button
            onClick={onSkip}
            className="mt-2 w-full rounded-[7px] border border-[#ffd7d7] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#b42318] hover:bg-[#ffecec] transition-colors"
          >
            Skip tutorial
          </button>
          {showTestingReset && onTestingReset ? (
            <>
              <button
                onClick={onTestingReset}
                disabled={testingResetStatus === 'loading'}
                className="mt-2 w-full rounded-[7px] border border-[#c9d6ff] bg-[#f4f7ff] px-3 py-2 text-xs font-semibold text-[#1d3f9f] hover:bg-[#eaf0ff] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {testingResetStatus === 'loading' ? 'Resetting onboarding...' : 'Test: Full reset onboarding'}
              </button>
              {testingResetMessage ? (
                <p className={`mt-1 text-[11px] ${testingResetStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {testingResetMessage}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
