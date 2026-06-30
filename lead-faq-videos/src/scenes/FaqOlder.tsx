import React from 'react';
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, SPRING } from '../theme/tokens';
import { MONTSERRAT } from '../theme/fonts';
import { KineticText } from '../components/KineticText';
import { Wordmark } from '../components/Wordmark';

/**
 * Lead-home FAQ default — over-40 companion: "Won't this cost too much, and
 * would I qualify?" Illustrated motion-graphics in the AFL palette, paced
 * ~49s for Daniel's VO (resync beats to the recording before final render).
 */

const BG = COLORS.nearBlack;

const Glow: React.FC = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 42%, rgba(13,77,77,0.75), transparent 62%)' }} />
);

const Beat: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame();
  const op = Math.min(
    interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(f, [dur - 14, dur - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  const rise = interpolate(f, [0, 16], [22, 0], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: op, transform: `translateY(${rise}px)` }}>{children}</AbsoluteFill>;
};

const TextBlock: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: 'absolute', top, left: 0, width: '100%', padding: '0 90px', textAlign: 'center' }}>{children}</div>
);

const Art: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: 'absolute', top, left: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>{children}</div>
);

const WorryChip: React.FC<{ label: string; delay: number; left: number; top: number }> = ({ label, delay, left, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: SPRING.pop });
  return (
    <div style={{
      position: 'absolute', left, top, opacity: s,
      transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)`,
      border: `2px solid rgba(244,132,95,0.6)`, background: 'rgba(244,132,95,0.08)',
      color: COLORS.coral, fontFamily: MONTSERRAT, fontWeight: 700, fontSize: 36,
      padding: '14px 30px', borderRadius: 46, whiteSpace: 'nowrap',
    }}>{label}</div>
  );
};

// Cost: a tall "what people expect" bar, then a much shorter "actual" bar
// pops in beside it with a downward arrow — "it's less than you think".
const CostBars: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tall = interpolate(frame, [10, 40], [0, 320], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shortS = spring({ frame: frame - 55, fps, config: SPRING.gentle });
  const shortH = interpolate(shortS, [0, 1], [0, 120]);
  const arrow = spring({ frame: frame - 70, fps, config: SPRING.pop });
  return (
    <svg width={620} height={460} viewBox="0 0 620 460" fontFamily={MONTSERRAT}>
      <line x1={60} y1={380} x2={560} y2={380} stroke={COLORS.coldLine} strokeWidth={4} strokeLinecap="round" />
      {/* expectation bar */}
      <rect x={130} y={380 - tall} width={130} height={tall} rx={10} fill={COLORS.coral} />
      <text x={195} y={420} fill={COLORS.muted} fontSize={28} fontWeight={700} textAnchor="middle">What people</text>
      <text x={195} y={452} fill={COLORS.muted} fontSize={28} fontWeight={700} textAnchor="middle">expect</text>
      {/* actual bar */}
      <rect x={360} y={380 - shortH} width={130} height={shortH} rx={10} fill={COLORS.mint} opacity={shortS} />
      <text x={425} y={420} fill={COLORS.mint} fontSize={28} fontWeight={800} textAnchor="middle" opacity={shortS}>Actual</text>
      {/* down arrow between */}
      <g opacity={arrow} transform="translate(310 150)">
        <line x1={0} y1={-10} x2={0} y2={interpolate(arrow, [0, 1], [-10, 70])} stroke={COLORS.gold} strokeWidth={10} strokeLinecap="round" />
        <path d="M-22 48 L0 74 L22 48" fill="none" stroke={COLORS.gold} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={interpolate(arrow, [0.6, 1], [0, 1], { extrapolateLeft: 'clamp' })} />
      </g>
    </svg>
  );
};

// Approval: a badge flips from "Declined" to "Approved ✓".
const ApprovedFlip: React.FC = () => {
  const frame = useCurrentFrame();
  const flip = interpolate(frame, [40, 70], [0, 180], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const showApproved = flip > 90;
  const rad = (flip * Math.PI) / 180;
  const scaleX = Math.abs(Math.cos(rad));
  return (
    <svg width={560} height={300} viewBox="-280 -150 560 300" fontFamily={MONTSERRAT}>
      <g transform={`scale(${scaleX} 1)`}>
        {!showApproved ? (
          <g>
            <rect x={-230} y={-70} width={460} height={140} rx={20} fill="#22332f" stroke={COLORS.coldLine} strokeWidth={4} />
            <text x={0} y={16} fill={COLORS.coldText} fontSize={48} fontWeight={800} textAnchor="middle">Declined?</text>
          </g>
        ) : (
          <g>
            <rect x={-230} y={-70} width={460} height={140} rx={20} fill="rgba(61,214,195,0.12)" stroke={COLORS.mint} strokeWidth={5} />
            <path d="M-162 4 L-135 32 L-88 -24" fill="none" stroke={COLORS.mint} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
            <text x={42} y={16} fill={COLORS.mint} fontSize={46} fontWeight={900} textAnchor="middle">Approved</text>
          </g>
        )}
      </g>
    </svg>
  );
};

// No-exam: a medical clipboard with a big "skip" check and "No exam needed".
const NoExam: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 8, fps, config: SPRING.gentle });
  const stamp = spring({ frame: frame - 40, fps, config: SPRING.pop });
  return (
    <svg width={420} height={460} viewBox="-210 -230 420 460" fontFamily={MONTSERRAT}>
      <g opacity={s} transform={`scale(${interpolate(s, [0, 1], [0.9, 1])})`}>
        <rect x={-120} y={-180} width={240} height={340} rx={18} fill="#16302c" stroke="#27514a" strokeWidth={4} />
        <rect x={-46} y={-202} width={92} height={40} rx={10} fill={COLORS.coldLine} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={-86} y={-120 + i * 46} width={172} height={12} rx={6} fill="#2c4a44" />
        ))}
      </g>
      {/* crossed-out stethoscope vibe → a circle-slash "no exam" stamp */}
      <g opacity={stamp} transform={`translate(40 70) rotate(-12) scale(${interpolate(stamp, [0, 1], [0.6, 1])})`}>
        <circle r={86} fill="none" stroke={COLORS.gold} strokeWidth={10} />
        <line x1={-60} y1={60} x2={60} y2={-60} stroke={COLORS.gold} strokeWidth={10} strokeLinecap="round" />
        <text x={0} y={-100} fill={COLORS.gold} fontSize={34} fontWeight={800} textAnchor="middle">No exam</text>
      </g>
    </svg>
  );
};

const Chip: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: SPRING.gentle });
  return (
    <div style={{
      opacity: s, transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)`,
      border: `2px solid rgba(61,214,195,0.5)`, background: 'rgba(61,214,195,0.07)',
      color: COLORS.mint, fontFamily: MONTSERRAT, fontWeight: 700, fontSize: 38,
      padding: '14px 30px', borderRadius: 46, whiteSpace: 'nowrap',
    }}>{label}</div>
  );
};

