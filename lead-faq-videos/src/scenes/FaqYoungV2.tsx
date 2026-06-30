import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { COLORS, SPRING } from '../theme/tokens';
import { MONTSERRAT } from '../theme/fonts';
import { KineticText } from '../components/KineticText';
import { Wordmark } from '../components/Wordmark';

/**
 * Lead-home FAQ default — "I'm young & healthy, do I need this now?" —
 * illustrated edition. Every beat pairs kinetic text with a code-drawn
 * motion-graphic (no footage, no avatars). Paced ~46s for Daniel's VO;
 * resync beat boundaries to the recording before the final render.
 */

const BG = COLORS.nearBlack;

const Glow: React.FC = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 42%, rgba(13,77,77,0.75), transparent 62%)' }} />
);

// Per-beat fade/rise wrapper. Frame is local to the enclosing <Sequence>.
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
  <div style={{ position: 'absolute', top, left: 0, width: '100%', padding: '0 90px', textAlign: 'center' }}>
    {children}
  </div>
);

const Art: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: 'absolute', top, left: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
    {children}
  </div>
);

// Spring helper for entrance — local delay.
const usePop = (delay: number, config: { damping: number; stiffness: number; mass: number } = SPRING.gentle) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

// ── Illustration primitives ──────────────────────────────────────────

const Person: React.FC<{ color?: string; scale?: number }> = ({ color = COLORS.mint, scale = 1 }) => (
  <svg width={150 * scale} height={200 * scale} viewBox="-75 -110 150 210">
    <circle cx={0} cy={-62} r={30} fill={color} />
    <path d="M-46 70 Q-46 -18 0 -18 Q46 -18 46 70 Z" fill={color} />
  </svg>
);

