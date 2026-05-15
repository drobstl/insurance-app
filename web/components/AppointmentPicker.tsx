'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';

/**
 * Appointment picker — modal-style overlay invoked when the agent
 * picks "Booked" as the dial outcome (Chunk 4c).
 *
 * Captures: scheduled date + time + duration + optional notes.
 * Submits via POST /api/leads/[leadId]/appointments which atomically
 * creates the appointment doc AND logs the dial outcome as 'booked'.
 *
 * Defaults the date+time to the next half-hour boundary in local TZ —
 * agents are usually scheduling for "tomorrow 2pm" / "this afternoon"
 * type slots, so a near-future default minimizes typing on the most
 * common case.
 */

interface Props {
  user: User | null;
  leadId: string;
  leadName: string;
  /**
   * Called after a successful save. The scheduledAt Date is included
   * so callers can pass it directly to the SendConfirmationDrawer
   * without round-tripping through Firestore.
   */
  onBooked: (appointmentId: string, scheduledAt: Date) => void;
  onCancel: () => void;
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hr' },
  { value: 90, label: '1.5 hr' },
];

/**
 * Build a near-future default — round UP to the next half-hour, then
 * add 1 hour so the agent isn't trying to schedule something for
 * "10 minutes from now."
 */
function nextHalfHour(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  const minutes = d.getMinutes();
  if (minutes < 30) d.setMinutes(30, 0, 0);
  else { d.setHours(d.getHours() + 1); d.setMinutes(0, 0, 0); }
  // Local-TZ ISO components for the date/time inputs.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

export default function AppointmentPicker({ user, leadId, leadName, onBooked, onCancel }: Props) {
  const defaults = useMemo(() => nextHalfHour(), []);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc to cancel — small but missing-it-feels-cheap.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    if (!date || !time) {
      setError('Pick a date and time');
      return;
    }
    // Compose ISO. The date/time come from the inputs in local TZ;
    // `new Date('YYYY-MM-DDTHH:MM')` parses as local. .toISOString()
    // converts to UTC for storage.
    const local = new Date(`${date}T${time}:00`);
    if (Number.isNaN(local.getTime())) {
      setError('Invalid date or time');
      return;
    }
    if (local.getTime() < Date.now() - 60_000) {
      setError('Appointment time is in the past');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/leads/${leadId}/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduledAt: local.toISOString(),
          durationMinutes: duration,
          notes: notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Failed to book (${res.status})`);
        return;
      }
      onBooked(data.appointmentId, local);
    } catch (err) {
      console.error('book appointment error:', err);
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }, [user, leadId, date, time, duration, notes, onBooked]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onCancel()}
      />
      <div className="relative w-full max-w-md bg-white rounded-xl border-2 border-[#1A1A1A] border-r-[5px] border-b-[5px] shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-[#ececec]">
          <div>
            <h3 className="text-xl font-bold text-[#000000]">Book appointment</h3>
            <p className="text-xs text-[#707070] mt-0.5">
              {leadName ? `with ${leadName}` : 'with this lead'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w-8 h-8 rounded-[5px] bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
                autoFocus
                className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#000000] mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm focus:outline-none focus:border-[#45bcaa]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">Duration</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  disabled={submitting}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                    duration === opt.value
                      ? 'bg-[#005851] text-white border-[#005851]'
                      : 'bg-white text-[#0D4D4D] border-[#d0d0d0] hover:bg-[#f8f8f8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#000000] mb-1">
              Notes <span className="text-[#9CA3AF] font-normal">(optional — what to remember for the call)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Spouse name, mortgage size, expressed concerns…"
              className="w-full px-3 py-2.5 bg-white border border-[#d0d0d0] rounded-[5px] text-sm leading-relaxed focus:outline-none focus:border-[#45bcaa]"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-[#ececec] bg-[#fafafa]">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 max-w-[180px] py-2.5 px-4 text-sm font-semibold text-[#0D4D4D] bg-white rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] hover:bg-[#f8f8f8] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-lg border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors disabled:opacity-50"
          >
            {submitting ? 'Booking…' : 'Book it'}
          </button>
        </div>
      </div>
    </div>
  );
}
