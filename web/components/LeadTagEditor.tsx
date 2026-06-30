'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  type LeadTag,
  type LeadTagColor,
  LEAD_TAG_COLOR_ORDER,
  MAX_TAG_LABEL_LEN,
  resolveLeadTags,
  tagChipClasses,
  tagSwatchClass,
} from '../lib/lead-tag';

/**
 * Interactive lead-tag editor for the detail panel. Shows the lead's assigned
 * tags (each removable), plus a "+ Tag" toggle that opens an INLINE panel
 * (deliberately not a fixed/absolute overlay — the call-mode two-pane
 * slide-belt clips fixed overlays; see reference_call_mode_slidebelt_fixed_trap)
 * to assign existing tags, delete a definition, or create a new one.
 *
 * Tag DEFINITIONS (create/delete) go through DashboardContext (agent doc);
 * ASSIGNMENT writes `tagIds` straight onto the lead doc here. Assigned state
 * comes from the live lead snapshot via props, so no local optimistic copy.
 */
export function LeadTagEditor({
  user,
  leadId,
  assignedTagIds,
  tags,
  onCreateTag,
  onDeleteTag,
}: {
  user: User | null;
  leadId: string;
  assignedTagIds?: string[];
  tags: LeadTag[];
  onCreateTag: (input: { label: string; color: LeadTagColor }) => Promise<LeadTag | null>;
  onDeleteTag: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<LeadTagColor>('teal');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const assigned = new Set(assignedTagIds ?? []);
  const resolvedAssigned = resolveLeadTags(assignedTagIds, tags);

  const writeTagIds = async (nextIds: string[]) => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), { tagIds: nextIds });
    } catch (err) {
      console.error('tag assign failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleAssign = (tagId: string) => {
    const current = assignedTagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    void writeTagIds(next);
  };

  const handleCreate = async () => {
    if (!user) return;
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    try {
      const tag = await onCreateTag({ label, color: newColor });
      if (tag) {
        setNewLabel('');
        const current = assignedTagIds ?? [];
        if (!current.includes(tag.id)) {
          await updateDoc(doc(db, 'agents', user.uid, 'leads', leadId), {
            tagIds: [...current, tag.id],
          });
        }
      }
    } catch (err) {
      console.error('tag create failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDef = async (tagId: string) => {
    setConfirmDelete(null);
    await onDeleteTag(tagId);
    // No lead rewrite needed — resolveLeadTags drops the now-dangling id.
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Tags</span>
        {resolvedAssigned.map((t) => (
          <span
            key={t.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${tagChipClasses(t.color)}`}
          >
            {t.label}
            <button
              type="button"
              onClick={() => toggleAssign(t.id)}
              className="opacity-60 hover:opacity-100 leading-none"
              aria-label={`Remove ${t.label}`}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded border border-dashed border-[#d0d0d0] text-[#707070] hover:border-[#45bcaa] hover:text-[#005851]"
        >
          {open ? 'Done' : '+ Tag'}
        </button>
      </div>

      {open && (
        <div className="mt-2 p-3 rounded-[8px] border border-[#e5e5e5] bg-[#fafafa] space-y-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              {tags.map((t) => {
                const on = assigned.has(t.id);
                return (
                  <span key={t.id} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleAssign(t.id)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${tagChipClasses(t.color)} ${on ? 'ring-2 ring-[#005851]/40' : 'opacity-55 hover:opacity-100'}`}
                    >
                      {on && <span aria-hidden>✓</span>}
                      {t.label}
                    </button>
                    {confirmDelete === t.id ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteDef(t.id)}
                        className="ml-1 mr-2 text-[10px] font-semibold text-[#A0382A] hover:underline"
                      >
                        delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(t.id)}
                        className="ml-0.5 mr-2 text-[#c0c0c0] hover:text-[#A0382A] text-xs leading-none"
                        aria-label={`Delete tag ${t.label} for good`}
                        title="Delete this tag from your whole book"
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              maxLength={MAX_TAG_LABEL_LEN}
              placeholder="New tag…"
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-[#d0d0d0] rounded-[5px] focus:outline-none focus:border-[#45bcaa]"
            />
            <div className="flex items-center gap-1 shrink-0">
              {LEAD_TAG_COLOR_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-4 h-4 rounded-full ${tagSwatchClass(c)} ${newColor === c ? 'ring-2 ring-offset-1 ring-[#005851]' : ''}`}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!newLabel.trim() || saving}
              className="px-2.5 py-1 text-sm font-semibold rounded-[5px] bg-[#005851] text-white disabled:opacity-40 shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
