'use client';

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteField,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { followUpChip } from '../lib/lead-follow-up';

interface DueLead {
  id: string;
  name?: string;
  phone?: string;
  followUpAt?: Timestamp | null;
  followUpNote?: string;
  /** Present when the SYSTEM auto-set this follow-up (going-cold, assessment,
   *  …). Drives the "Suggested" grouping, separate from the agent's own. */
  autoFollowUpReason?: string;
}

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * "Follow-ups due" section for the Action items page — the second surface of
 * smart follow-up Step 1, pinned above the client-action lanes (same slot as
 * UpcomingAppointmentsCard). Subscribes to leads whose `followUpAt` is due
 * now; Done/Snooze write `followUpAt` back to the SAME lead doc the Leads
 * list reads, so the two surfaces stay in lockstep. Renders nothing when no
 * follow-up is due, so it never adds clutter.
 */
export function LeadFollowUpsDue({ user, agentName }: { user: User | null; agentName: string }) {
  const router = useRouter();
  const [leads, setLeads] = useState<DueLead[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'agents', user.uid, 'leads'),
      where('followUpAt', '<=', Timestamp.now()),
      orderBy('followUpAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setLeads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DueLead, 'id'>) }))),
      (err) => console.error('[follow-ups-due] subscription failed', err),
    );
    return () => unsub();
  }, [user]);

  if (!user || leads.length === 0) return null;

  const leadRef = (leadId: string) => doc(db, 'agents', user.uid, 'leads', leadId);
  const markDone = (leadId: string) =>
    void updateDoc(leadRef(leadId), { followUpAt: deleteField(), followUpNote: deleteField() }).catch((e) =>
      console.error('follow-up done failed', e),
    );
  const snooze = (leadId: string) =>
    void updateDoc(leadRef(leadId), { followUpAt: Timestamp.fromMillis(Date.now() + SNOOZE_MS) }).catch((e) =>
      console.error('follow-up snooze failed', e),
    );

  const textHref = (lead: DueLead): string | null => {
    if (!lead.phone) return null;
    const first = (lead.name || '').split(' ')[0] || 'there';
    const body = `Hi ${first}, it's ${agentName || 'your agent'} — circling back on what we talked about. Is now a better time to connect?`;
    return `sms:${lead.phone}?&body=${encodeURIComponent(body)}`;
  };

  const card = (lead: DueLead) => {
    const chip = followUpChip(lead.followUpAt);
    const sms = textHref(lead);
    return (
      <article key={lead.id} className="rounded-xl border-2 border-[#F0B100]/40 bg-[#FFFBEB] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#0D4D4D]">
              Follow up with{' '}
              <button
                type="button"
                onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                className="underline decoration-dotted underline-offset-2 hover:text-[#005851]"
              >
                {lead.name || 'this lead'}
              </button>
            </p>
            <p className="mt-0.5 text-[12px] text-[#5f5f5f]">
              {lead.phone || 'No phone on file'}
              {lead.followUpNote ? ` · ${lead.followUpNote}` : ''}
            </p>
          </div>
          {chip && (
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${chip.classes}`}>
              {chip.label}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="px-2.5 py-1 text-xs font-semibold rounded-[5px] bg-[#005851] text-white">
              Call
            </a>
          )}
          {sms && (
            <a href={sms} className="px-2.5 py-1 text-xs font-semibold rounded-[5px] border border-[#005851] text-[#005851]">
              Text
            </a>
          )}
          <button
            type="button"
            onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
            className="px-2.5 py-1 text-xs font-semibold rounded-[5px] border border-[#d0d0d0] text-[#5f5f5f] hover:border-[#45bcaa]"
          >
            Open
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => snooze(lead.id)}
            className="px-2.5 py-1 text-xs font-semibold rounded-[5px] text-[#707070] hover:text-[#92500D]"
          >
            Snooze 3d
          </button>
          <button
            type="button"
            onClick={() => markDone(lead.id)}
            className="px-2.5 py-1 text-xs font-semibold rounded-[5px] bg-[#0D4D4D] text-white"
          >
            Done
          </button>
        </div>
      </article>
    );
  };

  // Group: the agent's own follow-ups (manual + callback) stay prominent and
  // separate from system-suggested ones (going-cold, assessment), so machine
  // suggestions never bury the promises the agent made.
  const mine = leads.filter((l) => !l.autoFollowUpReason);
  const suggested = leads.filter((l) => l.autoFollowUpReason);

  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#92500D]">
        Follow-ups due
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold bg-[#F0B100] text-white">
          {leads.length}
        </span>
      </h2>

      {mine.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5f5f]">Your follow-ups</h3>
          <div className="space-y-2">{mine.map(card)}</div>
        </div>
      )}

      {suggested.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5f5f5f]">
            Suggested · worth a look
          </h3>
          <div className="space-y-2">{suggested.map(card)}</div>
        </div>
      )}
    </section>
  );
}