const FloatingTag: React.FC<{ label: string; delay: number; left: number; top: number }> = ({ label, delay, left, top }) => {
  const s = usePop(delay, SPRING.pop);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)`,
        border: `2px solid rgba(61,214,195,0.55)`,
        background: 'rgba(61,214,195,0.08)',
        color: COLORS.mint,
        fontFamily: MONTSERRAT,
        fontWeight: 700,
        fontSize: 34,
        padding: '12px 26px',
        borderRadius: 44,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  );
};

const Padlock: React.FC = () => {
  const frame = useCurrentFrame();
  // Shackle lifts open, then snaps closed as he builds to "lock in"; the
  // "Locked in" label then holds on screen through the words.
  const close = interpolate(frame, [150, 168], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shackleY = interpolate(close, [0, 1], [-26, 0]);
  const clickPop = spring({ frame: frame - 164, fps: 30, config: SPRING.pop });
  const lockedOp = interpolate(frame, [172, 188], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <svg width={360} height={420} viewBox="-180 -210 360 420">
      <g transform={`translate(0 ${shackleY})`}>
        <path d="M-52 -10 V-58 A52 52 0 0 1 52 -58 V-10" fill="none" stroke={COLORS.mint} strokeWidth={26} strokeLinecap="round" />
      </g>
      <g transform={`scale(${interpolate(clickPop, [0, 1], [0.96, 1])})`}>
        <rect x={-78} y={-12} width={156} height={130} rx={22} fill={COLORS.gold} />
        <circle cx={0} cy={44} r={16} fill={COLORS.nearBlack} />
        <rect x={-7} y={44} width={14} height={34} rx={6} fill={COLORS.nearBlack} />
      </g>
      <text x={0} y={172} fill={COLORS.mint} fontSize={40} fontWeight={800} textAnchor="middle" opacity={lockedOp} fontFamily={MONTSERRAT}>
        Locked in
      </text>
    </svg>
  );
};

const RateCurve: React.FC = () => {
  const frame = useCurrentFrame();
  const L = 70, R = 740, TOP = 70, BOT = 470;
  const N = 36;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    return { x: L + t * (R - L), y: BOT - (BOT - TOP) * Math.pow(t, 1.7) };
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const prog = interpolate(frame, [10, 84], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dot = pts[Math.min(N, Math.floor(prog * N))];
  const nowS = spring({ frame: frame - 22, fps: 30, config: SPRING.pop });
  const waitS = spring({ frame: frame - 80, fps: 30, config: SPRING.pop });
  return (
    <svg width={820} height={600} viewBox="0 0 820 600">
      <g stroke={COLORS.coldLine} strokeWidth={4} strokeLinecap="round">
        <line x1={L} y1={TOP - 24} x2={L} y2={BOT} />
        <line x1={L} y1={BOT} x2={R + 16} y2={BOT} />
      </g>
      <text x={R + 14} y={BOT + 44} fill={COLORS.muted} fontSize={30} fontWeight={700} textAnchor="end" fontFamily={MONTSERRAT}>Your age →</text>
      <path d={d} fill="none" stroke={COLORS.gold} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} />
      {prog > 0.01 && prog < 0.99 && <circle cx={dot.x} cy={dot.y} r={15} fill={prog < 0.5 ? COLORS.mint : COLORS.coral} />}
      <g opacity={nowS} transform={`translate(${pts[0].x} ${pts[0].y})`}>
        <circle r={16} fill={COLORS.mint} />
        <text x={0} y={58} fill={COLORS.mint} fontSize={36} fontWeight={800} textAnchor="middle" fontFamily={MONTSERRAT}>Now</text>
      </g>
      <g opacity={waitS} transform={`translate(${pts[N].x} ${pts[N].y})`}>
        <circle r={16} fill={COLORS.coral} />
        <text x={0} y={-40} fill={COLORS.coral} fontSize={36} fontWeight={800} textAnchor="middle" fontFamily={MONTSERRAT}>Wait</text>
      </g>
    </svg>
  );
};

const ClosingDoor: React.FC = () => {
  const frame = useCurrentFrame();
  // Door panel sweeps shut over the warm opening.
  const shut = interpolate(frame, [34, 96], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <svg width={420} height={520} viewBox="-210 -260 420 520">
      {/* doorway + warm light behind */}
      <rect x={-150} y={-220} width={300} height={460} rx={14} fill="#10403a" />
      <rect x={-120} y={-196} width={240} height={420} rx={10} fill={COLORS.gold} opacity={0.85} />
      {/* the closing panel, anchored on the left jamb */}
      <g transform={`translate(-120 0) scale(${interpolate(shut, [0, 1], [0.06, 1])} 1)`}>
        <rect x={0} y={-196} width={240} height={420} rx={10} fill="#0c2e2a" />
        <rect x={18} y={-176} width={204} height={380} rx={8} fill="none" stroke="#1c4a44" strokeWidth={5} />
        <circle cx={196} cy={20} r={10} fill={COLORS.mint} opacity={interpolate(shut, [0.6, 1], [0, 1], { extrapolateLeft: 'clamp' })} />
      </g>
    </svg>
  );
};

const HouseFigures: React.FC = () => {
  const frame = useCurrentFrame();
  const houseS = spring({ frame: frame - 8, fps: 30, config: SPRING.gentle });
  const tagS = spring({ frame: frame - 30, fps: 30, config: SPRING.pop });
  const who = [
    { label: 'a co-signer', delay: 60 },
    { label: 'a partner', delay: 74 },
    { label: 'a parent who helped', delay: 88 },
  ];
  return (
    <svg width={860} height={620} viewBox="0 0 860 620" fontFamily={MONTSERRAT}>
      {/* house */}
      <g transform={`translate(430 150) scale(${interpolate(houseS, [0, 1], [0.9, 1])})`} opacity={houseS}>
        <path d="M-130 0 L0 -110 L130 0 Z" fill={COLORS.tealDeep} />
        <rect x={-104} y={0} width={208} height={150} fill={COLORS.teal} />
        <rect x={-30} y={64} width={60} height={86} rx={6} fill={COLORS.nearBlack} />
        <rect x={-86} y={26} width={48} height={42} rx={6} fill="#0c2e2a" />
        <rect x={40} y={26} width={48} height={42} rx={6} fill="#0c2e2a" />
        {/* mortgage tag */}
        <g transform="translate(118 -78)" opacity={tagS}>
          <rect x={-6} y={-26} width={176} height={56} rx={10} fill={COLORS.gold} />
          <text x={82} y={11} fill={COLORS.nearBlack} fontSize={32} fontWeight={800} textAnchor="middle">mortgage</text>
        </g>
      </g>
      {/* the people who could be left holding it */}
      {who.map((p, i) => {
        const s = spring({ frame: frame - p.delay, fps: 30, config: SPRING.pop });
        const x = 180 + i * 250;
        return (
          <g key={p.label} transform={`translate(${x} 360)`} opacity={s} >
            <g transform={`translate(0 ${interpolate(s, [0, 1], [22, 0])})`}>
              <circle cx={0} cy={0} r={26} fill={COLORS.mint} />
              <path d="M-40 78 Q-40 16 0 16 Q40 16 40 78 Z" fill={COLORS.mint} />
              <text x={0} y={140} fill="#cfe9e2" fontSize={30} fontWeight={700} textAnchor="middle">{p.label}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
};

const HeartBills: React.FC = () => {
  const frame = useCurrentFrame();
  const heartS = spring({ frame: frame - 10, fps: 30, config: SPRING.pop });
  return (
    <svg width={780} height={420} viewBox="0 0 780 420" fontFamily={MONTSERRAT}>
      {/* heart */}
      <g transform={`translate(190 210) scale(${interpolate(heartS, [0, 1], [0.8, 1])})`} opacity={heartS}>
        <path d="M0 70 C-90 0 -120 -70 -60 -100 C-22 -118 0 -86 0 -64 C0 -86 22 -118 60 -100 C120 -70 90 0 0 70 Z" fill={COLORS.coral} />
      </g>
      {/* "can't cover" arrow / not-equal */}
      <text x={390} y={232} fill={COLORS.muted} fontSize={88} fontWeight={800} textAnchor="middle">≠</text>
      {/* mortgage statement / bills */}
      {[0, 1, 2].map((i) => {
        const s = spring({ frame: frame - (24 + i * 8), fps: 30, config: SPRING.gentle });
        return (
          <g key={i} transform={`translate(${560 - i * 10} ${120 + i * 56})`} opacity={s}>
            <rect x={0} y={0} width={210} height={64} rx={8} fill="#16302c" stroke="#27514a" strokeWidth={3} />
            <rect x={18} y={20} width={70} height={10} rx={5} fill={COLORS.muted} />
            <rect x={18} y={40} width={120} height={10} rx={5} fill="#3a5852" />
            <text x={186} y={42} fill={COLORS.gold} fontSize={34} fontWeight={800} textAnchor="end">$</text>
          </g>
        );
      })}
    </svg>
  );
};

const ShieldFamily: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [16, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fill = interpolate(frame, [70, 96], [0, 0.16], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const houseS = spring({ frame: frame - 6, fps: 30, config: SPRING.gentle });
  return (
    <svg width={560} height={620} viewBox="-280 -310 560 620" fontFamily={MONTSERRAT}>
      {/* house + two figures inside */}
      <g opacity={houseS} transform="translate(0 30)">
        <path d="M-92 0 L0 -78 L92 0 Z" fill={COLORS.tealDeep} />
        <rect x={-74} y={0} width={148} height={104} fill={COLORS.teal} />
        <circle cx={-30} cy={150} r={18} fill={COLORS.mint} />
        <path d="M-58 200 Q-58 158 -30 158 Q-2 158 -2 200 Z" fill={COLORS.mint} />
        <circle cx={30} cy={150} r={18} fill={COLORS.mint} />
        <path d="M2 200 Q2 158 30 158 Q58 158 58 200 Z" fill={COLORS.mint} />
      </g>
      {/* shield drawing on around them */}
      <path
        d="M0 -250 L150 -190 V-30 Q150 130 0 230 Q-150 130 -150 -30 V-190 Z"
        fill={`rgba(61,214,195,${fill})`}
        stroke={COLORS.mint}
        strokeWidth={12}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
    </svg>
  );
};

const FlipIcon: React.FC = () => {
  const s = usePop(4, SPRING.pop);
  return (
    <svg width={130} height={130} viewBox="-65 -65 130 130" style={{ transform: `rotate(${interpolate(s, [0, 1], [-90, 0])}deg)`, opacity: s }}>
      <path d="M-38 -8 A38 38 0 0 1 30 -28" fill="none" stroke={COLORS.mint} strokeWidth={12} strokeLinecap="round" />
      <path d="M30 -28 L16 -40 M30 -28 L40 -14" fill="none" stroke={COLORS.mint} strokeWidth={12} strokeLinecap="round" />
      <path d="M38 8 A38 38 0 0 1 -30 28" fill="none" stroke={COLORS.gold} strokeWidth={12} strokeLinecap="round" />
      <path d="M-30 28 L-16 40 M-30 28 L-40 14" fill="none" stroke={COLORS.gold} strokeWidth={12} strokeLinecap="round" />
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

// ── Timeline ─────────────────────────────────────────────────────────

export const FaqYoungV2: React.FC = () => {
  // Beat boundaries snapped to Daniel's exact word timings (Whisper word-level
  // transcript + acoustic pause detection, shifted to the trimmed audio). Each
  // beat's visual lands ~0.2s before he begins that line. ~56.3s incl. held card.
  const B = {
    hook: { from: 0, len: 195 },
    flip: { from: 195, len: 77 },
    cheapest: { from: 272, len: 255 },
    rate: { from: 527, len: 226 },
    health: { from: 753, len: 122 },
    affected: { from: 875, len: 340 },
    family: { from: 1215, len: 166 },
    close: { from: 1381, len: 239 },
    end: { from: 1620, len: 90 },
  };

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: MONTSERRAT }}>
      <Glow />

      {/* 1 — hook */}
      <Sequence from={B.hook.from} durationInFrames={B.hook.len}>
        <Beat dur={B.hook.len}>
          <TextBlock top={250}>
            <div style={{ color: COLORS.muted, fontSize: 32, fontWeight: 600, marginBottom: 22 }}>You might be thinking…</div>
            <KineticText text="“I’m young. I’m healthy. No kids." fontSize={68} weight={800} color="#fff" maxWidth={880} style={{ margin: '0 auto' }} />
            <KineticText text="Why now?”" appearAt={44} fontSize={68} weight={800} color={COLORS.gold} style={{ marginTop: 12 }} />
          </TextBlock>
          <Art top={760}><Person scale={2} /></Art>
          <FloatingTag label="young" delay={70} left={210} top={900} />
          <FloatingTag label="healthy" delay={84} left={690} top={1000} />
          <FloatingTag label="no kids" delay={98} left={250} top={1240} />
        </Beat>
      </Sequence>

      {/* 2 — flip */}
      <Sequence from={B.flip.from} durationInFrames={B.flip.len}>
        <Beat dur={B.flip.len}>
          <Art top={760}><FlipIcon /></Art>
          <TextBlock top={920}>
            <KineticText text="Here’s the flip side." fontSize={84} weight={900} color={COLORS.mint} style={{ margin: '0 auto' }} />
          </TextBlock>
        </Beat>
      </Sequence>

      {/* 3 — cheapest / lock in */}
      <Sequence from={B.cheapest.from} durationInFrames={B.cheapest.len}>
        <Beat dur={B.cheapest.len}>
          <TextBlock top={250}>
            <KineticText text="Young and healthy isn’t a reason to wait." fontSize={62} weight={800} color="#fff" maxWidth={900} lineHeight={1.12} style={{ margin: '0 auto' }} />
            <KineticText text="It’s the cheapest and easiest it will ever be to lock in." appearAt={40} fontSize={56} weight={800} color="#fff" maxWidth={900} lineHeight={1.16} highlight="cheapest" highlightColor={COLORS.mint} style={{ margin: '26px auto 0' }} />
          </TextBlock>
          <Art top={820}><Padlock /></Art>
        </Beat>
      </Sequence>

      {/* 4 — rate vs age */}
      <Sequence from={B.rate.from} durationInFrames={B.rate.len}>
        <Beat dur={B.rate.len}>
          <TextBlock top={250}>
            <KineticText text="Your rate is set by your age and health — today." fontSize={58} weight={800} color="#fff" maxWidth={900} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <div style={{ color: COLORS.gold, fontSize: 44, fontWeight: 800, marginTop: 18 }}>Time only moves one direction.</div>
          </TextBlock>
          <Art top={760}><RateCurve /></Art>
        </Beat>
      </Sequence>

      {/* 5 — can't get it back */}
      <Sequence from={B.health.from} durationInFrames={B.health.len}>
        <Beat dur={B.health.len}>
          <TextBlock top={260}>
            <KineticText text="Once your health changes," fontSize={64} weight={800} color="#fff" maxWidth={880} style={{ margin: '0 auto' }} />
            <KineticText text="you can’t always get it back." appearAt={32} fontSize={64} weight={900} color={COLORS.gold} maxWidth={880} style={{ margin: '14px auto 0' }} />
          </TextBlock>
          <Art top={840}><ClosingDoor /></Art>
        </Beat>
      </Sequence>

      {/* 6 — no kids ≠ no one affected */}
      <Sequence from={B.affected.from} durationInFrames={B.affected.len}>
        <Beat dur={B.affected.len}>
          <TextBlock top={210}>
            <KineticText text="No kids yet doesn’t mean no one’s affected." fontSize={58} weight={800} color="#fff" maxWidth={920} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <div style={{ color: COLORS.muted, fontSize: 36, fontWeight: 600, marginTop: 18 }}>A home can leave someone holding the loan:</div>
          </TextBlock>
          <Art top={620}><HouseFigures /></Art>
        </Beat>
      </Sequence>

      {/* 7 — love doesn't pay a mortgage */}
      <Sequence from={B.family.from} durationInFrames={B.family.len}>
        <Beat dur={B.family.len}>
          <Art top={250}><HeartBills /></Art>
          <TextBlock top={760}>
            <div style={{ color: COLORS.muted, fontSize: 42, fontWeight: 600, marginBottom: 16 }}>Counting on family to cover it?</div>
            <KineticText text="Love doesn’t pay a mortgage." fontSize={80} weight={900} color={COLORS.gold} maxWidth={900} lineHeight={1.08} style={{ margin: '0 auto' }} />
          </TextBlock>
        </Beat>
      </Sequence>

      {/* 8 — close */}
      <Sequence from={B.close.from} durationInFrames={B.close.len}>
        <Beat dur={B.close.len}>
          <Art top={240}><ShieldFamily /></Art>
          <TextBlock top={920}>
            <KineticText text="Real protection means they never have to." fontSize={58} weight={800} color="#fff" maxWidth={900} lineHeight={1.14} style={{ margin: '0 auto' }} />
            <KineticText text="You’ve got them — so they don’t get stuck." appearAt={38} fontSize={50} weight={700} color={COLORS.mint} maxWidth={900} lineHeight={1.18} style={{ margin: '22px auto 0' }} />
          </TextBlock>
        </Beat>
      </Sequence>

      {/* 9 — wordmark */}
      <Sequence from={B.end.from} durationInFrames={B.end.len}>
        <EndCard dur={B.end.len} />
      </Sequence>
    </AbsoluteFill>
  );
};
