'use client';

import { useLeadHousehold, firstWord, toNum, RELATIONSHIPS, type Relationship } from '../lib/household';

const CARD = 'bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6';
const FIELD = 'w-full bg-transparent border-b-2 border-[#e5e7eb] focus:border-[#45bcaa] outline-none py-1 text-sm';
const REL_LABEL: Record<Relationship, string> = {
  spouse: 'Spouse',
  partner: 'Partner',
  child: 'Child',
  parent: 'Parent',
  sibling: 'Sibling',
  grandparent: 'Grandparent',
  other: 'Other',
};

/**
 * Add/edit additional people on a lead (spouse / partner / family) with full
 * underwriting info, saved to the lead via useLeadHousehold. Captured at
 * appointment time; "Writing an app" flags who becomes a distinct client at close.
 */
export default function PeopleEditor({ leadId, leadName }: { leadId: string; leadName?: string }) {
  const hh = useLeadHousehold(leadId);
  const people = hh.people;
  const youFirst = firstWord(leadName) || 'the primary';

  if (hh.loading) {
    return (
      <div className={CARD}>
        <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider">People on this lead</h3>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <h3 className="text-sm font-bold text-[#005851] uppercase tracking-wider mb-1">People on this lead</h3>
      <p className="text-xs text-[#707070] mb-4">
        Add a spouse, partner, or family member you&apos;re also gathering info on. Saved to the lead; carries to their client if you write an application on them.
      </p>

      {people.length === 0 && <p className="text-sm text-[#707070] mb-3">Just {youFirst} so far.</p>}

      <div className="space-y-4">
        {people.map((p) => (
          <div key={p.id} className="rounded-[5px] border border-[#e5e7eb] p-3">
            <div className="flex items-center justify-between gap-3 mb-3">
              <select
                value={p.relationship}
                onChange={(e) => hh.updatePerson(p.id, { relationship: e.target.value as Relationship })}
                className="text-sm font-semibold text-[#005851] bg-transparent border-b border-[#e5e7eb] focus:border-[#45bcaa] outline-none py-1"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>{REL_LABEL[r]}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-[#374151] whitespace-nowrap">
                <input type="checkbox" checked={!!p.insured} onChange={(e) => hh.updatePerson(p.id, { insured: e.target.checked })} />
                Writing an app
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[#707070]">Name</span>
                <input value={p.name || ''} onChange={(e) => hh.updatePerson(p.id, { name: e.target.value })} className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Date of birth</span>
                <input type="date" value={p.dateOfBirth || ''} onChange={(e) => hh.updatePerson(p.id, { dateOfBirth: e.target.value || undefined })} className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Age</span>
                <input value={p.ageYears != null ? String(p.ageYears) : ''} onChange={(e) => hh.updatePerson(p.id, { ageYears: e.target.value.trim() === '' ? undefined : toNum(e.target.value) })} inputMode="numeric" className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Gender</span>
                <select value={p.gender || ''} onChange={(e) => hh.updatePerson(p.id, { gender: (e.target.value || undefined) as 'M' | 'F' | undefined })} className={FIELD}>
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Tobacco</span>
                <select value={p.smokerStatus || ''} onChange={(e) => hh.updatePerson(p.id, { smokerStatus: (e.target.value || undefined) as 'Y' | 'N' | undefined })} className={FIELD}>
                  <option value="">—</option>
                  <option value="N">No</option>
                  <option value="Y">Yes</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Height</span>
                <input value={p.heightText || ''} onChange={(e) => hh.updatePerson(p.id, { heightText: e.target.value || undefined })} placeholder={"5'10\""} className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Weight (lbs)</span>
                <input value={p.weightLbs != null ? String(p.weightLbs) : ''} onChange={(e) => hh.updatePerson(p.id, { weightLbs: e.target.value.trim() === '' ? undefined : toNum(e.target.value) })} inputMode="numeric" className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs text-[#707070]">Phone</span>
                <input value={p.phone || ''} onChange={(e) => hh.updatePerson(p.id, { phone: e.target.value || undefined })} inputMode="tel" className={FIELD} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-[#707070]">Email</span>
                <input value={p.email || ''} onChange={(e) => hh.updatePerson(p.id, { email: e.target.value || undefined })} inputMode="email" className={FIELD} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-[#707070]">Health notes (conditions, meds)</span>
                <textarea value={p.healthNotes || ''} onChange={(e) => hh.updatePerson(p.id, { healthNotes: e.target.value || undefined })} rows={2} className="w-full bg-transparent border-2 border-[#e5e7eb] rounded-[5px] focus:border-[#45bcaa] outline-none p-2 text-sm" />
              </label>
            </div>
            <button type="button" onClick={() => hh.removePerson(p.id)} className="mt-2 text-xs text-[#991B1B] hover:underline">
              Remove person
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => hh.addPerson('spouse', true)}
          className="px-4 py-2 text-sm font-semibold text-[#005851] border-2 border-[#005851] rounded-[5px] hover:bg-[#005851] hover:text-white transition-colors"
        >
          + Add spouse / partner
        </button>
        <button
          type="button"
          onClick={() => hh.addPerson('other', false)}
          className="px-4 py-2 text-sm font-medium text-[#707070] border border-gray-300 rounded-[5px] hover:bg-gray-50 transition-colors"
        >
          + Add family member
        </button>
      </div>
    </div>
  );
}
