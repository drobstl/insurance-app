'use client';

import { CHALLENGE_COLORS as C } from '../lib/challenge-theme';
import type { SessionOutcomeCounts } from '../lib/challenges';
import StreakFlame from './StreakFlame';
import { Reveal } from './Reveal';

/**
 * Power Hour recap — a Dials → Contacts → Booked funnel that fills the
 * card when a dialing block ends. The funnel reads the drop-off top to
 * bottom; the two rates (reached, book) are what an agent coaches on.
 *
 * "Contacts" = dials that reached a live human (booked + callback +
 * not-interested + do-not-call). No-answer / voicemail / wrong-number
 * drop out. Callbacks are ALSO shown below as a "chase these" callout —
 * they're a subset of contacts, not a terminal funnel stage.
 *
 * Color grammar (locked with Daniel Jul 1): Dials = neutral slate (raw
 * volume recedes), Contacts = brand teal (progress), Booked = gold
 * (money). A scoreless block never headlines a red zero. Enters via
 * <Reveal> and is all static content, so nothing can stall mid-animation.
 */

export interface SessionRecapData {
  /** Total dials logged during the session window. */
  dials: number;
  /** Per-outcome breakdown of those dials. */
  byOutcome: SessionOutcomeCounts;
  /** Active dialing minutes (excludes paused spans). */
  elapsedMin: number;
  /** Dials/hour, or null when the block was too short to be meaningful. */
  paceHr: number | null;
  /** Whether today has already beaten yesterday's dials. */
  dailyWon: boolean;
  /** Dials still needed today to win the daily challenge. */
  dailyToGo: number;
  /** Yesterday's (last active day's) dial count. */
  prevDay: number;
  /** Current hot-streak length. */
  streak: number;
}

function FunnelRow({
  label,
  count,
  pct,
  barColor,
  countColor,
  note,
  noteColor,
}: {
  label: string;
  count: number;
  pct: number;
  barColor: string;
  countColor: string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] flex-none" style={{ width: 70, color: C.onDarkMuted }}>
        {label}
      </span>
      <div className="flex-1 overflow-hidden" style={{ height: 24, background: C.ringTrackDark, borderRadius: 7 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 7 }} />
      </div>
      <span className="text-[17px] font-extrabold flex-none text-right" style={{ width: 30, color: countColor }}>
        {count}
      </span>
      <span className="text-[12px] flex-none" style={{ width: 94, color: noteColor ?? C.onDarkMuted }}>
        {note ?? ''}
      </span>
    </div>
  );
}

export default function ChallengeRecap({
  data,
  onDone,
}: {
  data: SessionRecapData;
  onDone: () => void;
}) {
  const b = data.byOutcome;
  const dials = data.dials;
  const booked = b.booked ?? 0;
  const callbacks = b.callback_requested ?? 0;
  // Reached a live human — callback / not-interested / do-not-call all
  // count as contacts alongside booked.
  const contacts = booked + callbacks + (b.not_interested ?? 0) + (b.do_not_call ?? 0);

  const reachedPct = dials > 0 ? Math.round((contacts / dials) * 100) : 0;
  const bookPct = contacts > 0 ? Math.round((booked / contacts) * 100) : null;
  // Bars are proportional to dials; give any non-zero stage a visible sliver.
  const barPct = (n: number) => (dials > 0 && n > 0 ? Math.max(6, (n / dials) * 100) : 0);

  const beatNote = data.dailyWon
    ? `🔥 Beat yesterday's ${data.prevDay}`
    : data.prevDay > 0
      ? `${data.dailyToGo} more today to beat yesterday`
      : `${data.dailyToGo} to go today`;

  return (
    <Reveal variant="rise">
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: C.stage, border: `2px solid ${C.gold}`, borderRightWidth: 5, borderBottomWidth: 5 }}
      >
        {/* header */}
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <span className="text-[11px] font-bold tracking-wide" style={{ color: C.gold }}>
            POWER HOUR · DONE
          </span>
          <span className="text-[12px]" style={{ color: C.onDarkMuted }}>
            {dials} dials · {data.elapsedMin} min{data.paceHr != null ? ` · ≈ ${data.paceHr}/hr` : ''}
          </span>
        </div>

        {/* funnel */}
        <div className="flex flex-col gap-2.5">
          <FunnelRow label="Dials" count={dials} pct={100} barColor={C.funnelDials} countColor={C.onDark} />
          <FunnelRow
            label="Contacts"
            count={contacts}
            pct={barPct(contacts)}
            barColor={C.progressBright}
            countColor={C.progressBright}
            note={`${reachedPct}% reached`}
          />
          <FunnelRow
            label="Booked"
            count={booked}
            pct={barPct(booked)}
            barColor={C.gold}
            countColor={booked > 0 ? C.gold : C.onDarkMuted}
            note={bookPct != null ? `${bookPct}% of contacts` : 'next block'}
            noteColor={booked > 0 ? C.gold : C.onDarkMuted}
          />
        </div>

        {/* beat-yesterday */}
        <p className="text-[13px] mt-3" style={{ color: data.dailyWon ? C.progressBright : C.onDarkMuted }}>
          {beatNote}
        </p>

        {/* footer: callbacks + streak + done */}
        <div
          className="flex items-center justify-between gap-3 mt-3 pt-3"
          style={{ borderTop: `1px solid ${C.ringTrackDark}` }}
        >
          <span className="text-[13px]" style={{ color: callbacks > 0 ? C.onDark : C.onDarkMuted }}>
            {callbacks > 0 ? (
              <>
                <span style={{ color: C.labelMint }}>↩</span> {callbacks} callback{callbacks === 1 ? '' : 's'} to chase
              </>
            ) : (
              'No callbacks this block'
            )}
          </span>
          <span className="flex items-center gap-3">
            <StreakFlame count={data.streak} variant="dark" />
            <button onClick={onDone} className="text-[12px] font-bold" style={{ color: C.progressBright }}>
              Done
            </button>
          </span>
        </div>
      </div>
    </Reveal>
  );
}
