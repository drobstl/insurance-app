'use client';

import Link from 'next/link';
import { useDashboard } from '../app/dashboard/DashboardContext';

// The calm first-run Home for a brand-new agent. Instead of the full cockpit
// (a $0 hero, zeroed metrics, refer-and-earn before they have a client), a new
// agent sees a short, finite "get set up" path with Patch wired in. The real
// dashboard takes over once onboarding is complete (gated in page.tsx).
//
// Deliberately only THREE steps, ordered so the first-client ritual (the
// graduation trigger) is last — so the checklist completes right as they
// graduate, never mid-way. Each step's done-state reads the real milestone /
// paired-phone signal, so it's true, not a demo. Deeper features (calendar,
// coaching, retention) are taught just-in-time via Patch nudges at the moment
// they're relevant — NOT crammed into day-one setup.

type Step = {
  key: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
  patchPrompt: string;
};

function askPatch(prompt: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('afl:open-patch-assistant', { detail: { prompt } }));
}

export default function GetStartedHome() {
  const { agentProfile } = useDashboard();
  const milestones = agentProfile.onboarding?.requiredMilestones;
  const firstName = agentProfile.name ? agentProfile.name.split(' ')[0] : '';

  const steps: Step[] = [
    {
      key: 'profile',
      title: 'Finish your profile',
      desc: 'So your app shows up branded as you — your face, your card.',
      href: '/dashboard/settings?tab=profile',
      cta: 'Open profile',
      done: milestones?.profileCompleted === true,
      patchPrompt: 'How do I set up my profile and branding?',
    },
    {
      key: 'phone',
      title: 'Pair your phone',
      desc: 'So clients reach you instantly — and you get buzzed the moment a lead books.',
      href: '/dashboard/pair-phone',
      cta: 'Pair phone',
      done: agentProfile.phonePaired === true,
      patchPrompt: 'How do I pair my phone, and why does it matter?',
    },
    {
      key: 'client',
      title: 'Onboard your first client',
      desc: 'The 90-second ritual — and the moment to ask for the referral.',
      href: '/dashboard/clients',
      cta: 'Add a client',
      done: milestones?.firstClientCreated === true,
      patchPrompt: "What's the 90-second onboarding ritual?",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <div className="mt-2 max-w-2xl mx-auto">
      <div className="text-[12px] font-semibold tracking-wide text-[#0f6e56] mb-1">GET SET UP</div>
      <h1 className="text-2xl md:text-3xl font-bold text-[#1a1a1a]">
        Welcome{firstName ? `, ${firstName}` : ''} — let&apos;s get you rolling.
      </h1>
      <p className="text-[#5a5a5a] text-sm mt-1.5">
        Three quick things and AFL is working for you. Patch is right here if you want a hand with any of them.
      </p>

      <div className="flex items-center gap-3 mt-5 mb-3">
        <div className="flex-1 h-2 bg-[#dfe7e4] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1D9E75] rounded-full transition-all duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-[13px] font-semibold text-[#0f6e56] whitespace-nowrap">
          {doneCount === steps.length ? 'Ready!' : `${doneCount} of ${steps.length}`}
        </span>
      </div>

      <div className="bg-white border-2 border-[#005851] border-r-[5px] border-b-[5px] rounded-2xl p-1.5">
        {steps.map((s, i) => {
          const active = i === activeIndex;
          return (
            <div key={s.key} className={`flex items-center gap-3 p-3 rounded-xl ${active ? 'bg-[#f1faf7]' : ''}`}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white text-sm ${
                  s.done ? 'bg-[#1D9E75]' : active ? 'border-2 border-[#1D9E75]' : 'border-2 border-[#cfcfcf]'
                }`}
              >
                {s.done ? '✓' : ''}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[14.5px] font-semibold ${s.done ? 'text-[#8a8a8a] line-through' : 'text-[#1a1a1a]'}`}>
                  {s.title}
                </div>
                <div className="text-[12.5px] text-[#6a6a6a]">{s.desc}</div>
              </div>
              {s.done ? (
                <span className="text-[12.5px] text-[#9a9a9a] font-medium shrink-0">Done</span>
              ) : active ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={s.href}
                    className="bg-[#005851] text-white rounded-lg px-3.5 py-1.5 text-[13px] font-medium hover:bg-[#003d38] transition-colors"
                  >
                    {s.cta}
                  </Link>
                  <button
                    onClick={() => askPatch(s.patchPrompt)}
                    className="border border-[#1D9E75] text-[#0f6e56] rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-[#f1faf7] transition-colors"
                  >
                    Ask Patch
                  </button>
                </div>
              ) : (
                <span className="text-[12px] text-[#bdbdbd] shrink-0">Up next</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <Link href="/dashboard/resources" className="text-[#0d8f7a] font-medium hover:underline">
          Browse all guides →
        </Link>
        <span className="text-[#9a9a9a]">Your dashboard fills in as you go.</span>
      </div>
    </div>
  );
}
