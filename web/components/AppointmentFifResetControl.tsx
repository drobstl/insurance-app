'use client';

import { useEffect, useState } from 'react';
import FifResetCapture, { type FifResetValue, type RememberedSme } from './FifResetCapture';

/**
 * Per-appointment FIF reset control for the lead detail panel's past-
 * appointment marker. Unlike the day-after card (which submits the reset
 * together with the outcome button), here the appointment already has an
 * outcome — including the sold/`completed` case that has no outcome button
 * — so the reset is saved on its own with an explicit Save action that
 * only appears once something changed. Local edit state is seeded from the
 * appointment and re-syncs when the underlying Firestore doc changes.
 */
export default function AppointmentFifResetControl({
  initial,
  rememberedSmes,
  onSave,
}: {
  initial: FifResetValue;
  rememberedSmes: RememberedSme[];
  onSave: (value: FifResetValue) => Promise<void>;
}) {
  const { booked: initBooked, smeName: initSmeName, calendarUrl: initCalendarUrl } = initial;
  const [value, setValue] = useState<FifResetValue>(initial);
  const [baseline, setBaseline] = useState<FifResetValue>(initial);
  const [saving, setSaving] = useState(false);

  // Re-seed when the appointment's saved reset changes underneath us
  // (Firestore snapshot after a save, or a recycled row for another appt).
  // Keyed on the primitive fields, NOT the `initial` object — the parent
  // rebuilds that literal every render, so depending on it would wipe
  // in-progress edits on each re-render.
  useEffect(() => {
    const next: FifResetValue = {
      booked: initBooked,
      smeName: initSmeName,
      calendarUrl: initCalendarUrl,
    };
    setValue(next);
    setBaseline(next);
  }, [initBooked, initSmeName, initCalendarUrl]);

  const dirty =
    value.booked !== baseline.booked ||
    value.smeName.trim() !== baseline.smeName.trim() ||
    value.calendarUrl.trim() !== baseline.calendarUrl.trim();

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value);
      setBaseline(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full text-left">
      <FifResetCapture
        value={value}
        onChange={setValue}
        rememberedSmes={rememberedSmes}
        disabled={saving}
      />
      {dirty && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-2 rounded-md border border-[#0B7A4B] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0B7A4B] hover:bg-[#E7F7EF] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save FIF reset'}
        </button>
      )}
    </div>
  );
}
