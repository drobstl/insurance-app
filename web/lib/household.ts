'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useDashboard } from '../app/dashboard/DashboardContext';

// ── shared money helpers ──
export const toNum = (s?: string | number | null): number => {
  if (typeof s === 'number') return isFinite(s) ? s : 0;
  const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : 0;
};
export const fmtUsd = (n?: number | null): string =>
  n != null && isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '$0';
export const firstWord = (s?: string): string => (s || '').trim().split(/\s+/)[0] || '';
export const roundTo = (n: number, step: number): number => Math.round(n / step) * step;
export function ageFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const a = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return a > 0 && a < 120 ? a : undefined;
}
let _seq = 0;
export const newId = (): string => `${Date.now().toString(36)}${(_seq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// ── types ──
export interface IncomeItem { id: string; person?: 'lead' | 'spouse'; label: string; amount: string }
export interface MoneyItem { id: string; label: string; amount: string }
export interface SpouseInfo { name?: string; ageYears?: number; gender?: 'M' | 'F'; smokerStatus?: 'Y' | 'N' }

// Relationship vocabulary lives in the server-safe shared module so the
// convert API route can import it too. Re-exported here for existing consumers.
export { RELATIONSHIPS, RELATIONSHIP_LABELS, relationshipLabel } from './household-shared';
export type { Relationship, HouseholdRole, HouseholdRelationship } from './household-shared';
import type { Relationship } from './household-shared';

/** An additional person on the lead (the primary lead keeps its own fields). */
export interface Person {
  id: string;
  relationship: Relationship;
  name?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  ageYears?: number;
  gender?: 'M' | 'F';
  smokerStatus?: 'Y' | 'N';
  heightText?: string;
  weightLbs?: number;
  phone?: string;
  email?: string;
  healthNotes?: string;
  insured?: boolean; // we're writing an application on them → becomes a client at close
}

export interface HouseholdProfile {
  people: Person[];
  /** Derived view of the first spouse/partner person — for the deck's couple math. Not persisted directly. */
  spouse?: SpouseInfo;
  incomes: IncomeItem[];
  expenses: MoneyItem[]; // monthly, EXCLUDING the mortgage (that's lead.monthlyMortgageAmount)
  assets: MoneyItem[]; // lump sums: 401k / IRA / annuity / savings
  survivorIncome?: { ifLead?: string; ifSpouse?: string }; // extra income that continues to the survivor (SS/pension)
  existingCoverage?: string;
  homeValue?: string;
}

export interface QuoteOption { label: string; coverage: string; priceYou: string; priceSpouse: string }
export interface QuoteState {
  optTab: 'payoff' | 'payment';
  couple: boolean;
  whoPasses: 'you' | 'spouse';
  olderFraming: boolean;
  mostChosen: { payoff: number; payment: number };
  payoffOpts: QuoteOption[];
  paymentOpts: QuoteOption[];
}

const EMPTY_HH: HouseholdProfile = { people: [], incomes: [], expenses: [], assets: [], survivorIncome: {} };

const isSpouseRel = (r: Relationship) => r === 'spouse' || r === 'partner';
const primarySpouse = (people: Person[]): SpouseInfo | undefined => {
  const p = people.find((x) => isSpouseRel(x.relationship));
  return p ? { name: p.name, ageYears: p.ageYears, gender: p.gender, smokerStatus: p.smokerStatus } : undefined;
};

// ── calc ──
export const sumIncomes = (h: HouseholdProfile, person?: 'lead' | 'spouse'): number =>
  h.incomes.filter((i) => !person || i.person === person).reduce((s, i) => s + toNum(i.amount), 0);
export const sumExpenses = (h: HouseholdProfile): number => h.expenses.reduce((s, e) => s + toNum(e.amount), 0);
export const sumAssets = (h: HouseholdProfile): number => h.assets.reduce((s, a) => s + toNum(a.amount), 0);

export interface GapResult {
  totalExpenses: number;
  otherExpenses: number;
  survivingIncome: number;
  shortfallNow: number;
  shortfallAfterPayoff: number;
  assets: number;
  runwayMonths: number | null;
}
export function computeGap(
  h: HouseholdProfile,
  opts: { whoPasses: 'you' | 'spouse'; couple: boolean; mortgage: number },
): GapResult {
  const otherExpenses = sumExpenses(h);
  const totalExpenses = opts.mortgage + otherExpenses;
  const survivor: 'lead' | 'spouse' = opts.whoPasses === 'you' ? 'spouse' : 'lead';
  const ownIncome = opts.couple ? sumIncomes(h, survivor) : 0;
  const extra = toNum(opts.whoPasses === 'you' ? h.survivorIncome?.ifLead : h.survivorIncome?.ifSpouse);
  const survivingIncome = ownIncome + extra;
  const shortfallNow = Math.max(0, totalExpenses - survivingIncome);
  const shortfallAfterPayoff = Math.max(0, otherExpenses - survivingIncome);
  const assets = sumAssets(h);
  const runwayMonths = shortfallNow > 0 && assets > 0 ? assets / shortfallNow : null;
  return { totalExpenses, otherExpenses, survivingIncome, shortfallNow, shortfallAfterPayoff, assets, runwayMonths };
}

// ── defaults derived from the lead doc ──
type LeadDocShape = {
  ageYears?: number;
  dateOfBirth?: string;
  coborrowerStatus?: 'Y' | 'N';
  spouseName?: string;
  spouseAgeYears?: number;
  smokerStatus?: 'Y' | 'N';
  mortgageDetails?: { balance?: number };
  monthlyMortgageAmount?: number;
  household?: Partial<HouseholdProfile> & { spouse?: SpouseInfo };
  presentationQuote?: QuoteState;
};

function hydrateHousehold(d: LeadDocShape): HouseholdProfile {
  const hh = d.household || {};
  let people: Person[] = hh.people || [];
  if (people.length === 0) {
    // Migrate from the earlier thin spouse object / flat lead fields.
    const sp = hh.spouse || (d.spouseName ? { name: d.spouseName, ageYears: d.spouseAgeYears } : undefined);
    if (sp && (sp.name || sp.ageYears != null)) {
      people = [{ id: newId(), relationship: 'spouse', insured: true, name: sp.name, ageYears: sp.ageYears, gender: sp.gender, smokerStatus: sp.smokerStatus }];
    }
  }
  return {
    people,
    incomes: hh.incomes || [],
    expenses: hh.expenses || [],
    assets: hh.assets || [],
    survivorIncome: hh.survivorIncome || {},
    existingCoverage: hh.existingCoverage,
    homeValue: hh.homeValue,
  };
}

export function defaultQuote(d: LeadDocShape): QuoteState {
  const age = d.ageYears ?? ageFromDob(d.dateOfBirth);
  const balance = d.mortgageDetails?.balance;
  const hasSpouse = !!(
    d.household?.people?.some((p) => isSpouseRel(p.relationship)) ||
    d.household?.spouse?.name ||
    d.spouseName
  );
  const balStr = balance != null ? String(balance) : '';
  const half = balance != null ? String(roundTo(balance / 2, 5000)) : '';
  const blank = { priceYou: '', priceSpouse: '' };
  return {
    optTab: age != null && age >= 60 ? 'payment' : 'payoff',
    couple: d.coborrowerStatus === 'Y' && hasSpouse,
    whoPasses: 'you',
    olderFraming: age != null && age >= 60,
    mostChosen: { payoff: 1, payment: 1 },
    payoffOpts: [
      { label: 'Partial payoff', coverage: half, ...blank },
      { label: 'Full payoff', coverage: balStr, ...blank },
      { label: 'Full payoff + cash value', coverage: balStr, ...blank },
    ],
    paymentOpts: [
      { label: '9 months of payments', coverage: '', ...blank },
      { label: '1 year of payments', coverage: '', ...blank },
      { label: '18 months of payments', coverage: '', ...blank },
    ],
  };
}

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)); // drops undefined for Firestore

/**
 * Reads + writes a lead's household financial profile, its people, and the
 * saved presentation quote. Hydrates once from the lead doc, then local state
 * is the source of truth (the agent is editing); writes are debounced ~600ms,
 * matching the lead-detail autosave convention.
 */
export function useLeadHousehold(leadId?: string) {
  const { user } = useDashboard();
  const [loading, setLoading] = useState(true);
  const [household, setHouseholdState] = useState<HouseholdProfile>(EMPTY_HH);
  const [quote, setQuoteState] = useState<QuoteState | null>(null);
  const [mortgage, setMortgageLocal] = useState<{ balance: string; payment: string }>({ balance: '', payment: '' });
  const hydrated = useRef(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!user || !leadId) return;
    const ref = doc(db, 'agents', user.uid, 'leads', leadId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = (snap.data() || {}) as LeadDocShape;
        if (!hydrated.current) {
          setHouseholdState(hydrateHousehold(d));
          setQuoteState(d.presentationQuote || defaultQuote(d));
          setMortgageLocal({
            balance: d.mortgageDetails?.balance != null ? String(d.mortgageDetails.balance) : '',
            payment: d.monthlyMortgageAmount != null ? String(d.monthlyMortgageAmount) : '',
          });
          hydrated.current = true;
        }
        setLoading(false);
      },
      (err) => {
        console.error('household onSnapshot failed:', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, leadId]);

  const write = useCallback(
    (key: string, fields: Record<string, unknown>) => {
      if (!user || !leadId) return;
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), fields).catch((e) =>
          console.error('household save failed:', e),
        );
      }, 600);
    },
    [user, leadId],
  );

  const patchHH = useCallback(
    (updater: (h: HouseholdProfile) => HouseholdProfile) => {
      setHouseholdState((h) => {
        const next = updater(h);
        // `spouse` is a derived view (added on read), never stored in state — persist as-is.
        write('household', { household: clean(next) });
        return next;
      });
    },
    [write],
  );

  const setIncomes = useCallback((rows: IncomeItem[]) => patchHH((h) => ({ ...h, incomes: rows })), [patchHH]);
  const setExpenses = useCallback((rows: MoneyItem[]) => patchHH((h) => ({ ...h, expenses: rows })), [patchHH]);
  const setAssets = useCallback((rows: MoneyItem[]) => patchHH((h) => ({ ...h, assets: rows })), [patchHH]);

  // People
  const addPerson = useCallback(
    (relationship: Relationship = 'spouse', insured = true) =>
      patchHH((h) => ({ ...h, people: [...h.people, { id: newId(), relationship, insured }] })),
    [patchHH],
  );
  const updatePerson = useCallback(
    (id: string, patch: Partial<Person>) => patchHH((h) => ({ ...h, people: h.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    [patchHH],
  );
  const removePerson = useCallback((id: string) => patchHH((h) => ({ ...h, people: h.people.filter((p) => p.id !== id) })), [patchHH]);

  // Spouse convenience (back-compat for the deck) — upserts the primary spouse/partner person.
  const setSpouse = useCallback(
    (partial: Partial<SpouseInfo>) =>
      patchHH((h) => {
        const people = [...h.people];
        const i = people.findIndex((p) => isSpouseRel(p.relationship));
        if (i === -1) people.push({ id: newId(), relationship: 'spouse', insured: true, ...partial });
        else people[i] = { ...people[i], ...partial };
        return { ...h, people };
      }),
    [patchHH],
  );
  const clearSpouse = useCallback(
    () => patchHH((h) => {
      const i = h.people.findIndex((p) => isSpouseRel(p.relationship));
      return i === -1 ? h : { ...h, people: h.people.filter((_, idx) => idx !== i) };
    }),
    [patchHH],
  );

  const setSurvivorIncome = useCallback(
    (k: 'ifLead' | 'ifSpouse', v: string) => patchHH((h) => ({ ...h, survivorIncome: { ...h.survivorIncome, [k]: v } })),
    [patchHH],
  );
  const setExistingCoverage = useCallback((v: string) => patchHH((h) => ({ ...h, existingCoverage: v })), [patchHH]);
  const setHomeValue = useCallback((v: string) => patchHH((h) => ({ ...h, homeValue: v })), [patchHH]);

  const setMortgagePayment = useCallback(
    (v: string) => {
      setMortgageLocal((m) => ({ ...m, payment: v }));
      write('mtgPay', { monthlyMortgageAmount: v.trim() === '' ? null : toNum(v) });
    },
    [write],
  );
  const setMortgageBalance = useCallback(
    (v: string) => {
      setMortgageLocal((m) => ({ ...m, balance: v }));
      write('mtgBal', { 'mortgageDetails.balance': v.trim() === '' ? null : toNum(v) });
    },
    [write],
  );

  const patchQuote = useCallback(
    (partial: Partial<QuoteState>) => {
      setQuoteState((q) => {
        const next = { ...(q || defaultQuote({})), ...partial } as QuoteState;
        write('quote', { presentationQuote: clean(next) });
        return next;
      });
    },
    [write],
  );

  // Returned household carries the derived spouse view so existing consumers (the deck) are unchanged.
  const householdView = useMemo<HouseholdProfile>(
    () => ({ ...household, spouse: primarySpouse(household.people) }),
    [household],
  );

  return {
    loading,
    household: householdView,
    people: household.people,
    setIncomes,
    setExpenses,
    setAssets,
    addPerson,
    updatePerson,
    removePerson,
    setSpouse,
    clearSpouse,
    setSurvivorIncome,
    setExistingCoverage,
    setHomeValue,
    mortgageBalance: mortgage.balance,
    mortgagePayment: mortgage.payment,
    setMortgageBalance,
    setMortgagePayment,
    quote,
    patchQuote,
  };
}
