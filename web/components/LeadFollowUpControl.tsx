'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { followUpChip } from '../lib/lead-follow-up';

/**
 * "Follow up on [date]" control for the lead detail panel — the manual side of
 * smart follow-up Step 1. Writes `followUpAt` (+ optional `followUpNote`)
 * straight onto the lead doc; the Leads list and Action items both read it.
 * Picking a date sets 9am local that day (a reasonable "call them" time).
 */
export function LeadFollowUpControl({
  user,
  leadId,
  followUpAt,
  followUpNote,
  booked,
}: {
  user: User | null;
  leadId: string;
  followUpAt?: Timestamp | null;
  followUpNote?: string;
  /** True when the lead has an upcoming appointment or is already a client —
   *  there's nothing to "follow up" on, so we suppress the date/chip. */
  booked?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(followUpNote ?? '');

  const ref = () => doc(db, 'agents', user!.uid, 'leads', leadId);

  const setDate = async (ymd: string) => {
    if (!user) return;
    setSaving(true);
    try {
      if (!ymd) {
        await updateDoc(ref(), { followUpAt: deleteField(), followUpNote: deleteField() });
        setNote('');
      } else {
        await updateDoc(ref(), { followUpAt: Timestamp.fromDate(new Date(`${ymd}T09:00:00`)) });
      }
    } catch (e) {
      console.error('follow-up save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!user) return;
    try {
      await updateDoc(ref(), { followUpNote: note.trim() || deleteField() });
    } catch (e) {
      console.error('follow-up note save failed:', e);
    }
  };

  const chip = followUpChip(followUpAt);

  // Already on the calendar (or already a client) → no follow-up to nag about.
  if (booked) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Follow up</span>
        <span className="text-xs text-[#9CA3AF]">— appointment booked, no follow-up needed</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Follow up</span>
      <input
        type="date"
        value={dateInputValue(followUpAt)}
        disabled={saving}
        onChange={(e) => void setDate(e.target.value)}
        className="px-2 py-1 text-sm border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
      />
      {followUpAt ? (
        <>
          {chip && (
            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${chip.classes}`}>
              {chip.label}
            </span>
          )}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void saveNote()}
            placeholder="why / what to say"
            className="flex-1 min-w-[8rem] px-2 py-1 text-sm border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
          />
          <button type="button" onClick={() => void setDate('')} className="text-xs text-[#A0382A] hover:underline">
            clear
          </button>
        </>
      ) : (
        <span className="text-xs text-[#9CA3AF]">— none set</span>
      )}
    </div>
  );
}

function dateInputValue(ts?: Timestamp | null): string {
  if (!ts) return '';
  try {
    const d = ts.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}
