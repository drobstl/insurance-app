'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { REAL_CATEGORIES } from '../lib/coaching-playbook';
import { carriersFromIds } from '../lib/presentation-carriers';

/**
 * The fields the presentation reads off a lead. Kept local + loose so the
 * panel can hand us a Lead without a shared type dependency.
 */
export interface PresentationLead {
  name?: string;
  spouseName?: string;
  ageYears?: number;
  dateOfBirth?: string;
  monthlyMortgageAmount?: number;
  mortgageDetails?: { balance?: number; lender?: string };
  smokerStatus?: 'Y' | 'N';
  coborrowerStatus?: 'Y' | 'N';
  address?: { city?: string; state?: string };
}

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');
const firstWord = (s?: string) => (s || '').trim().split(/\s+/)[0] || '';
const fmtUsd = (n?: number | null) =>
  n != null && isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '';
const toNum = (s: string) => {
  const n = parseFloat((s || '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : 0;
};
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
function ageFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const a = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return a > 0 && a < 120 ? a : undefined;
}

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}
const P = {
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  check: 'M5 13l4 4L19 7',
  left: 'M15 19l-7-7 7-7',
  right: 'M9 5l7 7-7 7',
  x: 'M6 18L18 6M6 6l12 12',
  users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2-5.24',
  arrow: 'M14 5l7 7m0 0l-7 7m7-7H3',
  heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
};

