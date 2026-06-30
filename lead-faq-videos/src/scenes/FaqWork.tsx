import React from 'react';
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, SPRING } from '../theme/tokens';
import { MONTSERRAT } from '../theme/fonts';
import { KineticText } from '../components/KineticText';
import { Wordmark } from '../components/Wordmark';

/**
 * Lead-home FAQ default — universal "Don't I already have enough through
 * work?" Shown to every lead alongside the age-aware clip. Illustrated
 * motion-graphics, paced ~46s for Daniel's VO (resync beats to the recording).
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

// Yours-to-keep: a shield draws itself on, then a check lands inside.
const HeldShield: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [8, 74], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fill = interpolate(frame, [66, 102], [0, 0.18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const check = spring({ frame: frame - 84, fps, config: SPRING.pop });
  return (
    <svg width={380} height={480} viewBox="-190 -240 380 480">
      <path
        d="M0 -200 L150 -140 V0 Q150 150 0 230 Q-150 150 -150 0 V-140 Z"
        fill={`rgba(61,214,195,${fill})`}
        stroke={COLORS.mint}
        strokeWidth={12}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
      <g opacity={check} transform={`scale(${interpolate(check, [0, 1], [0.6, 1])})`}>
        <path d="M-58 6 L-16 50 L64 -54" fill="none" stroke={COLORS.mint} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
};

// Hook: a work ID badge on a lanyard, stamped "covered?" with a check.
const WorkBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: SPRING.gentle });
  const swing = Math.sin(frame / 18) * 3;
  return (
    <svg width={360} height={460} viewBox="-180 -40 360 460" fontFamily={MONTSERRAT}>
      <g transform={`rotate(${swing} 0 -40)`} opacity={s}>
        <line x1={-70} y1={-40} x2={0} y2={70} stroke={COLORS.coldLine} strokeWidth={8} />
        <line x1={70} y1={-40} x2={0} y2={70} stroke={COLORS.coldLine} strokeWidth={8} />
        <rect x={-110} y={70} width={220} height={290} rx={18} fill="#16302c" stroke="#2c4a44" strokeWidth={4} />
        <rect x={-18} y={64} width={36} height={20} rx={6} fill={COLORS.coldLine} />
        <circle cx={0} cy={150} r={42} fill={COLORS.teal} />
        <rect x={-72} y={214} width={144} height={16} rx={8} fill="#2c4a44" />
        <rect x={-52} y={246} width={104} height={14} rx={7} fill="#274039" />
        <g transform="translate(0 318)">
          <path d="M-26 0 L-8 20 L30 -22" fill="none" stroke={COLORS.mint} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          <text x={48} y={6} fill={COLORS.mint} fontSize={30} fontWeight={800} textAnchor="start">Covered</text>
        </g>
      </g>
    </svg>
  );
};

// Amount: short "work coverage" bar vs tall "what's needed", with the gap.
const GapBars: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cover = interpolate(frame, [10, 36], [0, 110], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const need = interpolate(frame, [40, 80], [0, 330], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const gapS = spring({ frame: frame - 84, fps, config: SPRING.gentle });
  const BASE = 400;
  return (
    <svg width={700} height={500} viewBox="0 0 700 500" fontFamily={MONTSERRAT}>
      <line x1={60} y1={BASE} x2={560} y2={BASE} stroke={COLORS.coldLine} strokeWidth={4} strokeLinecap="round" />
      {/* work coverage — small */}
      <rect x={120} y={BASE - cover} width={140} height={cover} rx={10} fill={COLORS.mint} />
      <text x={190} y={BASE + 40} fill={COLORS.mint} fontSize={26} fontWeight={800} textAnchor="middle">Work coverage</text>
      <text x={190} y={BASE + 70} fill={COLORS.muted} fontSize={24} fontWeight={600} textAnchor="middle">1–2× salary</text>
      {/* what's actually needed — tall outline */}
      <rect x={360} y={BASE - need} width={140} height={need} rx={10} fill="rgba(244,132,95,0.12)" stroke={COLORS.coral} strokeWidth={4} />
      <text x={430} y={BASE + 40} fill={COLORS.coral} fontSize={26} fontWeight={800} textAnchor="middle">What’s needed</text>
      <text x={430} y={BASE + 70} fill={COLORS.muted} fontSize={24} fontWeight={600} textAnchor="middle">home + years of income</text>
      {/* the gap bracket */}
      <g opacity={gapS}>
        <line x1={524} y1={BASE - 110} x2={524} y2={BASE - 330} stroke={COLORS.gold} strokeWidth={4} strokeDasharray="8 8" />
        <text x={540} y={BASE - 220} fill={COLORS.gold} fontSize={30} fontWeight={800} textAnchor="start">the gap</text>
      </g>
    </svg>
  );
};

