'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../app/dashboard/DashboardContext';
import {
  useLeadHousehold,
  computeGap,
  toNum,
  fmtUsd,
  firstWord,
  ageFromDob,
  type IncomeItem,
} from '../lib/household';
import { MoneyList } from './MoneyList';

/** Display-only lead basics; the household/financials come from the lead doc via the hook. */
export interface PresentationLead {
  name?: string;
  spouseName?: string;
  spouseAgeYears?: number;
  ageYears?: number;
  dateOfBirth?: string;
  smokerStatus?: 'Y' | 'N';
  coborrowerStatus?: 'Y' | 'N';
  address?: { city?: string; state?: string };
}

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}
const P = {
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  check: 'M5 13l4 4L19 7',
  left: 'M15 19l-7-7 7-7',
  right: 'M9 5l7 7-7 7',
  x: 'M6 18L18 6M6 6l12 12',
  arrow: 'M14 5l7 7m0 0l-7 7m7-7H3',
  heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  adjust: 'M10 6H3M21 6h-4M14 6a2 2 0 11-4 0 2 2 0 014 0zM7 12H3m18 0h-9m1 0a2 2 0 11-4 0 2 2 0 014 0zM17 18H3m18 0h-1m-3 0a2 2 0 11-4 0 2 2 0 014 0z',
};

function NumField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-[#707070]">{label}</span>
      <div className="flex items-center border-b-2 border-[#e5e7eb] focus-within:border-[#45bcaa] transition-colors">
        {prefix && <span className="text-[#707070]">{prefix}</span>}
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" placeholder="—" className="w-full bg-transparent py-1.5 text-lg outline-none" />
      </div>
    </label>
  );
}

const sectionLabel = (t: string) => <div className="text-sm font-semibold text-[#0F6E56] mb-2">{t}</div>;

