'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import SendConfirmationDrawer from './SendConfirmationDrawer';

/**
 * Upcoming Appointments surface (Chunk 4f MVP).
 *
 * Lives at the top of `/dashboard/action-items` so the agent's daily
 * "what should I do right now" inbox includes appointment reminders
 * alongside the existing welcome / anniversary / retention / referral
 * lanes — without bloating the locked action-items type system.
 *
 * Live-queries appointments due in the next 24h with status=scheduled
 * and `sentReminderAt` null. Each row exposes a "Send reminder"
 * button that fires the SendConfirmationDrawer in `kind: 'reminder'`
 * mode, which composes the locked reminder template, attaches the
 * agent's business card + state-matched license, and stamps
 * `sentReminderAt` after the share intent fires.
 *
 * Rows that have already had their reminder sent disappear from the
 * card automatically (the snapshot listener picks up the new
 * sentReminderAt and re-filters).
 *
 * Future (4f-extension): cron + push to app-downloaders + per-agent
 * reminder timing config layer on top of this same surface.
 */

const REMINDER_WINDOW_HOURS = 24;  // future: pull from agent.reminderHoursBeforeAppt

interface Appointment {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadState?: string | null;
  scheduledAt: Timestamp;
  scheduledAtTimeZone?: string | null;
  meetingUrl?: string | null;
  durationMinutes?: number;
  notes?: string;
  status: string;
  sentConfirmationAt?: Timestamp | null;
  sentReminderAt?: Timestamp | null;
}

interface LicenseEntry {
  number: string;
  expiresOn: string | null;
  pdfStoragePath: string;
  uploadedAt: string;
}

interface Props {
  user: User | null;
  agentName: string;
  agentBusinessCardBase64?: string;
  licenses: Record<string, LicenseEntry>;
}

function formatRelative(d: Date): string {
  const ms = d.getTime() - Date.now();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 0) {
    const past = Math.abs(minutes);
    if (past < 60) return `${past}m ago`;
    return `${Math.round(past / 60)}h ago`;
  }
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export default function UpcomingAppointmentsCard({
  user,
  agentName,
  agentBusinessCardBase64,
  licenses,
}: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<Appointment | null>(null);
  // attachmentsSent is fetched on demand when the agent taps "Send
  // reminder" — the upcoming-appointments query itself doesn't read
  // lead docs (would be N+1 reads on every snapshot).
  const [reminderAttachmentsSent, setReminderAttachmentsSent] = useState<{
    businessCardAt?: string;
    licensesByState?: Record<string, string>;
  } | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    // Query: status=scheduled, ordered by scheduledAt ASC. We
    // post-filter for sentReminderAt and the time window in JS to
    // avoid needing additional composite indexes.
    const q = query(
      collection(db, 'agents', user.uid, 'appointments'),
      where('status', '==', 'scheduled'),
      orderBy('scheduledAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAppointments(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) })),
      );
      setLoaded(true);
    }, (err) => {
      console.warn('upcoming appointments snapshot error:', err);
      setLoaded(true);
    });
    return () => unsub();
  }, [user]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    const windowEnd = now + REMINDER_WINDOW_HOURS * 60 * 60 * 1000;
    return appointments.filter((a) => {
      if (a.sentReminderAt) return false;
      const at = a.scheduledAt?.toDate().getTime();
      if (!at) return false;
      // Include past-due-but-still-unreminded appointments up to 1h
      // past start time (agent may want to ping a no-show).
      return at >= now - 60 * 60 * 1000 && at <= windowEnd;
    });
  }, [appointments]);

  if (!loaded) return null;
  if (upcoming.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-[#000000]">Upcoming appointments</h2>
          <p className="text-xs text-[#707070] mt-0.5">
            Send a quick reminder ~1 hour before. Same template + business card + license as your booking confirmation.
          </p>
        </div>
        <span className="px-2 py-1 text-xs font-bold uppercase tracking-wider bg-[#daf3f0] text-[#005851] rounded">
          {upcoming.length}
        </span>
      </div>

      <ul className="space-y-2">
        {upcoming.map((appt) => {
          const when = appt.scheduledAt.toDate();
          const isPast = when.getTime() < Date.now();
          return (
            <li
              key={appt.id}
              className={`flex items-center gap-3 p-3 rounded-[5px] border ${
                isPast
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-[#45bcaa]/40 bg-[#daf3f0]/20'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#000000]">
                  {appt.leadName || 'Unnamed lead'}
                </div>
                <div className="text-xs text-[#707070] mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>
                    {when.toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className={isPast ? 'text-amber-700 font-semibold' : 'text-[#005851] font-semibold'}>
                    · {formatRelative(when)}
                  </span>
                  {appt.sentConfirmationAt && (
                    <span className="text-[10px] text-[#005851]">✓ Confirmed</span>
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  setReminderTarget(appt);
                  setReminderAttachmentsSent(undefined);
                  // Fetch lead.attachmentsSent so the drawer dedupes
                  // attachments. Best-effort — drawer falls back to
                  // "send everything" if this errors.
                  if (user) {
                    try {
                      const leadSnap = await getDoc(doc(db, 'agents', user.uid, 'leads', appt.leadId));
                      if (leadSnap.exists()) {
                        setReminderAttachmentsSent(
                          (leadSnap.data() as { attachmentsSent?: { businessCardAt?: string; licensesByState?: Record<string, string> } })
                            .attachmentsSent || {},
                        );
                      }
                    } catch (err) {
                      console.warn('attachmentsSent fetch failed:', err);
                    }
                  }
                }}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
              >
                Send reminder
              </button>
            </li>
          );
        })}
      </ul>

      {/* Reminder drawer — re-uses the confirmation drawer with kind='reminder',
          which swaps both the template and the stamp endpoint. */}
      {reminderTarget && (
        <SendConfirmationDrawer
          user={user}
          appointmentId={reminderTarget.id}
          leadId={reminderTarget.leadId}
          leadName={reminderTarget.leadName}
          leadPhone={reminderTarget.leadPhone}
          leadState={reminderTarget.leadState}
          scheduledAt={reminderTarget.scheduledAt.toDate()}
          scheduledAtTimeZone={reminderTarget.scheduledAtTimeZone || null}
          meetingUrl={reminderTarget.meetingUrl || null}
          agentName={agentName}
          agentBusinessCardBase64={agentBusinessCardBase64}
          licenses={licenses}
          attachmentsSent={reminderAttachmentsSent}
          kind="reminder"
          onSent={() => { setReminderTarget(null); setReminderAttachmentsSent(undefined); }}
          onCancel={() => { setReminderTarget(null); setReminderAttachmentsSent(undefined); }}
        />
      )}
    </div>
  );
}
