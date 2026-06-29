'use client';

import { useState, useSyncExternalStore } from 'react';

/**
 * ComputerCallingSetup — setup-aware guide for dialing leads from a
 * computer, routed through the agent's OWN phone and number.
 *
 * The mechanism is the OS-level phone↔computer bridge the agent already
 * has: Apple Continuity ("Calls on Other Devices") on a Mac + iPhone, or
 * Microsoft Phone Link on Windows + Android. AgentForLife only emits the
 * `tel:` link — the operating system hands it to the paired phone, which
 * places the call. So there's no telephony backend and, critically, no
 * native-app / app-store work involved.
 *
 * Deliberately distinct from /dashboard/pair-phone, which links the
 * agent's phone to the AFL *native app* for push + confirmation texts.
 * Different job, different words — this one never says "pair your phone."
 *
 * How it kills the confusion: auto-detect the computer (the one thing we
 * can read), ask the one thing we can't (the phone), then show ONLY the
 * matching path and end in a real test call so the agent watches it work.
 * For combos with no bridge it points at the AgentForLife dashboard in the
 * phone's web browser — NOT the app — which already dials via `tel:` on
 * mobile. v1: stateless + public; persistence/Settings/Patch entry points
 * come later.
 */

type OS = 'mac' | 'win' | 'other';
type Phone = 'iphone' | 'android' | 'other';
type TestStage = 'input' | 'confirm' | 'works' | 'nope';

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const s = uaData?.platform || navigator.platform || navigator.userAgent || '';
  if (/mac/i.test(s)) return 'mac';
  if (/win/i.test(s)) return 'win';
  return 'other';
}

// Read the detected OS via useSyncExternalStore so SSR renders nothing
// selected (server snapshot = null) and the client swaps in the real value
// after hydration — no setState-in-effect, no hydration mismatch.
const NOOP_SUBSCRIBE = () => () => {};

const OS_LABEL: Record<OS, string> = { mac: 'Mac', win: 'Windows', other: 'Other' };

function LaptopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path strokeLinecap="round" d="M2 20h20" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function PhoneCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h2.2a1 1 0 01.95.68l1 3a1 1 0 01-.27 1.05L7.5 10.2a12 12 0 005.3 5.3l1.47-1.38a1 1 0 011.05-.27l3 1a1 1 0 01.68.95V18a1 1 0 01-1 1A14 14 0 014 5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l1.8 1.8L20 4.5" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5l2.2 2.2 4.8-4.8" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T | null;
  options: { val: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1.5">
      {options.map((o) => {
        const on = o.val === value;
        return (
          <button
            key={o.val}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.val)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              on
                ? 'border-[#0D4D4D] bg-[#0D4D4D] text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#3DD6C3]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#0D4D4D] text-xs font-semibold text-white">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-gray-700">{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Chip({ tone, children }: { tone: 'success' | 'warning' | 'neutral'; children: React.ReactNode }) {
  const cls =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

function Payoff({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-2 rounded-lg bg-[#3DD6C3]/15 p-3">
      <ArrowIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#0D4D4D]" />
      <span className="text-sm leading-relaxed text-[#0D4D4D]">{children}</span>
    </div>
  );
}

function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-gray-900">{children}</span>;
}

// The "prove it works" test call. Its own component, keyed by the setup in
// the parent, so switching the computer/phone remounts it with fresh state
// (no reset effect needed). Only rendered for combos that actually bridge.
function TestCall({ os }: { os: OS }) {
  const [stage, setStage] = useState<TestStage>('input');
  const [num, setNum] = useState('');
  const [hint, setHint] = useState(false);

  const digits = num.replace(/\D/g, '');
  const canCall = digits.length >= 7;

  const handleTestCall = () => {
    if (!canCall) {
      setHint(true);
      return;
    }
    // Mirror the app's own dial path: hand the number to the OS, which
    // routes it to the paired phone on a configured Mac/Windows setup.
    window.location.href = `tel:${digits}`;
    setStage('confirm');
  };

  return (
    <div className="mt-4 rounded-lg bg-[#F8F9FA] p-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-gray-900">
        <PhoneCheckIcon className="h-4 w-4 text-[#0D4D4D]" /> Prove it works — ring your own phone
      </div>
      {stage === 'input' && (
        <div>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={num}
              onChange={(e) => {
                setNum(e.target.value);
                setHint(false);
              }}
              placeholder="(415) 555-0172"
              aria-label="Your phone number"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0D4D4D] focus:outline-none focus:ring-1 focus:ring-[#0D4D4D]"
            />
            <button
              type="button"
              onClick={handleTestCall}
              className="whitespace-nowrap rounded-lg bg-[#0D4D4D] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0a3d3d]"
            >
              Call my phone
            </button>
          </div>
          {hint && <p className="mt-2 text-xs text-gray-500">Enter your phone number first.</p>}
        </div>
      )}
      {stage === 'confirm' && (
        <div>
          <p className="mb-2.5 text-sm text-gray-700">
            Calling <Em>{num || 'your phone'}</Em> … did your phone start ringing?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStage('works')}
              className="rounded-lg bg-[#0D4D4D] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0a3d3d]"
            >
              Yes, it rang
            </button>
            <button
              type="button"
              onClick={() => setStage('nope')}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300"
            >
              No, nothing
            </button>
          </div>
        </div>
      )}
      {stage === 'works' && (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircleIcon className="h-5 w-5" /> You&rsquo;re set. Your lead calls will ring out through your phone.
        </div>
      )}
      {stage === 'nope' && (
        <div>
          <p className="mb-1.5 text-sm text-gray-600">No ring usually means one thing&rsquo;s off:</p>
          <ul className="mb-2.5 list-disc pl-5 text-sm leading-relaxed text-gray-600">
            <li>{os === 'mac' ? 'same Apple Account and Wi-Fi on both' : 'Bluetooth paired to your PC'}</li>
            <li>the calls toggle is switched on</li>
          </ul>
          <button
            type="button"
            onClick={() => setStage('input')}
            className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export default function ComputerCallingSetup() {
  // `detected` is null on the server + first client paint (so SSR/hydration
  // agree), then the client snapshot fills in the real OS. `override` lets
  // the agent correct it; the effective OS is the override when set.
  const detected = useSyncExternalStore<OS | null>(NOOP_SUBSCRIBE, detectOS, () => null);
  const [override, setOverride] = useState<OS | null>(null);
  const os = override ?? detected;
  const [phone, setPhone] = useState<Phone | null>(null);

  const working = (os === 'mac' && phone === 'iphone') || (os === 'win' && phone === 'android');

  let path: React.ReactNode;
  if (!phone) {
    path = (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <ArrowIcon className="h-4 w-4 -rotate-90" />
        Pick your phone above and your exact steps appear here.
      </div>
    );
  } else if (os === 'mac' && phone === 'iphone') {
    path = (
      <div>
        <Chip tone="success">
          <CheckCircleIcon className="h-3.5 w-3.5" /> Best case — fully native
        </Chip>
        <div className="mb-3.5 mt-2 text-base font-medium text-gray-900">Mac + iPhone</div>
        <Steps
          items={[
            'Sign your Mac and iPhone into the same Apple Account.',
            <>On your iPhone: Settings → Phone → Calls on Other Devices → turn on <Em>Allow calls on other devices</Em>, then switch on your Mac.</>,
            <>On your Mac: open FaceTime → Settings → turn on <Em>Calls from iPhone</Em>.</>,
            'Keep both on the same Wi-Fi.',
          ]}
        />
        <Payoff>Tap Call on a lead in your dashboard, confirm once, and it rings out through your iPhone — on your own number.</Payoff>
      </div>
    );
  } else if (os === 'win' && phone === 'android') {
    path = (
      <div>
        <Chip tone="success">
          <CheckCircleIcon className="h-3.5 w-3.5" /> Works well
        </Chip>
        <div className="mb-3.5 mt-2 text-base font-medium text-gray-900">Windows + Android</div>
        <Steps
          items={[
            <>On your PC, open <Em>Phone Link</Em> (it comes with Windows — search the Start menu).</>,
            <>On your phone, open <Em>Link to Windows</Em> (built into many phones, or free on the Play Store).</>,
            <>Pair them with the QR code, and allow the <Em>Bluetooth</Em> pairing — that lets the PC use your phone&rsquo;s line.</>,
            <>Optional: Windows Settings → Apps → Default apps → set Phone Link as your calling app.</>,
          ]}
        />
        <Payoff>Tap Call on a lead in your dashboard — the number lands in Phone Link. Hit call and it dials through your phone.</Payoff>
      </div>
    );
  } else if (os === 'win' && phone === 'iphone') {
    path = (
      <div>
        <Chip tone="warning">Partial — needs a workaround</Chip>
        <div className="mb-3 mt-2 text-base font-medium text-gray-900">Windows + iPhone</div>
        <p className="mb-3.5 text-sm leading-relaxed text-gray-600">
          Phone Link can place calls to an iPhone over Bluetooth, but tapping Call in your browser won&rsquo;t reliably hand the
          number off. The realistic setup:
        </p>
        <Steps
          items={[
            'Pair your iPhone to Phone Link and allow Bluetooth so the PC can use your phone’s line.',
            'To dial a lead, start the call from the Phone Link window (or just dial on your iPhone).',
            <>Tap the outcome in your <Em>AgentForLife dashboard</Em> so the dial still counts.</>,
          ]}
        />
      </div>
    );
  } else {
    path = (
      <div>
        <Chip tone="neutral">No computer-to-phone bridge for this combo</Chip>
        <div className="mb-3 mt-2 text-base font-medium text-gray-900">
          {OS_LABEL[os ?? 'other']} + {phone === 'android' ? 'Android' : 'your phone'}
        </div>
        <p className="mb-3.5 text-sm leading-relaxed text-gray-600">
          There&rsquo;s no built-in way to route computer calls through your phone on this setup. The easiest path is to dial on
          your phone instead — and nothing is lost.
        </p>
        <Steps
          items={[
            <>Open your <Em>AgentForLife dashboard in your phone&rsquo;s web browser</Em> (not the app) — go to Leads and tap Call. Your phone dials directly.</>,
            'Tap the outcome after each call so your Activity stays accurate.',
          ]}
        />
        {os === 'mac' && (
          <Payoff>On a Mac with an iPhone instead? Switch the phone above to see the one-time setup.</Payoff>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2.5">
        <LaptopIcon className="h-6 w-6 text-[#0D4D4D]" />
        <span className="text-lg font-semibold text-gray-900">Call your leads from your computer</span>
      </div>

      <div className="flex flex-col gap-3.5">
        <div>
          <div className="mb-1.5 text-[13px] text-gray-500">
            Your computer
            {detected && <span className="text-gray-400"> · detected {OS_LABEL[detected]}</span>}
          </div>
          <Segmented
            ariaLabel="Your computer"
            value={os}
            onChange={setOverride}
            options={[
              { val: 'mac', label: 'Mac' },
              { val: 'win', label: 'Windows' },
              { val: 'other', label: 'Other' },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] text-gray-500">Your phone</div>
          <Segmented
            ariaLabel="Your phone"
            value={phone}
            onChange={setPhone}
            options={[
              { val: 'iphone', label: 'iPhone' },
              { val: 'android', label: 'Android' },
              { val: 'other', label: 'Other' },
            ]}
          />
        </div>
      </div>

      <div className="my-5 border-t border-gray-100" />

      {path}

      {working && os && <TestCall key={`${os}-${phone}`} os={os} />}

      <div className="mt-5 flex gap-2 border-t border-gray-100 pt-4">
        <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <p className="text-[13px] leading-relaxed text-gray-500">
          Whatever your setup, always start a call from the lead&rsquo;s <span className="text-gray-700">Call</span> button in your
          AgentForLife dashboard, then tap what happened. That tap is what records the dial on your Activity page — calls placed
          any other way won&rsquo;t show in your stats.
        </p>
      </div>
    </div>
  );
}
