'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  CARRIER_PRODUCTS,
  PRODUCT_TYPE_LABEL,
  UNDERWRITING_FIELDS,
  deriveUnderwriting,
  recommendCarriers,
  type LeadUnderwriting,
  type RankedRecommendation,
  type UnderwritingConditionKey,
} from '../lib/carrier-fit-rules';
import { getBuildOutcome, parseHeightToInches } from '../lib/carrier-build-charts';

// ─── Feature flag ─────────────────────────────────────────────────────
// Flip to `false` to hide both cards without removing code. Component
// returns null; nothing else is touched.
const CARRIER_FIT_ENABLED = true;

interface Props {
  agentUid: string;
  leadId: string;
  // Top-level lead fields we derive from
  dateOfBirth?: string;
  ageYears?: number;
  smokerStatus?: 'Y' | 'N';
  heightText?: string;
  weightLbs?: number;
  // Persisted structured-flag subdoc
  underwriting?: Partial<LeadUnderwriting>;
}

export default function CarrierFitPanel(props: Props) {
  if (!CARRIER_FIT_ENABLED) return null;
  return <CarrierFitPanelInner {...props} />;
}

function CarrierFitPanelInner({
  agentUid,
  leadId,
  dateOfBirth,
  ageYears,
  smokerStatus,
  heightText,
  weightLbs,
  underwriting,
}: Props) {
  const heightInches = heightText ? parseHeightToInches(heightText) : null;
  // ── Local optimistic state for each field. Hydrate once from props,
  //    then local is the source of truth (mirrors the rest of the lead
  //    detail page's autosave pattern — onSnapshot re-syncs would clobber
  //    an in-progress edit otherwise).
  const [flags, setFlags] = useState<Partial<LeadUnderwriting>>(underwriting || {});
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    setFlags(underwriting || {});
    hydratedRef.current = true;
  }, [underwriting]);

  const [showConditional, setShowConditional] = useState(false);
  const [showAllAccept, setShowAllAccept] = useState(false);

  const saveField = async (key: UnderwritingConditionKey, value: string) => {
    // Optimistic update so the Suggested-carriers card recomputes
    // immediately while the Firestore write is in flight.
    const next: Partial<LeadUnderwriting> = { ...flags };
    if (value === '') {
      delete next[key];
    } else {
      // Cast through `unknown` because each field has its own enum and
      // TypeScript can't relate them to a generic `string`. The option
      // values come from UNDERWRITING_FIELDS which is the canonical set.
      (next as Record<string, unknown>)[key] = value;
    }
    setFlags(next);
    try {
      const path = `underwriting.${key}`;
      const ref = doc(db, 'agents', agentUid, 'leads', leadId);
      await updateDoc(ref, {
        [path]: value === '' ? null : value,
      });
    } catch (err) {
      console.error('underwriting save failed:', err);
    }
  };

  const derived: LeadUnderwriting = useMemo(
    () => deriveUnderwriting({ underwriting: flags, dateOfBirth, ageYears, smokerStatus }),
    [flags, dateOfBirth, ageYears, smokerStatus],
  );

  const recommendations: RankedRecommendation[] = useMemo(
    () => recommendCarriers(derived),
    [derived],
  );

  const hasAnyFlag = Object.keys(flags).length > 0;
  const accepts = recommendations.filter((r) => r.outcome === 'ACCEPT');
  const conditionals = recommendations.filter((r) => r.outcome === 'CONDITIONAL');
  const calls = recommendations.filter((r) => r.outcome === 'CALL_CARRIER');
  const visibleAccepts = showAllAccept ? accepts : accepts.slice(0, 5);

  return (
    <>
      {/* ─── Card A — Underwriting profile ────────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">
            Underwriting profile
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851]">
            Suggestions live below
          </span>
        </div>
        <div className="mb-3 text-xs text-[#707070]">
          {derived.age !== undefined ? `Age ${derived.age}` : 'Age unknown'}
          {' · '}
          {derived.smoker === 'Y' ? 'Tobacco: yes'
            : derived.smoker === 'N' ? 'Tobacco: no'
            : 'Tobacco: unknown'}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {UNDERWRITING_FIELDS.map((field) => {
            const current = (flags[field.key] as string | undefined) ?? '';
            return (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  {field.label}
                </label>
                <select
                  value={current}
                  onChange={(e) => saveField(field.key, e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
                >
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Card B — Suggested carriers ──────────────────────────────── */}
      <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">
            Suggested carriers
          </h3>
          {recommendations.length > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851]">
              {accepts.length} accept · {conditionals.length} conditional · {calls.length} call
            </span>
          )}
        </div>

        {recommendations.length === 0 && !hasAnyFlag && (
          <div className="text-sm text-[#707070] italic">
            Set the underwriting profile above to see suggested carriers.
          </div>
        )}

        {recommendations.length === 0 && hasAnyFlag && (
          <div className="text-sm text-[#991B1B] bg-[#FEE2E2] rounded-[5px] px-3 py-2">
            No carriers match this profile. Common cause: HIV positive (try AIG) or active cancer/kidney failure. Adjust above or call carriers directly.
          </div>
        )}

        {/* ACCEPT rows */}
        {visibleAccepts.length > 0 && (
          <ul className="divide-y divide-[#eee]">
            {visibleAccepts.map((r) => (
              <li key={r.product.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#0D4D4D] truncate">
                      {r.product.carrier} <span className="font-normal text-[#374151]">· {r.product.product}</span>
                    </div>
                    {r.product.brandNotes && (
                      <div className="text-[11px] text-[#707070] italic mt-0.5">
                        {r.product.brandNotes}
                      </div>
                    )}
                    {r.notes.length > 0 && (
                      <div className="text-xs text-[#707070] mt-1">
                        {r.notes.slice(0, 2).join(' · ')}
                      </div>
                    )}
                    {derived.smoker === 'Y' && r.product.smokerNote && (
                      <div className="mt-1 text-[11px] text-[#0D4D4D] bg-[#daf3f0] rounded-[5px] px-2 py-1">
                        Tobacco quirk · {r.product.smokerNote}
                      </div>
                    )}
                    {(() => {
                      const bo = getBuildOutcome(r.product.id, heightInches, weightLbs ?? null);
                      if (!bo.hasChart || !bo.line) return null;
                      const isWarn = bo.rateClass === 'over_standard' || bo.rateClass === 'underweight';
                      return (
                        <div className={`mt-1 text-[11px] rounded-[5px] px-2 py-1 ${isWarn ? 'text-[#92400E] bg-[#FEF3C7]' : 'text-[#0D4D4D] bg-[#f1faf8]'}`}>
                          Build · {heightText || '?'} {weightLbs ? weightLbs + 'lbs' : '?'} → {bo.line}
                        </div>
                      );
                    })()}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#daf3f0] text-[#005851]">
                    {PRODUCT_TYPE_LABEL[r.product.productType]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {accepts.length > 5 && !showAllAccept && (
          <button
            type="button"
            onClick={() => setShowAllAccept(true)}
            className="mt-2 text-xs font-semibold text-[#44bbaa] hover:text-[#005751]"
          >
            Show all {accepts.length} accepting ↓
          </button>
        )}

        {/* CONDITIONAL + CALL_CARRIER (collapsible) */}
        {(conditionals.length > 0 || calls.length > 0) && (
          <div className="mt-3 pt-3 border-t border-[#eee]">
            <button
              type="button"
              onClick={() => setShowConditional((v) => !v)}
              className="text-xs font-semibold text-[#92400E] hover:text-[#705108]"
            >
              {showConditional ? 'Hide' : 'Show'} {conditionals.length + calls.length} conditional / call-carrier {showConditional ? '↑' : '↓'}
            </button>
            {showConditional && (
              <ul className="mt-2 divide-y divide-[#FEF3C7]">
                {[...conditionals, ...calls].map((r) => (
                  <li key={r.product.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#92400E] truncate">
                          {r.product.carrier} <span className="font-normal text-[#374151]">· {r.product.product}</span>
                        </div>
                        {r.notes.length > 0 && (
                          <div className="text-xs text-[#707070] mt-1">
                            {r.outcome === 'CALL_CARRIER' ? 'Call carrier — ' : 'May accept — '}
                            {r.notes.slice(0, 2).join(' · ')}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">
                        {PRODUCT_TYPE_LABEL[r.product.productType]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-[#eee] text-[11px] text-[#707070]">
          Based on the Quility cheat sheet · {CARRIER_PRODUCTS.length} products checked
        </div>
      </div>
    </>
  );
}
