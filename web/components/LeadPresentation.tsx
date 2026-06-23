'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../app/dashboard/DashboardContext';

/**
 * The fields the presentation reads off a lead. Kept local + loose so the
 * panel can hand us a Lead without a shared type dependency.
 */
export interface PresentationLead {
  name?: string;
  spouseName?: string;
  spouseAgeYears?: number;
  ageYears?: number;
  dateOfBirth?: string;
  gender?: 'M' | 'F';
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
  check: 'M5 13l4 4L19 7',
  left: 'M15 19l-7-7 7-7',
  right: 'M9 5l7 7-7 7',
  x: 'M6 18L18 6M6 6l12 12',
  users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2-5.24',
  arrow: 'M14 5l7 7m0 0l-7 7m7-7H3',
  heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  adjust: 'M10 6H3M21 6h-4M14 6a2 2 0 11-4 0 2 2 0 014 0zM7 12H3m18 0h-9m1 0a2 2 0 11-4 0 2 2 0 014 0zM17 18H3m18 0h-1m-3 0a2 2 0 11-4 0 2 2 0 014 0z',
};

function NumField({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[#707070]">{label}</span>
      <div className="flex items-center border-b-2 border-[#e5e7eb] focus-within:border-[#45bcaa] transition-colors">
        {prefix && <span className="text-[#707070]">{prefix}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          placeholder="—"
          className="w-full bg-transparent py-1.5 text-lg outline-none"
        />
      </div>
    </label>
  );
}

export default function LeadPresentation({ lead, onClose }: { lead: PresentationLead; onClose: () => void }) {
  const { agentProfile } = useDashboard();

  // ── derived: lead ──
  const youFirst = firstWord(lead.name) || 'you';
  const spouseFirst = firstWord(lead.spouseName);
  const hasSpouse = !!spouseFirst;
  const survivor = spouseFirst || 'your family';
  const age = lead.ageYears ?? ageFromDob(lead.dateOfBirth);
  const spouseAge = lead.spouseAgeYears;
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

  // ── state ──
  const [idx, setIdx] = useState(0);
  const [couple, setCouple] = useState<boolean>(lead.coborrowerStatus === 'Y' && hasSpouse);
  const [whoPasses, setWhoPasses] = useState<'you' | 'spouse'>('you');
  const [optTab, setOptTab] = useState<'payoff' | 'payment'>(age != null && age >= 60 ? 'payment' : 'payoff');
  // Page "three ways" copy: the situational version for older / health-impaired
  // clients. Auto-on at 60+ (we don't store conditions like cancer/stroke/diabetes),
  // with a subtle agent toggle to flip it for a younger client with health issues.
  const [olderFraming, setOlderFraming] = useState(age != null && age >= 60);
  const [mostChosen, setMostChosen] = useState<{ payoff: number; payment: number }>({ payoff: 1, payment: 1 });

  const [disc, setDisc] = useState({
    balance: balance != null ? String(balance) : '',
    payment: payment != null ? String(payment) : '',
    homeValue: '',
    incomeYou: '',
    incomeSpouse: '',
    otherExpenses: '',
    existing: '',
    continuesYou: '', // income that continues if YOU pass (default = spouse income)
    continuesSpouse: '', // income that continues if SPOUSE passes (default = your income)
  });
  const setDiscField = (k: keyof typeof disc, v: string) => setDisc((d) => ({ ...d, [k]: v }));

  const [payoffOpts, setPayoffOpts] = useState([
    { label: 'Partial payoff', coverage: balance != null ? String(roundTo(balance / 2, 5000)) : '', priceYou: '', priceSpouse: '' },
    { label: 'Full payoff', coverage: balance != null ? String(balance) : '', priceYou: '', priceSpouse: '' },
    { label: 'Full payoff + cash value', coverage: balance != null ? String(balance) : '', priceYou: '', priceSpouse: '' },
  ]);
  const [paymentOpts, setPaymentOpts] = useState([
    { label: '9 months of payments', coverage: '', priceYou: '', priceSpouse: '' },
    { label: '1 year of payments', coverage: '', priceYou: '', priceSpouse: '' },
    { label: '18 months of payments', coverage: '', priceYou: '', priceSpouse: '' },
  ]);

  // ── cash-flow math (all monthly) ──
  const mortgage = toNum(disc.payment);
  const otherExp = toNum(disc.otherExpenses);
  const totalExpenses = mortgage + otherExp;
  const incYou = toNum(disc.incomeYou);
  const incSpouse = toNum(disc.incomeSpouse);
  const overrideKey = whoPasses === 'you' ? 'continuesYou' : 'continuesSpouse';
  const survivingDefault = whoPasses === 'you' ? (couple ? incSpouse : 0) : incYou;
  const survivingIncome = disc[overrideKey].trim() !== '' ? toNum(disc[overrideKey]) : survivingDefault;
  const passingName = whoPasses === 'you' ? youFirst : spouseFirst || 'your spouse';

  // body scroll lock + keyboard nav
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const total = 8;
  const go = (n: number) => setIdx(Math.max(0, Math.min(total - 1, n)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(total - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const eyebrow = (text: string, dark: boolean) => (
    <p className={cx('text-sm mb-3', dark ? 'text-[#9fd5cc]' : 'text-[#707070]')}>{text}</p>
  );

  // One gap scenario panel (expenses vs surviving income), scaled to a shared max.
  const gapPanel = (title: string, expensesAmt: number) => {
    const covered = Math.min(survivingIncome, expensesAmt);
    const shortfall = Math.max(0, expensesAmt - survivingIncome);
    const denom = totalExpenses > 0 ? totalExpenses : 1;
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

  // One priced option card. Tapping the card body marks it "Most chosen".
  const optionCard = (tab: 'payoff' | 'payment', opt: { label: string; coverage: string; priceYou: string; priceSpouse: string }, i: number) => {
    const chosen = mostChosen[tab] === i;
    const setter = tab === 'payoff' ? setPayoffOpts : setPaymentOpts;
    const upd = (field: 'coverage' | 'priceYou' | 'priceSpouse', v: string) =>
      setter((o) => o.map((x, j) => (j === i ? { ...x, [field]: v } : x)));
    const priceInput = (val: string, field: 'priceYou' | 'priceSpouse', big: boolean) => (
      <input
        value={val}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => upd(field, e.target.value)}
        inputMode="numeric"
        placeholder="—"
        className={cx(
          'font-bold bg-transparent outline-none border-b-2 border-dashed border-[#cbd5d1] focus:border-[#45bcaa] text-[#1A1A1A]',
          big ? 'text-3xl w-20' : 'text-lg w-16',
        )}
      />
    );
    return (
      <div
        key={opt.label}
        onClick={() => setMostChosen((m) => ({ ...m, [tab]: i }))}
        className={cx(
          'rounded-xl border-2 p-5 bg-white relative cursor-pointer',
          chosen ? 'border-[#0099FF]' : 'border-[#1A1A1A] border-r-[4px] border-b-[4px]',
        )}
      >
        {chosen && (
          <span className="absolute -top-3 left-4 bg-[#0099FF] text-white text-[11px] px-2.5 py-0.5 rounded-md">Most chosen</span>
        )}
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
              onChange={(e) => upd('coverage', e.target.value)}
              inputMode="numeric"
              placeholder="—"
              className="w-24 bg-transparent outline-none border-b border-[#e5e7eb] focus:border-[#45bcaa] text-[#374151]"
            />
          </div>
        )}
      </div>
    );
  };

  // ── slides ──
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
                <img
                  src={`data:image/jpeg;base64,${familyPhoto}`}
                  alt="The agent's family"
                  className="rounded-2xl w-full object-cover"
                  style={{ maxHeight: 240 }}
                />
              )}
              <div className={cx('inline-flex items-center gap-3 rounded-xl border-2 border-[#1A1A1A] border-r-[4px] border-b-[4px] bg-white px-4 py-3', familyPhoto && 'mt-4')}>
                <Icon path={P.shield} className="w-6 h-6 text-[#0F6E56]" />
                <div>
                  <div className="text-sm font-semibold text-[#1A1A1A]">Licensed life insurance broker</div>
                  {licenseEntry && (
                    <div className="text-xs text-[#707070]">{licenseEntry.state} · License #{licenseEntry.number}</div>
                  )}
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
    // 3 — Discovery
    {
      dark: false,
      node: (
        <div>
          {eyebrow("Let's map it out together", false)}
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight">Here&apos;s what we know — we fill in the rest together.</h2>
          {hasSpouse && (
            <div className="inline-flex rounded-lg border-2 border-[#1A1A1A] overflow-hidden text-sm mt-5">
              <button onClick={() => setCouple(false)} className={cx('px-4 py-1.5', !couple ? 'bg-[#005851] text-white' : 'bg-white text-[#1A1A1A]')}>
                Just {youFirst}
              </button>
              <button onClick={() => setCouple(true)} className={cx('px-4 py-1.5', couple ? 'bg-[#005851] text-white' : 'bg-white text-[#1A1A1A]')}>
                {youFirst} &amp; {spouseFirst}
              </button>
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-8 mt-6">
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#0F6E56]">Mortgage</div>
              <NumField label="Balance" value={disc.balance} onChange={(v) => setDiscField('balance', v)} prefix="$" />
              <NumField label="Monthly payment" value={disc.payment} onChange={(v) => setDiscField('payment', v)} prefix="$" />
              <NumField label="Home value" value={disc.homeValue} onChange={(v) => setDiscField('homeValue', v)} prefix="$" />
            </div>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#0F6E56]">Health</div>
              <div>
                <div className="text-xs text-[#707070]">{couple ? `Age — ${youFirst}` : 'Age'}</div>
                <div className="text-lg py-1.5 border-b-2 border-[#e5e7eb]">{age ?? '—'}</div>
              </div>
              {couple && (
                <div>
                  <div className="text-xs text-[#707070]">Age — {spouseFirst}</div>
                  <div className="text-lg py-1.5 border-b-2 border-[#e5e7eb]">{spouseAge ?? '—'}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-[#707070]">Tobacco</div>
                <div className="text-lg py-1.5 border-b-2 border-[#e5e7eb]">
                  {lead.smokerStatus === 'Y' ? 'Yes' : lead.smokerStatus === 'N' ? 'No' : '—'}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#0F6E56]">Money</div>
              <NumField label={couple ? `Monthly income — ${youFirst}` : 'Monthly income'} value={disc.incomeYou} onChange={(v) => setDiscField('incomeYou', v)} prefix="$" />
              {couple && (
                <NumField label={`Monthly income — ${spouseFirst}`} value={disc.incomeSpouse} onChange={(v) => setDiscField('incomeSpouse', v)} prefix="$" />
              )}
              <NumField label="Other monthly expenses" value={disc.otherExpenses} onChange={(v) => setDiscField('otherExpenses', v)} prefix="$" />
              <NumField label="Existing coverage" value={disc.existing} onChange={(v) => setDiscField('existing', v)} prefix="$" />
            </div>
          </div>
        </div>
      ),
    },
    // 4 — The gap (cash-flow, before/after payoff)
    {
      dark: true,
      node: (
        <div>
          {eyebrow('What your family would actually face', true)}
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">
            {couple ? `If ${passingName}'s income stops, the bills don't.` : "Your paycheck stops. The bills don't."}
          </h2>
          {totalExpenses > 0 ? (
            <div className="mt-7 max-w-3xl">
              {couple && (
                <div className="inline-flex rounded-lg border border-white/30 overflow-hidden text-sm mb-5">
                  {(['you', 'spouse'] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setWhoPasses(w)}
                      className={cx('px-4 py-1.5', whoPasses === w ? 'bg-white text-[#005851] font-semibold' : 'text-[#d6efea]')}
                    >
                      If {w === 'you' ? youFirst : spouseFirst}
                    </button>
                  ))}
                </div>
              )}
              <label className="block text-sm text-[#bfe4dd] mb-6">
                Income that would continue
                <span className="ml-2">$</span>
                <input
                  value={disc[overrideKey]}
                  onChange={(e) => setDiscField(overrideKey, e.target.value)}
                  inputMode="numeric"
                  placeholder={String(Math.round(survivingDefault))}
                  className="w-28 bg-transparent border-b border-white/40 text-white outline-none ml-1 py-1"
                />
              </label>
              <div className="flex flex-col md:flex-row gap-8">
                {gapPanel('Bills right now', totalExpenses)}
                {gapPanel('With the home paid off', otherExp)}
              </div>
              {mortgage > 0 && (
                <p className="mt-6 text-[#bfe4dd]">
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
    // 5 — Three ways (situational)
    {
      dark: false,
      node: (
        <div>
          <div className="flex items-start justify-between">
            {eyebrow('Three ways to protect it', false)}
            <button
              onClick={() => setOlderFraming((v) => !v)}
              aria-label="Switch option framing"
              title="Switch option framing"
              className="opacity-20 hover:opacity-100 transition-opacity p-1 text-[#707070] shrink-0"
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
            <span className="text-sm">
              Every option includes living benefits — critical, chronic &amp; terminal illness. You don&apos;t have to die to use it.
            </span>
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
            {(optTab === 'payoff' ? payoffOpts : paymentOpts).map((opt, i) => optionCard(optTab, opt, i))}
          </div>
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
      {/* Top bar: slide counter + close. (No sales-framework labels — the lead sees this screen.) */}
      <div className={cx('flex items-center justify-end gap-4 px-5 md:px-8 py-4', dark ? 'text-white/80' : 'text-[#707070]')}>
        <span className="text-sm">{idx + 1} / {total}</span>
        <button onClick={onClose} aria-label="Close presentation" className="p-1.5 rounded-md hover:bg-black/10">
          <Icon path={P.x} className="w-5 h-5" />
        </button>
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
              className={cx('w-2 h-2 rounded-full transition-colors', i === idx ? 'bg-[#45bcaa]' : dark ? 'bg-white/30' : 'bg-[#cbd5d1]')}
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