const EndCard: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 13, stiffness: 150, mass: 0.9 } });
  const underline = interpolate(f, [16, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const op = interpolate(f, [dur - 12, dur - 1], [1, 1], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: op }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.88, 1])})`, opacity: s, textAlign: 'center' }}>
        <Wordmark size={92} />
        <div style={{ height: 8, width: 300 * underline, background: COLORS.gold, borderRadius: 8, margin: '26px auto 0' }} />
      </div>
    </AbsoluteFill>
  );
};

export const FaqOlder: React.FC = () => {
  // Beats snapped to Daniel's recorded word timings (Whisper word-level,
  // shifted to the trimmed audio). ~52.7s incl. held end card.
  const B = {
    hook: { from: 0, len: 215 },
    truth: { from: 215, len: 69 },
    cost: { from: 284, len: 140 },
    budget: { from: 424, len: 245 },
    approval: { from: 669, len: 256 },
    noexam: { from: 925, len: 158 },
    close: { from: 1083, len: 407 },
    end: { from: 1490, len: 90 },
  };

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: MONTSERRAT }}>
      <Glow />

      {/* 1 — hook: the two blockers */}
      <Sequence from={B.hook.from} durationInFrames={B.hook.len}>
        <Beat dur={B.hook.len}>
          <TextBlock top={250}>
            <div style={{ color: COLORS.muted, fontSize: 34, fontWeight: 600 }}>Two things stop most people before they start:</div>
          </TextBlock>
          <WorryChip label="“It’s too expensive.”" delay={70} left={170} top={620} />
          <WorryChip label="“I’d never get approved.”" delay={130} left={470} top={840} />
        </Beat>
      </Sequence>

      {/* 2 — truth */}
      <Sequence from={B.truth.from} durationInFrames={B.truth.len}>
        <Beat dur={B.truth.len}>
          <TextBlock top={880}><KineticText text="Here’s the honest truth." fontSize={84} weight={900} color={COLORS.mint} style={{ margin: '0 auto' }} /></TextBlock>
        </Beat>
      </Sequence>

      {/* 3 — cost is overestimated */}
      <Sequence from={B.cost.from} durationInFrames={B.cost.len}>
        <Beat dur={B.cost.len}>
          <TextBlock top={250}>
            <KineticText text="Most people guess this costs far more than it actually does." fontSize={62} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
          </TextBlock>
          <Art top={760}><CostBars /></Art>
        </Beat>
      </Sequence>

      {/* 4 — lower than you expect, built to budget */}
      <Sequence from={B.budget.from} durationInFrames={B.budget.len}>
        <Beat dur={B.budget.len}>
          <TextBlock top={360}>
            <KineticText text="The real number is almost always lower than you expect —" fontSize={58} weight={800} color="#fff" maxWidth={920} lineHeight={1.16} style={{ margin: '0 auto' }} />
            <KineticText text="with options built around your budget." appearAt={40} fontSize={58} weight={800} color={COLORS.mint} maxWidth={920} lineHeight={1.16} style={{ margin: '20px auto 0' }} />
          </TextBlock>
        </Beat>
      </Sequence>

      {/* 5 — approval */}
      <Sequence from={B.approval.from} durationInFrames={B.approval.len}>
        <Beat dur={B.approval.len}>
          <TextBlock top={230}>
            <KineticText text="More people qualify than you’d think." fontSize={64} weight={800} color="#fff" maxWidth={900} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <div style={{ color: COLORS.muted, fontSize: 40, fontWeight: 600, marginTop: 18 }}>Even with health conditions. Even if you’ve been turned down before.</div>
          </TextBlock>
          <Art top={820}><ApprovedFlip /></Art>
        </Beat>
      </Sequence>

      {/* 6 — no exam */}
      <Sequence from={B.noexam.from} durationInFrames={B.noexam.len}>
        <Beat dur={B.noexam.len}>
          <TextBlock top={250}>
            <KineticText text="Some options skip the medical exam completely." fontSize={60} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
          </TextBlock>
          <Art top={760}><NoExam /></Art>
        </Beat>
      </Sequence>

      {/* 7 — close */}
      <Sequence from={B.close.from} durationInFrames={B.close.len}>
        <Beat dur={B.close.len}>
          <TextBlock top={250}>
            <KineticText text="You won’t know your number until you see it." fontSize={62} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
          </TextBlock>
          <Art top={620}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'center' }}>
              <Chip label="Real numbers" delay={197} />
              <Chip label="No pressure" delay={298} />
              <Chip label="No obligation" delay={374} />
            </div>
          </Art>
        </Beat>
      </Sequence>

      {/* 8 — wordmark */}
      <Sequence from={B.end.from} durationInFrames={B.end.len}>
        <EndCard dur={B.end.len} />
      </Sequence>
    </AbsoluteFill>
  );
};
