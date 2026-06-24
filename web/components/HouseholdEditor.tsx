'use client';

import { useLeadHousehold, firstWord, type IncomeItem } from '../lib/household';
import { MoneyList } from './MoneyList';

const CARD = 'bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6';
const LABEL = 'text-sm font-semibold text-[#0F6E56] mb-2';

/**
 * Editable second insured + household financial fact-finder on the lead
 * profile. Writes to the same lead `household` object the presentation reads,
 * via useLeadHousehold — so what you enter here shows up in the deck.
 */
export default function HouseholdEditor({ leadId, leadName }: { leadId: string; leadName?: string }) {
  const hh = useLeadHousehold(leadId);
  const { household } = hh;
  const youFirst = firstWord(leadName) || 'Client';
  const spouse = household.spouse;
  const hasSpouse = spouse !== undefined;
  const spouseFirst = firstWord(spouse?.name) || 'Spouse';

  if (hh.loading) {
    return (
      <div className={CARD}>
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">Household &amp; finances</h3>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-1">Household &amp; finances</h3>
      <p className="text-xs text-[#707070] mb-4">Walk through income, expenses, and savings during the appointment. Feeds the presentation and saves automatically.</p>

      <div className="space-y-5">
        <div>
          <div className={LABEL}>Monthly income</div>
          <MoneyList
            rows={household.incomes}
            onChange={(r) => hh.setIncomes(r as IncomeItem[])}
            addLabel="income"
            labelPlaceholder="Source"
            suggestions={['Job', 'Social Security', 'Pension']}
            people={hasSpouse ? { lead: youFirst, spouse: spouseFirst } : null}
          />
        </div>
        <div>
          <div className={LABEL}>Monthly expenses (besides the mortgage)</div>
          <MoneyList
            rows={household.expenses}
            onChange={hh.setExpenses}
            addLabel="expense"
            labelPlaceholder="Expense"
            suggestions={['Car', 'Utilities', 'Phones', 'Insurance', 'Groceries', 'Credit cards', 'Other loans']}
          />
        </div>
        <div>
          <div className={LABEL}>Savings &amp; retirement</div>
          <MoneyList
            rows={household.assets}
            onChange={hh.setAssets}
            addLabel="account"
            labelPlaceholder="Account"
            suggestions={['401k', 'IRA', 'Annuity', 'Savings']}
            totalSuffix=""
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-[#707070]">Existing life insurance</span>
            <div className="flex items-center border-b-2 border-[#e5e7eb] focus-within:border-[#45bcaa]">
              <span className="text-[#707070] text-sm">$</span>
              <input value={household.existingCoverage || ''} onChange={(e) => hh.setExistingCoverage(e.target.value)} inputMode="numeric" placeholder="0" className="w-full bg-transparent outline-none py-1 text-sm" />
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-[#707070]">Home value</span>
            <div className="flex items-center border-b-2 border-[#e5e7eb] focus-within:border-[#45bcaa]">
              <span className="text-[#707070] text-sm">$</span>
              <input value={household.homeValue || ''} onChange={(e) => hh.setHomeValue(e.target.value)} inputMode="numeric" placeholder="0" className="w-full bg-transparent outline-none py-1 text-sm" />
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
