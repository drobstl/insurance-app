'use client';

import { useEffect, useMemo, useState } from 'react';
import PhoneFrame, {
  buildScreenTransform,
  PHONE_FRAME_CONFIGS,
  type PhoneFrameId,
  type ScreenWindowConfig,
  type TransformControls,
} from '@/components/PhoneFrame';
import PhoneFramePair from '@/components/PhoneFramePair';

const SCREENSHOT_OPTIONS = [
  '/screenshot-referral-sent.png',
  '/screenshot-ai-referral-imessage.png',
  '/screenshot-rewrite-convo.png',
  '/screenshot-rewrite-app.png',
  '/screenshot-clients-dashboard.png',
  '/screenshot-thanksgiving-card.png',
  '/screenshot-thanksgiving-notification.png',
] as const;

const ANGLED_FRAMES = new Set<PhoneFrameId>([
  'handLeft',
  'angledLeft',
  'angledRight',
  'angled',
  'tiltedUp1',
  'tiltedUp2',
]);

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
};

function Slider({ label, min, max, step = 0.1, value, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-sm text-[#1A1A1A]/80">
        <span>{label}</span>
        <span className="font-mono text-xs">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full"
      />
    </label>
  );
}

export default function FramePreviewClient() {
  const frameIds = Object.keys(PHONE_FRAME_CONFIGS) as PhoneFrameId[];

  const [frame, setFrame] = useState<PhoneFrameId>('handLeft');
  const [screenshot, setScreenshot] = useState<string>(SCREENSHOT_OPTIONS[0]);

  const selectedConfig = PHONE_FRAME_CONFIGS[frame];
  const isAngled = ANGLED_FRAMES.has(frame);

  const [leftPct, setLeftPct] = useState(0);
  const [topPct, setTopPct] = useState(0);
  const [widthPct, setWidthPct] = useState(0);
  const [heightPct, setHeightPct] = useState(0);
  const [borderRadiusPct, setBorderRadiusPct] = useState(0);
  const [perspective, setPerspective] = useState(1200);
  const [rotateXDeg, setRotateXDeg] = useState(0);
  const [rotateYDeg, setRotateYDeg] = useState(0);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [skewXDeg, setSkewXDeg] = useState(0);
  const [skewYDeg, setSkewYDeg] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const screen: ScreenWindowConfig = selectedConfig.screen;
    setLeftPct(screen.leftPct);
    setTopPct(screen.topPct);
    setWidthPct(screen.widthPct);
    setHeightPct(screen.heightPct);
    setBorderRadiusPct(screen.borderRadiusPct ?? 6);
    setPerspective(screen.transformControls?.perspective ?? 1200);
    setRotateXDeg(screen.transformControls?.rotateXDeg ?? 0);
    setRotateYDeg(screen.transformControls?.rotateYDeg ?? 0);
    setRotateDeg(screen.transformControls?.rotateDeg ?? 0);
    setSkewXDeg(screen.transformControls?.skewXDeg ?? 0);
    setSkewYDeg(screen.transformControls?.skewYDeg ?? 0);
    setScale(screen.transformControls?.scale ?? 1);
  }, [frame, selectedConfig]);

  const transformControls: TransformControls = useMemo(
    () => ({
      perspective,
      rotateXDeg,
      rotateYDeg,
      rotateDeg,
      skewXDeg,
      skewYDeg,
      scale,
    }),
    [perspective, rotateXDeg, rotateYDeg, rotateDeg, skewXDeg, skewYDeg, scale],
  );

  const previewConfigText = useMemo(() => {
    const screen: ScreenWindowConfig = selectedConfig.screen;
    const transformText = buildScreenTransform(transformControls);
    const controlsLines = [
      `        perspective: ${perspective},`,
      `        rotateXDeg: ${rotateXDeg},`,
      `        rotateYDeg: ${rotateYDeg},`,
      `        rotateDeg: ${rotateDeg},`,
      `        skewXDeg: ${skewXDeg},`,
      `        skewYDeg: ${skewYDeg},`,
      `        scale: ${scale},`,
    ];

    return `${frame}: {
  src: '${selectedConfig.src}',
  screen: {
    leftPct: ${leftPct},
    topPct: ${topPct},
    widthPct: ${widthPct},
    heightPct: ${heightPct},
    borderRadiusPct: ${borderRadiusPct},
${isAngled ? `    transformControls: {\n${controlsLines.join('\n')}\n    },` : ''}
    transform: ${transformText ? `'${transformText}'` : 'undefined'},
    transformOrigin: '${screen.transformOrigin ?? '50% 50%'}',
  },
},`;
  }, [
    frame,
    selectedConfig,
    leftPct,
    topPct,
    widthPct,
    heightPct,
    borderRadiusPct,
    isAngled,
    transformControls,
    perspective,
    rotateXDeg,
    rotateYDeg,
    rotateDeg,
    skewXDeg,
    skewYDeg,
    scale,
  ]);

  return (
    <main className="min-h-screen bg-[#F5F0E8] px-6 py-8 text-[#1A1A1A]">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-2xl border border-[#1A1A1A]/15 bg-white/70 p-4">
          <h1 className="text-xl font-semibold">Frame Preview Tool</h1>
          <p className="mt-1 text-sm text-[#1A1A1A]/65">
            Tune frame geometry and transform values, then copy into config.
          </p>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[#1A1A1A]/75">Frame</span>
              <select
                value={frame}
                onChange={(e) => setFrame(e.currentTarget.value as PhoneFrameId)}
                className="w-full rounded-lg border border-[#1A1A1A]/20 bg-white px-3 py-2 text-sm"
              >
                {frameIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[#1A1A1A]/75">Screenshot</span>
              <select
                value={screenshot}
                onChange={(e) => setScreenshot(e.currentTarget.value)}
                className="w-full rounded-lg border border-[#1A1A1A]/20 bg-white px-3 py-2 text-sm"
              >
                {SCREENSHOT_OPTIONS.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 space-y-3">
            <Slider label="top %" min={0} max={35} value={topPct} onChange={setTopPct} />
            <Slider label="left %" min={0} max={40} value={leftPct} onChange={setLeftPct} />
            <Slider label="width %" min={20} max={90} value={widthPct} onChange={setWidthPct} />
            <Slider label="height %" min={20} max={90} value={heightPct} onChange={setHeightPct} />
            <Slider
              label="border radius %"
              min={0}
              max={20}
              value={borderRadiusPct}
              onChange={setBorderRadiusPct}
            />
          </div>

          {isAngled && (
            <div className="mt-5 border-t border-[#1A1A1A]/15 pt-4">
              <p className="mb-3 text-sm font-medium text-[#1A1A1A]/80">Angled transform controls</p>
              <div className="space-y-3">
                <Slider
                  label="perspective px"
                  min={500}
                  max={2200}
                  step={10}
                  value={perspective}
                  onChange={setPerspective}
                />
                <Slider label="rotateX deg" min={-30} max={30} value={rotateXDeg} onChange={setRotateXDeg} />
                <Slider label="rotateY deg" min={-30} max={30} value={rotateYDeg} onChange={setRotateYDeg} />
                <Slider label="rotate deg" min={-20} max={20} value={rotateDeg} onChange={setRotateDeg} />
                <Slider label="skewX deg" min={-12} max={12} value={skewXDeg} onChange={setSkewXDeg} />
                <Slider label="skewY deg" min={-12} max={12} value={skewYDeg} onChange={setSkewYDeg} />
                <Slider label="scale" min={0.8} max={1.2} step={0.01} value={scale} onChange={setScale} />
              </div>
            </div>
          )}
        </aside>

        <section className="space-y-6">
          <div className="rounded-2xl border border-[#1A1A1A]/15 bg-white/70 p-6">
            <h2 className="text-lg font-semibold">Selected frame preview</h2>
            <div className="mt-5 flex justify-center">
              <PhoneFrame
                frame={frame}
                src={screenshot}
                className="w-[320px]"
                screenStyle={{
                  top: `${topPct}%`,
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  borderRadius: `${borderRadiusPct}%`,
                }}
                transformOverride={isAngled ? transformControls : undefined}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#1A1A1A]/15 bg-white/70 p-6">
            <h2 className="text-lg font-semibold">Pair layout preview</h2>
            <p className="mt-1 text-sm text-[#1A1A1A]/65">
              Quick sanity check for story-style two-phone sections.
            </p>
            <div className="mt-4 rounded-xl border border-[#1A1A1A]/10 bg-[#F5F0E8] p-4">
              <PhoneFramePair
                left={{ frame: 'handLeft', src: '/screenshot-referral-sent.png' }}
                right={{ frame: 'straight', src: '/screenshot-ai-referral-imessage.png' }}
                front="right"
                overlapPx={42}
                className="w-full"
                phoneClassName="w-[210px]"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#1A1A1A]/15 bg-[#1A1A1A] p-6 text-[#FFFDEB]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Config output</h2>
              <button
                type="button"
                onClick={async () => navigator.clipboard.writeText(previewConfigText)}
                className="rounded-full border border-[#FFFDEB]/40 px-3 py-1 text-xs"
              >
                Copy
              </button>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-black/25 p-4 text-xs leading-relaxed">
{previewConfigText}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
