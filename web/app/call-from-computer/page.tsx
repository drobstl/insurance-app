import Link from 'next/link';
import ComputerCallingSetup from '../../components/ComputerCallingSetup';

/**
 * /call-from-computer — public, shareable setup guide for dialing leads
 * from a computer through the agent's own phone (Apple Continuity on a
 * Mac + iPhone, Microsoft Phone Link on Windows + Android).
 *
 * Public on purpose: it works logged-out so an agent can be sent the link
 * directly during onboarding, and it carries no account data. The authed
 * Settings entry point + the Patch dialer nudge will deep-link here.
 *
 * Separate door from /dashboard/pair-phone (which pairs the phone to the
 * AFL native app for push). This is the OS-level computer↔phone bridge —
 * web only, no app-store work.
 */

export const metadata = {
  title: 'Call from your computer - AgentForLife',
  description:
    'Dial your leads from your computer, ringing out through your own phone and number. Tell us your setup and get the exact steps.',
};

export default function CallFromComputerPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="bg-[#0D4D4D] py-6">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3DD6C3]">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="7" r="3" />
                <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                <circle cx="4" cy="10" r="2" opacity="0.7" />
                <circle cx="20" cy="10" r="2" opacity="0.7" />
                <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">AgentForLife&trade;</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Call your leads from your computer</h1>
        <p className="mt-3 text-base leading-relaxed text-gray-600">
          Make your lead calls right from your dashboard and have them ring out through your own phone and your own number — so
          more calls get answered. It uses a free feature already built into your computer and phone; you pair them once. No
          extra app to buy, no per-call cost.
        </p>
        <p className="mb-8 mt-2 text-sm leading-relaxed text-gray-500">
          Tell us what you&rsquo;re working on and we&rsquo;ll show the exact steps for your setup.
        </p>

        <ComputerCallingSetup />
      </main>
    </div>
  );
}