export default function LeadPresentation({ lead, leadId, onClose }: { lead: PresentationLead; leadId: string; onClose: () => void }) {
  const { agentProfile } = useDashboard();
  const hh = useLeadHousehold(leadId);
  const { household, quote, patchQuote } = hh;

  // ── derived: people ──
  const youFirst = firstWord(lead.name) || 'you';
  const spouseName = household.spouse?.name || lead.spouseName || '';
  const spouseFirst = firstWord(spouseName);
  const hasSpouse = !!spouseFirst;
  const age = lead.ageYears ?? ageFromDob(lead.dateOfBirth);
  const spouseAge = household.spouse?.ageYears ?? lead.spouseAgeYears;
  const survivor = spouseFirst || 'your family';

  // ── derived: agent ──
  const agentName = (agentProfile?.name || '').trim();
  const agentFirst = firstWord(agentProfile?.name) || 'your agent';
  const initials = (agentName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || 'A').toUpperCase();
  const familyPhoto = agentProfile?.familyPhotoBase64;
  const headshot = agentProfile?.photoBase64;
  const leadState = lead.address?.state;
  const licenseEntry = useMemo(() => {
    const lic = agentProfile?.licenses || {};
    const entries = Object.entries(lic);
    if (entries.length === 0) return null;
    const [state, data] = leadState && lic[leadState] ? ([leadState, lic[leadState]] as const) : entries[0];
    return { state, number: data.number };
  }, [agentProfile?.licenses, leadState]);

  const [idx, setIdx] = useState(0);
  const total = 8;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(total - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (n: number) => setIdx(Math.max(0, Math.min(total - 1, n)));
  const eyebrow = (text: string, dark: boolean) => <p className={cx('text-sm mb-3', dark ? 'text-[#9fd5cc]' : 'text-[#707070]')}>{text}</p>;

  if (typeof document === 'undefined') return null;
  if (!quote) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: '#f7faf9' }}>
        <div className="text-[#707070]">Loading…</div>
      </div>,
      document.body,
    );
  }

  const { couple, whoPasses, olderFraming, optTab, mostChosen, payoffOpts, paymentOpts } = quote;
  const mortgage = toNum(hh.mortgagePayment);
  const g = computeGap(household, { whoPasses, couple, mortgage });
  const passingName = whoPasses === 'you' ? youFirst : spouseFirst || 'your spouse';
  const survivorKey = whoPasses === 'you' ? 'ifLead' : 'ifSpouse';

  const updOpt = (tab: 'payoff' | 'payment', i: number, field: 'coverage' | 'priceYou' | 'priceSpouse', v: string) => {
    const arr = (tab === 'payoff' ? payoffOpts : paymentOpts).map((x, j) => (j === i ? { ...x, [field]: v } : x));
    patchQuote(tab === 'payoff' ? { payoffOpts: arr } : { paymentOpts: arr });
  };

  const gapPanel = (title: string, expensesAmt: number) => {
    const covered = Math.min(g.survivingIncome, expensesAmt);
    const shortfall = Math.max(0, expensesAmt - g.survivingIncome);
    const denom = g.totalExpenses > 0 ? g.totalExpenses : 1;
    return (
      <div className="flex-1">
        <div className="flex items-center justify-between text-sm text-[#bfe4dd] mb-2">
          <span>{title}</span>
          <span>{fmtUsd(expensesAmt)}/mo</span>
        </div>
        <div className="h-7 rounded-md overflow-hidden bg-white/10 flex">
          <div style={{ width: `${(covered / denom) * 100}%` }} className="bg-[#5DCAA5]" />
          <div style={{ width: `${(shortfall / denom) * 100}%` }} className="bg-[#E24B4A]" />
        </div>
        <div className={cx('mt-3 text-2xl font-bold', shortfall > 0 ? 'text-[#ffb4b0]' : 'text-[#5DCAA5]')}>
          {shortfall > 0 ? `${fmtUsd(shortfall)} short` : "They're covered"}
        </div>
      </div>
    );
  };

  const optionCard = (tab: 'payoff' | 'payment', opt: { label: string; coverage: string; priceYou: string; priceSpouse: string }, i: number) => {
    const chosen = mostChosen[tab] === i;
    const priceInput = (val: string, field: 'priceYou' | 'priceSpouse', big: boolean) => (
      <input
        value={val}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => updOpt(tab, i, field, e.target.value)}
        inputMode="numeric"
        placeholder="—"
        className={cx('font-bold bg-transparent outline-none border-b-2 border-dashed border-[#cbd5d1] focus:border-[#45bcaa] text-[#1A1A1A]', big ? 'text-3xl w-20' : 'text-lg w-16')}
      />
    );
    return (
      <div
        key={opt.label}
        onClick={() => patchQuote({ mostChosen: { ...mostChosen, [tab]: i } })}
        className={cx('rounded-xl border-2 p-5 bg-white relative cursor-pointer', chosen ? 'border-[#0099FF]' : 'border-[#1A1A1A] border-r-[4px] border-b-[4px]')}
      >
        {chosen && <span className="absolute -top-3 left-4 bg-[#0099FF] text-white text-[11px] px-2.5 py-0.5 rounded-md">Most chosen</span>}
        <div className="text-sm text-[#707070]">{opt.label}</div>
        {couple ? (
          <div className="mt-2 space-y-1.5">
            {([['priceYou', youFirst], ['priceSpouse', spouseFirst || 'Spouse']] as const).map(([field, who]) => (
              <div key={field} className="flex items-baseline gap-1.5">
                <span className="text-xs text-[#707070] w-14 truncate">{who}</span>
                <span className="text-lg font-bold text-[#1A1A1A]">$</span>
                {priceInput(opt[field], field, false)}
                <span className="text-xs text-[#707070]">/mo</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl font-bold text-[#1A1A1A]">$</span>
            {priceInput(opt.priceYou, 'priceYou', true)}
            <span className="text-sm text-[#707070] ml-1">/mo</span>
          </div>
        )}
        {tab === 'payoff' && (
          <div className="mt-3 text-sm text-[#707070]" onClick={(e) => e.stopPropagation()}>
            Coverage $
            <input
              value={opt.coverage}
              onChange={(e) => updOpt(tab, i, 'coverage', e.target.value)}
              inputMode="numeric"
              placeholder="—"
              className="w-24 bg-transparent outline-none border-b border-[#e5e7eb] focus:border-[#45bcaa] text-[#374151]"
            />
          </div>
        )}
      </div>
    );
  };

  const runwayYears = g.runwayMonths != null ? (g.runwayMonths / 12).toFixed(1) : null;

  const slides: Array<{ dark: boolean; node: React.ReactNode }> = [
    // 0 — Cover
    {
      dark: true,
      node: (
        <div>
          {eyebrow(`Prepared for ${couple && hasSpouse ? `${youFirst} & ${spouseFirst}` : lead.name || survivor}`, true)}
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
    // 1 — Credibility
    {
      dark: false,
      node: (
        <div className="w-full">
          <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-8 items-center">
            <div>
              {familyPhoto && (
                <img src={`data:image/jpeg;base64,${familyPhoto}`} alt="The agent's family" className="rounded-2xl w-full object-cover" style={{ maxHeight: 240 }} />
              )}
              <div className={cx('inline-flex items-center gap-3 rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-3', familyPhoto && 'mt-4')}>
                <Icon path={P.shield} className="w-6 h-6 text-[#0F6E56]" />
                <div>
                  <div className="text-sm font-semibold text-[#1A1A1A]">Licensed life insurance broker</div>
                  {licenseEntry && <div className="text-xs text-[#707070]">{licenseEntry.state} · License #{licenseEntry.number}</div>}
                </div>
              </div>
            </div>
            <div>
              {eyebrow('A little about me', false)}
              <h2 className="text-3xl md:text-4xl font-semibold leading-tight">You should know who&apos;s helping protect your family.</h2>
              <p className="mt-4 text-lg text-[#374151] leading-relaxed">
                I&apos;m {agentFirst} — a licensed life insurance broker, and a family person myself. I&apos;m what&apos;s called a field
                underwriter, which means I&apos;m independent. My only job today is to understand what your family needs, find the best
                fit, and help you get approved — no pressure, ever.
              </p>
            </div>
          </div>
          <div className="mt-8 border-t border-[#ececec] pt-5">
            <img
              src={agentProfile?.carrierStripBase64 ? `data:image/jpeg;base64,${agentProfile.carrierStripBase64}` : '/carriers/strip.png'}
              alt="A-rated carriers I shop"
              className="w-full max-w-3xl mx-auto rounded-xl"
            />
            <div className="mt-4 text-center text-lg font-semibold text-[#0F6E56]">I don&apos;t work for any of them. I work for you.</div>
          </div>
        </div>
      ),
    },
    // 2 — Your concerns
    {
      dark: false,
      node: (
        <div>
          {eyebrow('Understanding your concerns', false)}
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">
            {couple
              ? `If something happened to ${youFirst} or ${spouseFirst} — how long could the other one keep this home?`
              : `If something happened to you tomorrow — how long could ${survivor} stay in this home?`}
          </h2>
          <p className="mt-6 text-xl text-[#374151]">Most families can&apos;t carry the mortgage on one income for long.</p>
        </div>
      ),
    },
    // 3 — Discovery (itemized fact-find)
    {
      dark: false,
      node: (
        <div>
          {eyebrow("Let's map it out together", false)}
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight">Here&apos;s what we know — we fill in the rest together.</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border-2 border-[#1A1A1A] overflow-hidden text-sm">
              <button onClick={() => patchQuote({ couple: false })} className={cx('px-4 py-1.5', !couple ? 'bg-[#005851] text-white' : 'bg-white text-[#1A1A1A]')}>
                Just {youFirst}
              </button>
              <button onClick={() => patchQuote({ couple: true })} className={cx('px-4 py-1.5', couple ? 'bg-[#005851] text-white' : 'bg-white text-[#1A1A1A]')}>
                {youFirst} &amp; {spouseFirst || 'spouse'}
              </button>
            </div>
            {couple && (
              <input
                value={spouseName}
                onChange={(e) => hh.setSpouse({ name: e.target.value })}
                placeholder="Spouse's name"
                className="bg-transparent border-b-2 border-[#e5e7eb] focus:border-[#45bcaa] outline-none py-1 text-sm"
              />
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-8 mt-6">
            <div className="space-y-5">
              <div>
                {sectionLabel('Mortgage')}
                <div className="space-y-3">
                  <NumField label="Balance" value={hh.mortgageBalance} onChange={hh.setMortgageBalance} prefix="$" />
                  <NumField label="Monthly payment" value={hh.mortgagePayment} onChange={hh.setMortgagePayment} prefix="$" />
                  <NumField label="Home value" value={household.homeValue || ''} onChange={hh.setHomeValue} prefix="$" />
                </div>
              </div>
              <div>
                {sectionLabel('Health')}
                <div className="text-sm text-[#374151] space-y-1">
                  <div>Age{couple ? ` (${youFirst})` : ''}: <span className="font-medium">{age ?? '—'}</span></div>
                  {couple && (
                    <label className="flex items-center gap-2">
                      Age ({spouseFirst || 'spouse'}):
                      <input
                        value={spouseAge != null ? String(spouseAge) : ''}
                        onChange={(e) => hh.setSpouse({ ageYears: e.target.value.trim() === '' ? undefined : toNum(e.target.value) })}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-14 bg-transparent border-b border-[#e5e7eb] focus:border-[#45bcaa] outline-none"
                      />
                    </label>
                  )}
                  <div>Tobacco: <span className="font-medium">{lead.smokerStatus === 'Y' ? 'Yes' : lead.smokerStatus === 'N' ? 'No' : '—'}</span></div>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                {sectionLabel('Monthly income')}
                <MoneyList
                  rows={household.incomes}
                  onChange={(r) => hh.setIncomes(r as IncomeItem[])}
                  addLabel="income"
                  labelPlaceholder="Source"
                  suggestions={['Job', 'Social Security', 'Pension']}
                  people={couple ? { lead: youFirst, spouse: spouseFirst || 'Spouse' } : null}
                />
              </div>
              <div>
                {sectionLabel('Monthly expenses (besides the mortgage)')}
                <MoneyList
                  rows={household.expenses}
                  onChange={hh.setExpenses}
                  addLabel="expense"
                  labelPlaceholder="Expense"
                  suggestions={['Car', 'Utilities', 'Phones', 'Insurance', 'Groceries', 'Credit cards', 'Other loans']}
                />
              </div>
              <div>
                {sectionLabel('Savings & retirement')}
                <MoneyList
                  rows={household.assets}
                  onChange={hh.setAssets}
                  addLabel="account"
                  labelPlaceholder="Account"
                  suggestions={['401k', 'IRA', 'Annuity', 'Savings']}
                  totalSuffix=""
                />
              </div>
              <NumField label="Existing life insurance" value={household.existingCoverage || ''} onChange={hh.setExistingCoverage} prefix="$" />
            </div>
          </div>
        </div>
      ),
    },
    // 4 — The gap
    {
      dark: true,
      node: (
        <div>
          {eyebrow('What your family would actually face', true)}
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">
            {couple ? `If ${passingName}'s income stops, the bills don't.` : "Your paycheck stops. The bills don't."}
          </h2>
          {g.totalExpenses > 0 ? (
            <div className="mt-7 max-w-3xl">
              {couple && (
                <div className="inline-flex rounded-lg border border-white/30 overflow-hidden text-sm mb-5">
                  {(['you', 'spouse'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => patchQuote({ whoPasses: w })}
                      className={cx('px-4 py-1.5', whoPasses === w ? 'bg-white text-[#005851] font-semibold' : 'text-[#d6efea]')}
                    >
                      If {w === 'you' ? youFirst : spouseFirst}
                    </button>
                  ))}
                </div>
              )}
              <div className="mb-6 text-sm text-[#bfe4dd]">
                Income that keeps coming: <span className="text-white font-semibold">{fmtUsd(g.survivingIncome)}/mo</span>
                <label className="ml-3 inline-flex items-center">
                  <span className="mr-1">+ survivor benefits (SS, pension): $</span>
                  <input
                    value={household.survivorIncome?.[survivorKey] || ''}
                    onChange={(e) => hh.setSurvivorIncome(survivorKey, e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                    className="w-24 bg-transparent border-b border-white/40 text-white outline-none"
                  />
                </label>
              </div>
              <div className="flex flex-col md:flex-row gap-8">
                {gapPanel('Bills right now', g.totalExpenses)}
                {gapPanel('With the home paid off', g.otherExpenses)}
              </div>
              {runwayYears != null && (
                <p className="mt-6 text-[#ffd9a6]">
                  They have <span className="font-semibold">{fmtUsd(g.assets)}</span> in savings — that covers the gap for about{' '}
                  <span className="font-semibold">{runwayYears} years</span>, then it&apos;s gone.
                </p>
              )}
              {mortgage > 0 && (
                <p className="mt-3 text-[#bfe4dd]">
                  Paying off the home removes <span className="text-white font-semibold">{fmtUsd(mortgage)}</span> a month in bills.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-6 text-lg text-[#d6efea]">Add the payment and monthly expenses on the previous slide to see the picture.</p>
          )}
        </div>
      ),
    },
    // 5 — Three ways (situational copy; tap heading/icon to flip)
    {
      dark: false,
      node: (
        <div>
          <div className="flex items-start justify-between">
            {eyebrow('Three ways to protect it', false)}
            <button
              onClick={() => patchQuote({ olderFraming: !olderFraming })}
              aria-label="Switch option framing"
              title="Switch option framing"
              className="opacity-50 hover:opacity-100 transition-opacity p-1 text-[#9aa5a2] shrink-0"
            >
              <Icon path={P.adjust} className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3 mt-2">
            {(olderFraming
              ? [
                  ['Full payoff', 'The most coverage — but the most expensive and the hardest to qualify for. And as the balance drops over the years, you can end up paying for far more than you still owe.'],
                  ['Partial payoff', 'A middle ground — still can be pricey and tougher to qualify for.'],
                  ['Equity protection', "The most affordable and the easiest to qualify for. It protects your family's equity and buys them time — no panic decisions, room to make the call that's right for them. Time gives people options."],
                ]
              : [
                  ['Full payoff', 'Wipes out the entire balance — your family owns the home free and clear.'],
                  ['Partial payoff', 'Covers part of it now — a more affordable starting place.'],
                  ['Payment protection', 'Covers the mortgage payments through the hardest months. Most common after 65.'],
                ]
            ).map(([t, d]) => (
              <div key={t} className="rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-5 py-4">
                <span className="font-semibold text-[#1A1A1A]">{t}</span>
                <span className="text-[#374151]"> — {d}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3 bg-[#daf3f0] text-[#0F6E56] rounded-lg px-4 py-3">
            <Icon path={P.heart} className="w-5 h-5 shrink-0" />
            <span className="text-sm">Every option includes living benefits — critical, chronic &amp; terminal illness. You don&apos;t have to die to use it.</span>
          </div>
        </div>
      ),
    },
    // 6 — Options
    {
      dark: false,
      node: (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            {eyebrow('Your options', false)}
            <div className="inline-flex rounded-lg border-2 border-[#1A1A1A] overflow-hidden text-sm">
              {(['payoff', 'payment'] as const).map((t) => (
                <button key={t} onClick={() => patchQuote({ optTab: t })} className={cx('px-4 py-1.5', optTab === t ? 'bg-[#005851] text-white' : 'bg-white text-[#1A1A1A]')}>
                  {t === 'payoff' ? 'Payoff plan' : 'Payment protection'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">{(optTab === 'payoff' ? payoffOpts : paymentOpts).map((opt, i) => optionCard(optTab, opt, i))}</div>
        </div>
      ),
    },
    // 7 — Lock it down
    {
      dark: true,
      node: (
        <div>
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">Which one fits most comfortably in your budget?</h2>
          <ul className="mt-8 space-y-3 text-lg text-[#d6efea]">
            {['About 10 minutes to apply — together, right now.', 'Approval in a day or two, then we review the policy.', "I'm your agent now — saved right in your phone."].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <Icon path={P.check} className="w-5 h-5 text-[#5DCAA5] shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-white/15 pt-5 text-sm text-[#bfe4dd] flex items-center gap-2">
            <Icon path={P.arrow} className="w-4 h-4" />
            Next visit: is your mortgage debt delaying your retirement? <span className="text-white">The Debt-Free-Life conversation.</span>
          </div>
        </div>
      ),
    },
  ];

  const current = slides[idx];
  const dark = current.dark;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: dark ? 'linear-gradient(160deg,#00403B 0%,#005851 100%)' : '#f7faf9' }}>
      <div className={cx('flex items-center justify-end gap-4 px-5 md:px-8 py-4', dark ? 'text-white/80' : 'text-[#707070]')}>
        <span className="text-sm">{idx + 1} / {total}</span>
        <button onClick={onClose} aria-label="Close presentation" className="p-1.5 rounded-md hover:bg-black/10">
          <Icon path={P.x} className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center px-6 md:px-12 py-4">
        <div key={idx} style={{ animation: 'fadeIn 0.35s ease' }} className={cx('w-full max-w-4xl', dark ? 'text-white' : 'text-[#1A1A1A]')}>
          {current.node}
        </div>
      </div>

      <div className={cx('flex items-center justify-between px-5 md:px-8 py-4', dark ? 'text-white' : 'text-[#1A1A1A]')}>
        <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous slide" className={cx('p-2 rounded-lg', idx === 0 ? 'opacity-30' : 'hover:bg-black/10')}>
          <Icon path={P.left} className="w-6 h-6" />
        </button>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button key={i} onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} className={cx('w-2 h-2 rounded-full transition-colors', i === idx ? 'bg-[#45bcaa]' : dark ? 'bg-white/30' : 'bg-[#cbd5d1]')} />
          ))}
        </div>
        <button onClick={() => go(idx + 1)} disabled={idx === total - 1} aria-label="Next slide" className={cx('p-2 rounded-lg', idx === total - 1 ? 'opacity-30' : 'hover:bg-black/10')}>
          <Icon path={P.right} className="w-6 h-6" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
