'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface LeadNoteEntry {
  id: string;
  text: string;
  at: Timestamp;
}

/**
 * Timestamped notes log — sits beneath the free-form notes box (Option 2).
 * Each entry is auto-stamped with the date/time it was added and appended to
 * the lead's `notesEntries[]`; older entries stay frozen, a running history
 * newest-first. The free `notes` box above stays the living scratchpad.
 *
 * Append writes the full next array (not arrayUnion — Firestore rejects a
 * serverTimestamp() inside an array element, and a client `Timestamp.now()`
 * stamp is fine here). Gated on a loaded lead via the `entries` prop coming
 * from the live snapshot, so we never clobber unseen entries.
 */
export function LeadNotesLog({
  user,
  leadId,
  entries,
}: {
  user: User | null;
  leadId: string;
  entries?: LeadNoteEntry[];
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const sorted = [...(entries ?? [])].sort(
    (a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0),
  );

  const addEntry = async () => {
    const text = draft.trim();
    if (!text || !user) return;
    setSaving(true);
    try {
      let id: string;
      try {
        id = crypto.randomUUID();
      } catch {
        id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      }
      const entry: LeadNoteEntry = { id, text, at: Timestamp.now() };
      await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
        notesEntries: [...(entries ?? []), entry],
      });
      setDraft('');
    } catch (err) {
      console.error('add note entry failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (t?: Timestamp) => {
    try {
      return (
        t?.toDate().toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }) ?? ''
      );
    } catch {
      return '';
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addEntry();
            }
          }}
          placeholder="Add a dated note — e.g. “Called, no answer”"
          className="flex-1 min-w-0 px-3 py-2 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
        />
        <button
          type="button"
          onClick={() => void addEntry()}
          disabled={!draft.trim() || saving}
          className="px-3 py-2 text-sm font-semibold rounded-[5px] bg-[#005851] text-white disabled:opacity-40 shrink-0"
        >
          Add
        </button>
      </div>
      {sorted.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {sorted.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-sm">
              <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap pt-0.5 w-28 shrink-0">
                {fmt(e.at)}
              </span>
              <span className="text-[#374151] whitespace-pre-wrap break-words">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
