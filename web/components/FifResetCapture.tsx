'use client';

import { useId } from 'react';

/**
 * FIF reset capture — a small controlled add-on used wherever an
 * appointment outcome is recorded (the day-after outcome card, the lead
 * detail panel). A "FIF reset" is the advanced-market second appointment
 * the agent books off a sit (debt / tax-&-wealth / retirement) with a
 * Subject Matter Expert (SME) in their upline. It is ORTHOGONAL to the
 * sale outcome — it can stack on sold / no-sale / thinking — so this is a
 * toggle that sits alongside the outcome buttons, not one of them.
 *
 * The reset itself is booked on the SME's EXTERNAL calendar; this just
 * captures that it happened + who with + (optionally) their calendar
 * link. The name field is a combobox over the agent's remembered SMEs:
 * pick a recent one (and we auto-fill their saved link) or type a new one.
 */

export interface FifResetValue {
  booked: boolean;
  smeName: string;
  calendarUrl: string;
}

export interface RememberedSme {
  name: string;
  calendarUrl?: string;
}

export const EMPTY_FIF_RESET: FifResetValue = {
  booked: false,
  smeName: '',
  calendarUrl: '',
};

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

interface FifResetCaptureProps {
  value: FifResetValue;
  onChange: (next: FifResetValue) => void;
  /** SMEs the agent has used before — powers the name datalist + URL prefill. */
  rememberedSmes?: RememberedSme[];
  disabled?: boolean;
  className?: string;
}

export default function FifResetCapture({
  value,
  onChange,
  rememberedSmes = [],
  disabled = false,
  className = '',
}: FifResetCaptureProps) {
  const listId = useId();

  const toggle = (booked: boolean) => {
    // Unchecking clears the captured fields so we never carry a stale SME
    // forward with booked=false.
    onChange(booked ? { ...value, booked: true } : { ...EMPTY_FIF_RESET });
  };

  const setName = (smeName: string) => {
    // If the typed name matches a remembered SME and the link field is
    // still empty, pull their saved calendar link forward automatically.
    const match = rememberedSmes.find(
      (s) => s.name.trim().toLowerCase() === smeName.trim().toLowerCase(),
    );
    const calendarUrl =
      !value.calendarUrl && match?.calendarUrl ? match.calendarUrl : value.calendarUrl;
    onChange({ ...value, smeName, calendarUrl });
  };

  const trimmedUrl = value.calendarUrl.trim();
  const trimmedName = value.smeName.trim();
  const openLabel = trimmedName ? `Open ${trimmedName}'s calendar` : 'Open calendar';

  return (
    <div className={className}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.booked}
          onChange={(e) => toggle(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 shrink-0 rounded border-[#1A1A1A] accent-[#0B7A4B] disabled:opacity-50"
        />
        <span className="text-xs font-semibold text-[#0D4D4D]">Also booked a FIF reset</span>
        <span className="hidden sm:inline text-[10px] font-normal text-[#5f5f5f]">
          advanced-market follow-up with an SME
        </span>
      </label>

      {value.booked && (
        <div className="mt-2 pl-6 flex flex-col gap-2">
          <input
            type="text"
            value={value.smeName}
            onChange={(e) => setName(e.target.value)}
            list={rememberedSmes.length > 0 ? listId : undefined}
            disabled={disabled}
            placeholder="SME name (who it's with)"
            autoComplete="off"
            className="w-full rounded-[5px] border border-[#d0d0d0] px-2.5 py-1.5 text-xs text-[#1A1A1A] placeholder:text-[#9a9a9a] focus:border-[#0B7A4B] focus:outline-none disabled:opacity-50"
          />
          {rememberedSmes.length > 0 && (
            <datalist id={listId}>
              {rememberedSmes.map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          )}
          <input
            type="url"
            inputMode="url"
            value={value.calendarUrl}
            onChange={(e) => onChange({ ...value, calendarUrl: e.target.value })}
            disabled={disabled}
            placeholder="SME's calendar link (optional)"
            autoComplete="off"
            className="w-full rounded-[5px] border border-[#d0d0d0] px-2.5 py-1.5 text-xs text-[#1A1A1A] placeholder:text-[#9a9a9a] focus:border-[#0B7A4B] focus:outline-none disabled:opacity-50"
          />
          {isHttpUrl(trimmedUrl) && (
            <a
              href={trimmedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 self-start text-[11px] font-semibold text-[#0B7A4B] hover:underline"
            >
              {openLabel} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