export default function LeadPresentation({ lead, onClose }: { lead: PresentationLead; onClose: () => void }) {
  const { agentProfile } = useDashboard();

  // ── derived: lead ──
  const survivor = firstWord(lead.spouseName) || 'your family';
  const leadFirst = firstWord(lead.name) || 'there';
  const age = lead.ageYears ?? ageFromDob(lead.dateOfBirth);
  const balance = lead.mortgageDetails?.balance;
  const payment = lead.monthlyMortgageAmount;
  const leadState = lead.address?.state;

  // ── derived: agent ──
  const agentFirst = firstWord(agentProfile?.name) || 'your agent';
  const agentName = (agentProfile?.name || '').trim();
  const initials = (agentName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || 'A').toUpperCase();
  const familyPhoto = agentProfile?.familyPhotoBase64;
  const headshot = agentProfile?.photoBase64;
  const licenseEntry = useMemo(() => {
    const lic = agentProfile?.licenses || {};
    const entries = Object.entries(lic);
    if (entries.length === 0) return null;
    const [state, data] = leadState && lic[leadState] ? ([leadState, lic[leadState]] as const) : entries[0];
    return { state, number: data.number };
  }, [agentProfile?.licenses, leadState]);
  const carriers = useMemo(() => carriersFromIds(agentProfile?.presentationCarriers), [agentProfile?.presentationCarriers]);
  const moreCount = Math.max(0, 35 - carriers.length);

  // ── state ──
  const [idx, setIdx] = useState(0);
  const [optTab, setOptTab] = useState<'payoff' | 'payment'>(age != null && age >= 60 ? 'payment' : 'payoff');
  const [disc, setDisc] = useState({
    balance: balance != null ? String(balance) : '',
    payment: payment != null ? String(payment) : '',
    homeValue: '',
    income: '',
    existing: '',
    continues: '',
  });
  const [payoffOpts, setPayoffOpts] = useState([
    { label: 'Partial payoff', coverage: balance != null ? String(roundTo(balance / 2, 5000)) : '', price: '' },
    { label: 'Full payoff', coverage: balance != null ? String(balance) : '', price: '' },
    { label: 'Full payoff + cash value', coverage: balance != null ? String(balance) : '', price: '' },
  ]);
  const [paymentOpts, setPaymentOpts] = useState([
    { label: '9 months of payments', price: '' },
    { label: '1 year of payments', price: '' },
    { label: '18 months of payments', price: '' },
  ]);

  const setDiscField = (k: keyof typeof disc, v: string) => setDisc((d) => ({ ...d, [k]: v }));

  // gap math
  const need = toNum(disc.payment);
  const continues = toNum(disc.continues);
  const gap = Math.max(0, need - continues);
  const coveredPct = need > 0 ? Math.min(100, Math.round((continues / need) * 100)) : 0;

  // body scroll lock + keyboard nav
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const total = 8;
  const go = (n: number) => setIdx((i) => Math.max(0, Math.min(total - 1, n)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(total - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── shared bits ──
  const eyebrow = (text: string, dark: boolean) => (
    <p className={cx('text-sm mb-3', dark ? 'text-[#9fd5cc]' : 'text-[#707070]')}>{text}</p>
  );
  const DiscField = ({ label, k, prefix }: { label: string; k: keyof typeof disc; prefix?: string }) => (
    <label className="block">
      <span className="text-xs text-[#707070]">{label}</span>
      <div className="flex items-center border-b-2 border-[#e5e7eb] focus-within:border-[#45bcaa] transition-colors">
        {prefix && <span className="text-[#707070]">{prefix}</span>}
        <input
          value={disc[k]}
          onChange={(e) => setDiscField(k, e.target.value)}
          inputMode="numeric"
          placeholder="—"
          className="w-full bg-transparent py-1.5 text-lg outline-none"
        />
      </div>
    </label>
  );

  // ── slides ──
  const slides: Array<{ phase: string; dark: boolean; node: React.ReactNode }> = [
    // 0 — Cover (Rapport)
    {
      phase: 'rapport',
      dark: true,
      node: (
        <div>
          {eyebrow(`Prepared for ${lead.name || survivor}`, true)}
          <h1 className="text-5xl md:text-6xl font-bold leading-[1.08]">A plan to keep your family in this home.</h1>
          <p className="mt-6 text-lg md:text-xl text-[#d6efea] max-w-2xl">
            I&apos;m an independent, licensed life insurance broker — here to find the plan that actually fits your family.
          </p>
          <div className="mt-10 flex items-center gap-3">
            {headshot ? (
              <img src={`data:image/jpeg;base64,${headshot}`} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#0c6b60] flex items-center justify-center text-[#eafaf6]">{initials}</div>
            )}
            <div className="text-sm text-[#cdeae4]">
              <div className="font-semibold text-white">{agentName || 'Your agent'}</div>
              <div>{licenseEntry ? `${licenseEntry.state} · License #${licenseEntry.number}` : 'Licensed life insurance broker'}</div>
            </div>
          </div>
        </div>
      ),
    },
    // 1 — Credibility (Rapport)
    {
      phase: 'rapport',
      dark: false,
      node: (
        <div className="w-full">
          <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-8 items-center">
            <div>
              {familyPhoto ? (
                <img
                  src={`data:image/jpeg;base64,${familyPhoto}`}
                  alt="The agent's family"
                  className="rounded-2xl w-full object-cover"
                  style={{ maxHeight: 240 }}
                />
              ) : (
                <div
                  className="rounded-2xl border-2 border-dashed border-[#cbd5d1] bg-[#eef4f2] flex flex-col items-center justify-center text-[#9aa5a2]"
                  style={{ height: 200 }}
                >
                  <Icon path={P.users} className="w-8 h-8" />
                  <div className="text-sm mt-2">Your family photo</div>
                  <div className="text-xs">Add it in Settings</div>
                </div>
              )}
              <div className="mt-4 inline-flex items-center gap-3 rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-3">
                <Icon path={P.shield} className="w-6 h-6 text-[#0F6E56]" />
                <div>
                  <div className="text-sm font-semibold text-[#1A1A1A]">Licensed life insurance broker</div>
                  <div className="text-xs text-[#707070]">
                    {licenseEntry ? `${licenseEntry.state} · License #${licenseEntry.number}` : 'Add your license in Settings'}
                  </div>
                </div>
              </div>
            </div>
            <div>
              {eyebrow('A little about me', false)}
              <h2 className="text-3xl md:text-4xl font-semibold leading-tight">
                You should know who&apos;s helping protect your family.
              </h2>
              <p className="mt-4 text-lg text-[#374151] leading-relaxed">
                I&apos;m {agentFirst} — a licensed life insurance broker, and a family person myself. I&apos;m what&apos;s called a
                field underwriter, which means I&apos;m independent. My only job today is to understand what your family
                needs, find the best fit, and help you get approved — no pressure, ever.
              </p>
            </div>
          </div>
          <div className="mt-8 border-t border-[#ececec] pt-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <span className="text-sm text-[#374151]">35+ A-rated carriers to choose from</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#0F6E56] bg-[#daf3f0] rounded-md px-2.5 py-1">
                <Icon path={P.star} className="w-3.5 h-3.5" /> A-rated &amp; A+ rated
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {carriers.map((c) => (
                <span
                  key={c.id}
                  className="text-xs text-[#374151] bg-[#f4f6f5] border border-[#e5e7eb] rounded-md px-3 py-1.5 whitespace-nowrap"
                >
                  {c.name}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-xs text-[#707070] bg-[#f4f6f5] border border-[#e5e7eb] rounded-md px-3 py-1.5">
                  + {moreCount} more
                </span>
              )}
            </div>
            <div className="text-lg font-semibold text-[#0F6E56]">I don&apos;t work for any of them. I work for you.</div>
          </div>
        </div>
      ),
    },
    // 2 — Your concerns (Emotion)
    {
      phase: 'emotion',
      dark: false,
      node: (
        <div>
          {eyebrow('Understanding your concerns', false)}
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">
            If something happened to you tomorrow — how long could {survivor} stay in this home?
          </h2>
          <p className="mt-6 text-xl text-[#374151]">Most families can&apos;t carry the mortgage on one income for long.</p>
        </div>
      ),
    },
    // 3 — Discovery (Emotion)
    {
      phase: 'emotion',
      dark: false,
      node: (
        <div>
          {eyebrow("Let's map it out together", false)}
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight">Here&apos;s what we know — we fill in the rest together.</h2>
          <div className="grid md:grid-cols-3 gap-8 mt-8">
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#0F6E56]">Mortgage</div>
              <DiscField label="Balance" k="balance" prefix="$" />
              <DiscField label="Monthly payment" k="payment" prefix="$" />
              <DiscField label="Home value" k="homeValue" prefix="$" />
            </div>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#0F6E56]">Health</div>
              <div>
                <div className="text-xs text-[#707070]">Age</div>
                <div className="text-lg py-1.5 border-b-2 border-[#e5e7eb]">{age ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-[#707070]">Tobacco</div>
                <div className="text-lg py-1.5 border-b-2 border-[#e5e7eb]">
                  {lead.smokerStatus === 'Y' ? 'Yes' : lead.smokerStatus === 'N' ? 'No' : '—'}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#0F6E56]">Money</div>
              <DiscField label="Household income" k="income" prefix="$" />
              <DiscField label="Existing coverage" k="existing" prefix="$" />
            </div>
          </div>
          <p className="mt-8 text-sm text-[#707070]">This feeds the gap and your options — no paper, no whiteboard.</p>
        </div>
      ),
    },
    // 4 — The gap (Emotion)
    {
      phase: 'emotion',
      dark: true,
      node: (
        <div>
          {eyebrow(`What ${survivor} would actually face`, true)}
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">Your paycheck stops. The mortgage doesn&apos;t.</h2>
          {need > 0 ? (
            <div className="mt-8 max-w-2xl">
              <div className="flex items-center justify-between text-sm text-[#bfe4dd] mb-2">
                <span>The mortgage payment</span>
                <span>{fmtUsd(need)}/mo</span>
              </div>
              <div className="h-7 rounded-md overflow-hidden flex bg-white/10">
                <div style={{ width: `${coveredPct}%` }} className="bg-[#5DCAA5]" />
                <div style={{ width: `${100 - coveredPct}%` }} className="bg-[#E24B4A]" />
              </div>
              <label className="block mt-5 text-sm text-[#bfe4dd]">
                Income that would continue
                <span className="ml-2">$</span>
                <input
                  value={disc.continues}
                  onChange={(e) => setDiscField('continues', e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-28 bg-transparent border-b border-white/40 text-white outline-none ml-1 py-1"
                />
              </label>
              <div className="mt-6 text-3xl font-bold text-[#ffb4b0]">{fmtUsd(gap)} short — every month.</div>
            </div>
          ) : (
            <p className="mt-6 text-lg text-[#d6efea]">Add the mortgage payment on the discovery slide to show the gap.</p>
          )}
        </div>
      ),
    },
    // 5 — Three ways (Assumption)
    {
      phase: 'assumption',
      dark: false,
      node: (
        <div>
          {eyebrow('Three ways to protect it', false)}
          <div className="space-y-3 mt-2">
            {[
              ['Full payoff', 'Wipes out the entire balance — your family owns the home free and clear.'],
              ['Partial payoff', 'Covers part of it now — a more affordable starting place.'],
              ['Payment protection', 'Covers the mortgage payments through the hardest months. Most common after 65.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-5 py-4">
                <span className="font-semibold text-[#1A1A1A]">{t}</span>
                <span className="text-[#374151]"> — {d}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3 bg-[#daf3f0] text-[#0F6E56] rounded-lg px-4 py-3">
            <Icon path={P.heart} className="w-5 h-5 shrink-0" />
            <span className="text-sm">
              Every option includes living benefits — critical, chronic &amp; terminal illness. You don&apos;t have to die to use it.
            </span>
          </div>
        </div>
      ),
    },
    // 6 — Options (Assumption)
    {
      phase: 'assumption',
      dark: false,
      node: (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            {eyebrow('Your options', false)}
            <div className="inline-flex rounded-lg border-2 border-[#1A1A1A] overflow-hidden text-sm">
              {(['payoff', 'payment'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOptTab(t)}
                  className={cx('px-4 py-1.5', optTab === t ? 'bg-[#005851] text-white' : 'bg-white text-[#1A1A1A]')}
                >
                  {t === 'payoff' ? 'Payoff plan' : 'Payment protection'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {optTab === 'payoff'
              ? payoffOpts.map((opt, i) => (
                  <div
                    key={opt.label}
                    className={cx(
                      'rounded-xl border-2 p-5 bg-white relative',
                      i === 1 ? 'border-[#0099FF]' : 'border-[#1A1A1A] border-r-[4px] border-b-[4px]',
                    )}
                  >
                    {i === 1 && (
                      <span className="absolute -top-3 left-4 bg-[#0099FF] text-white text-[11px] px-2.5 py-0.5 rounded-md">
                        Most chosen
                      </span>
                    )}
                    <div className="text-sm text-[#707070]">{opt.label}</div>
                    <div className="mt-1 flex items-baseline">
                      <span className="text-2xl font-bold text-[#1A1A1A]">$</span>
                      <input
                        value={opt.price}
                        onChange={(e) => setPayoffOpts((o) => o.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                        inputMode="numeric"
                        placeholder="—"
                        className="text-3xl font-bold w-20 bg-transparent outline-none border-b-2 border-dashed border-[#cbd5d1] focus:border-[#45bcaa] text-[#1A1A1A]"
                      />
                      <span className="text-sm text-[#707070] ml-1">/mo</span>
                    </div>
                    <div className="mt-3 text-sm text-[#707070]">
                      Coverage $
                      <input
                        value={opt.coverage}
                        onChange={(e) =>
                          setPayoffOpts((o) => o.map((x, j) => (j === i ? { ...x, coverage: e.target.value } : x)))
                        }
                        inputMode="numeric"
                        placeholder="—"
                        className="w-24 bg-transparent outline-none border-b border-[#e5e7eb] focus:border-[#45bcaa] text-[#374151]"
                      />
                    </div>
                  </div>
                ))
              : paymentOpts.map((opt, i) => (
                  <div
                    key={opt.label}
                    className={cx(
                      'rounded-xl border-2 p-5 bg-white relative',
                      i === 1 ? 'border-[#0099FF]' : 'border-[#1A1A1A] border-r-[4px] border-b-[4px]',
                    )}
                  >
                    {i === 1 && (
                      <span className="absolute -top-3 left-4 bg-[#0099FF] text-white text-[11px] px-2.5 py-0.5 rounded-md">
                        Most chosen
                      </span>
                    )}
                    <div className="text-sm text-[#707070]">{opt.label}</div>
                    <div className="mt-1 flex items-baseline">
                      <span className="text-2xl font-bold text-[#1A1A1A]">$</span>
                      <input
                        value={opt.price}
                        onChange={(e) =>
                          setPaymentOpts((o) => o.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                        }
                        inputMode="numeric"
                        placeholder="—"
                        className="text-3xl font-bold w-20 bg-transparent outline-none border-b-2 border-dashed border-[#cbd5d1] focus:border-[#45bcaa] text-[#1A1A1A]"
                      />
                      <span className="text-sm text-[#707070] ml-1">/mo</span>
                    </div>
                  </div>
                ))}
          </div>
          <p className="mt-5 text-sm text-[#707070]">
            Auto-picked to match {leadFirst}&apos;s age &amp; health — flip the switch any time.
          </p>
        </div>
      ),
    },
    // 7 — Lock it down (Lock)
    {
      phase: 'lock_it_down',
      dark: true,
      node: (
        <div>
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">Which one fits most comfortably in your budget?</h2>
          <ul className="mt-8 space-y-3 text-lg text-[#d6efea]">
            {[
              'About 10 minutes to apply — together, right now.',
              'Approval in a day or two, then we review the policy.',
              "I'm your agent now — saved right in your phone.",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <Icon path={P.check} className="w-5 h-5 text-[#5DCAA5] shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-white/15 pt-5 text-sm text-[#bfe4dd] flex items-center gap-2">
            <Icon path={P.arrow} className="w-4 h-4" />
            Next visit: is your mortgage debt delaying your retirement?{' '}
            <span className="text-white">The Debt-Free-Life conversation.</span>
          </div>
        </div>
      ),
    },
  ];

  const current = slides[idx];
  const dark = current.dark;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: dark ? 'linear-gradient(160deg,#00403B 0%,#005851 100%)' : '#f7faf9' }}
    >
      {/* Top bar: R.E.A.L. spine + counter + close */}
      <div className="flex items-center justify-between px-5 md:px-8 py-4">
        <div className="flex gap-2">
          {REAL_CATEGORIES.map((cat) => {
            const active = cat.key === current.phase;
            return (
              <div
                key={cat.key}
                className={cx(
                  'px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5',
                  active ? 'bg-[#005851] text-white' : dark ? 'bg-white/10 text-white/70' : 'bg-[#eef2f1] text-[#707070]',
                )}
              >
                <span className="font-bold">{cat.letter}</span>
                <span className="hidden sm:inline">{cat.label}</span>
              </div>
            );
          })}
        </div>
        <div className={cx('flex items-center gap-4', dark ? 'text-white/80' : 'text-[#707070]')}>
          <span className="text-sm">{idx + 1} / {total}</span>
          <button onClick={onClose} aria-label="Close presentation" className="p-1.5 rounded-md hover:bg-black/10">
            <Icon path={P.x} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide */}
      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center px-6 md:px-12 py-4">
        <div
          key={idx}
          style={{ animation: 'fadeIn 0.35s ease' }}
          className={cx('w-full max-w-4xl', dark ? 'text-white' : 'text-[#1A1A1A]')}
        >
          {current.node}
        </div>
      </div>

      {/* Bottom nav */}
      <div className={cx('flex items-center justify-between px-5 md:px-8 py-4', dark ? 'text-white' : 'text-[#1A1A1A]')}>
        <button
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          aria-label="Previous slide"
          className={cx('p-2 rounded-lg', idx === 0 ? 'opacity-30' : 'hover:bg-black/10')}
        >
          <Icon path={P.left} className="w-6 h-6" />
        </button>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cx(
                'w-2 h-2 rounded-full transition-colors',
                i === idx ? 'bg-[#45bcaa]' : dark ? 'bg-white/30' : 'bg-[#cbd5d1]',
              )}
            />
          ))}
        </div>
        <button
          onClick={() => go(idx + 1)}
          disabled={idx === total - 1}
          aria-label="Next slide"
          className={cx('p-2 rounded-lg', idx === total - 1 ? 'opacity-30' : 'hover:bg-black/10')}
        >
          <Icon path={P.right} className="w-6 h-6" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
