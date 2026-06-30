'use client';

import { fmtUsd, toNum, newId } from '../lib/household';

export interface MoneyRow {
  id: string;
  label: string;
  amount: string;
  person?: 'lead' | 'spouse';
}

/**
 * Add / remove / edit list of money line items with a live auto-total.
 * Light-themed — used on the (light) discovery slide and in the lead profile.
 * Modeled on the lead PhoneList pattern: caller owns the array, we hand back
 * the next array via onChange.
 */
export function MoneyList({
  rows,
  onChange,
  addLabel = 'Add',
  suggestions,
  people,
  labelPlaceholder = 'Label',
  showTotal = true,
  totalSuffix = '/mo',
}: {
  rows: MoneyRow[];
  onChange: (rows: MoneyRow[]) => void;
  addLabel?: string;
  suggestions?: string[];
  people?: { lead: string; spouse: string } | null;
  labelPlaceholder?: string;
  showTotal?: boolean;
  totalSuffix?: string;
}) {
  const update = (id: string, patch: Partial<MoneyRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = (label = '') =>
    onChange([...rows, { id: newId(), label, amount: '', ...(people ? { person: 'lead' as const } : {}) }]);
  const total = rows.reduce((s, r) => s + toNum(r.amount), 0);

  return (
    <div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            {people && (
              <div className="inline-flex rounded-md border border-[#d8dddb] overflow-hidden text-[11px] shrink-0">
                {(['lead', 'spouse'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => update(r.id, { person: p })}
                    className={(r.person || 'lead') === p ? 'px-2 py-1 bg-[#005851] text-white' : 'px-2 py-1 bg-white text-[#707070]'}
                  >
                    {p === 'lead' ? people.lead : people.spouse}
                  </button>
                ))}
              </div>
            )}
            <input
              value={r.label}
              onChange={(e) => update(r.id, { label: e.target.value })}
              placeholder={labelPlaceholder}
              className="flex-1 min-w-0 bg-transparent border-b border-[#e5e7eb] focus:border-[#45bcaa] outline-none py-1 text-sm"
            />
            <div className="flex items-center border-b border-[#e5e7eb] focus-within:border-[#45bcaa]">
              <span className="text-[#707070] text-sm">$</span>
              <input
                value={r.amount}
                onChange={(e) => update(r.id, { amount: e.target.value })}
                inputMode="numeric"
                placeholder="0"
                className="w-20 bg-transparent outline-none py-1 text-sm text-right"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(r.id)}
              aria-label="Remove row"
              className="text-[#c2c2c2] hover:text-[#E24B4A] shrink-0 w-5 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {suggestions
          ?.filter((s) => !rows.some((r) => r.label.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="text-[11px] text-[#0F6E56] bg-[#daf3f0] rounded-full px-2.5 py-1 hover:bg-[#c7ebe4]"
            >
              + {s}
            </button>
          ))}
        <button type="button" onClick={() => add()} className="text-[11px] text-[#005851] font-semibold hover:underline">
          + {addLabel}
        </button>
      </div>
      {showTotal && (
        <div className="mt-2 flex justify-between text-sm border-t border-[#ececec] pt-2">
          <span className="text-[#707070]">Total</span>
          <span className="font-semibold text-[#1A1A1A]">
            {fmtUsd(total)}
            {totalSuffix}
          </span>
        </div>
      )}
    </div>
  );
}