// Portable: a figure walks out of the office; the coverage stays behind, greyed.
const WalkOut: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const walk = interpolate(frame, [30, 100], [0, 250], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fade = interpolate(frame, [60, 100], [1, 0.28], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labelS = spring({ frame: frame - 90, fps, config: SPRING.gentle });
  return (
    <svg width={760} height={460} viewBox="-380 -230 760 460" fontFamily={MONTSERRAT}>
      {/* office building */}
      <rect x={-330} y={-180} width={260} height={400} rx={12} fill="#1c3b35" stroke="#3f655b" strokeWidth={5} />
      {[-150, -90, -30].map((y) => [0, 1].map((c) => (
        <rect key={`${y}-${c}`} x={-300 + c * 80} y={y} width={56} height={48} rx={6} fill="#34564d" />
      )))}
      {/* doorway */}
      <rect x={-150} y={70} width={80} height={150} rx={6} fill="#0c2420" />
      {/* the coverage that stays behind (greyed shield on the building) */}
      <g opacity={fade} transform="translate(-200 -60)">
        <path d="M0 -54 L40 -36 V0 Q40 40 0 64 Q-40 40 -40 0 V-36 Z" fill="rgba(61,214,195,0.12)" stroke={COLORS.mint} strokeWidth={6} />
      </g>
      {/* the person walking out, empty-handed */}
      <g transform={`translate(${-90 + walk} 40)`}>
        <circle cx={0} cy={-70} r={28} fill={COLORS.paper} />
        <path d="M-42 70 Q-42 -16 0 -16 Q42 -16 42 70 Z" fill={COLORS.paper} />
      </g>
      <g opacity={labelS} transform="translate(-200 200)">
        <text x={0} y={0} fill={COLORS.muted} fontSize={30} fontWeight={700} textAnchor="middle">Stays with the job</text>
      </g>
    </svg>
  );
};

// Family: the benefit goes past a crossed-out bank, straight to the family.
const ToFamily: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flow = interpolate(frame, [20, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const crossS = spring({ frame: frame - 40, fps, config: SPRING.pop });
  const famS = spring({ frame: frame - 64, fps, config: SPRING.gentle });
  const taxS = spring({ frame: frame - 88, fps, config: SPRING.pop });
  const coinX = interpolate(flow, [0, 1], [-260, 210]);
  return (
    <svg width={760} height={420} viewBox="-380 -210 760 420" fontFamily={MONTSERRAT}>
      {/* policy / shield on the left */}
      <g transform="translate(-300 0)">
        <path d="M0 -70 L52 -46 V6 Q52 60 0 90 Q-52 60 -52 6 V-46 Z" fill="rgba(61,214,195,0.14)" stroke={COLORS.mint} strokeWidth={6} />
      </g>
      {/* bank in the middle, crossed out */}
      <g transform="translate(-40 -10)">
        <rect x={-60} y={-10} width={120} height={70} fill="#22332f" />
        <path d="M-70 -10 L0 -56 L70 -10 Z" fill="#2c4a44" />
        {[-40, -12, 16, 40].map((x) => <rect key={x} x={x} y={2} width={10} height={46} fill="#1b2b28" />)}
        <g opacity={crossS}>
          <line x1={-80} y1={70} x2={80} y2={-70} stroke={COLORS.coral} strokeWidth={10} strokeLinecap="round" />
        </g>
        <text x={0} y={104} fill={COLORS.coral} fontSize={26} fontWeight={800} textAnchor="middle" opacity={crossS}>not just the bank</text>
      </g>
      {/* family on the right */}
      <g opacity={famS} transform="translate(250 6)">
        <g transform="translate(-44 0)"><circle cx={0} cy={-44} r={22} fill={COLORS.paper} /><path d="M-34 56 Q-34 -8 0 -8 Q34 -8 34 56 Z" fill={COLORS.paper} /></g>
        <g transform="translate(10 14) scale(0.78)"><circle cx={0} cy={-44} r={22} fill={COLORS.paper} /><path d="M-34 56 Q-34 -8 0 -8 Q34 -8 34 56 Z" fill={COLORS.paper} /></g>
        <g transform="translate(52 26) scale(0.6)"><circle cx={0} cy={-44} r={22} fill={COLORS.paper} /><path d="M-34 56 Q-34 -8 0 -8 Q34 -8 34 56 Z" fill={COLORS.paper} /></g>
      </g>
      {/* the benefit travelling to the family */}
      {flow > 0.01 && flow < 0.99 && (
        <circle cx={coinX} cy={-90} r={20} fill={COLORS.gold} />
      )}
      {/* tax-free pill */}
      <g opacity={taxS} transform="translate(40 -150)">
        <rect x={-86} y={-26} width={172} height={52} rx={26} fill={COLORS.gold} />
        <text x={0} y={10} fill={COLORS.nearBlack} fontSize={30} fontWeight={800} textAnchor="middle">tax-free</text>
      </g>
    </svg>
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

export const FaqWork: React.FC = () => {
  // Beats snapped to Daniel's recorded word timings (Whisper word-level,
  // shifted to the trimmed audio). ~54.6s incl. held end card.
  const B = {
    hook: { from: 0, len: 157 },
    but: { from: 157, len: 169 },
    amount: { from: 326, len: 320 },
    portable: { from: 646, len: 391 },
    yours: { from: 1037, len: 220 },
    family: { from: 1257, len: 290 },
    end: { from: 1547, len: 90 },
  };

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: MONTSERRAT }}>
      <Glow />

      {/* 1 — hook */}
      <Sequence from={B.hook.from} durationInFrames={B.hook.len}>
        <Beat dur={B.hook.len}>
          <TextBlock top={250}>
            <KineticText text="“I’ve got insurance through my job —" fontSize={62} weight={800} color="#fff" maxWidth={900} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <KineticText text="I’m covered.”" appearAt={40} fontSize={62} weight={800} color={COLORS.gold} style={{ marginTop: 12 }} />
          </TextBlock>
          <Art top={780}><WorkBadge /></Art>
        </Beat>
      </Sequence>

      {/* 2 — but two things */}
      <Sequence from={B.but.from} durationInFrames={B.but.len}>
        <Beat dur={B.but.len}>
          <TextBlock top={830}>
            <div style={{ color: COLORS.muted, fontSize: 40, fontWeight: 600, marginBottom: 14 }}>It’s a great benefit. But…</div>
            <KineticText text="two things surprise people." fontSize={76} weight={900} color={COLORS.mint} style={{ margin: '0 auto' }} />
          </TextBlock>
        </Beat>
      </Sequence>

      {/* 3 — amount / the gap */}
      <Sequence from={B.amount.from} durationInFrames={B.amount.len}>
        <Beat dur={B.amount.len}>
          <TextBlock top={210}>
            <div style={{ color: COLORS.gold, fontSize: 40, fontWeight: 800, marginBottom: 10 }}>1.</div>
            <KineticText text="Work coverage is usually only 1–2× your salary." fontSize={58} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
          </TextBlock>
          <Art top={700}><GapBars /></Art>
        </Beat>
      </Sequence>

      {/* 4 — portable */}
      <Sequence from={B.portable.from} durationInFrames={B.portable.len}>
        <Beat dur={B.portable.len}>
          <TextBlock top={210}>
            <div style={{ color: COLORS.gold, fontSize: 40, fontWeight: 800, marginBottom: 10 }}>2.</div>
            <KineticText text="It belongs to your job — not to you." fontSize={60} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <div style={{ color: COLORS.muted, fontSize: 38, fontWeight: 600, marginTop: 16 }}>Leave or retire, and it walks out with you.</div>
          </TextBlock>
          <Art top={820}><WalkOut /></Art>
        </Beat>
      </Sequence>

      {/* 5 — yours to keep */}
      <Sequence from={B.yours.from} durationInFrames={B.yours.len}>
        <Beat dur={B.yours.len}>
          <Art top={360}><HeldShield /></Art>
          <TextBlock top={900}>
            <KineticText text="A policy of your own stays with you." fontSize={66} weight={900} color={COLORS.mint} maxWidth={920} lineHeight={1.12} style={{ margin: '0 auto' }} />
          </TextBlock>
        </Beat>
      </Sequence>

      {/* 6 — pays your family, tax-free */}
      <Sequence from={B.family.from} durationInFrames={B.family.len}>
        <Beat dur={B.family.len}>
          <TextBlock top={230}>
            <KineticText text="It goes straight to your family —" fontSize={62} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <KineticText text="tax-free, to use however they need." appearAt={40} fontSize={58} weight={800} color={COLORS.mint} maxWidth={920} lineHeight={1.16} style={{ margin: '18px auto 0' }} />
          </TextBlock>
          <Art top={760}><ToFamily /></Art>
        </Beat>
      </Sequence>

      {/* 7 — wordmark */}
      <Sequence from={B.end.from} durationInFrames={B.end.len}>
        <EndCard dur={B.end.len} />
      </Sequence>
    </AbsoluteFill>
  );
};
