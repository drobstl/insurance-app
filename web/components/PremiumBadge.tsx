'use client';

interface Props {
  badgeId?: string;
  size?: number;
  shimmer?: boolean;
  glow?: boolean;
  grayscale?: boolean;
}

export default function PremiumBadge({
  badgeId,
  size = 40,
  shimmer = false,
  glow = false,
  grayscale = false,
}: Props) {
  const src = badgeId ? `/badges/${badgeId}.png` : undefined;

  if (!src) return null;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${grayscale ? 'grayscale opacity-40' : ''}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain"
        style={{
          filter: glow ? `drop-shadow(0 0 ${Math.round(size * 0.15)}px rgba(0,0,0,0.3))` : undefined,
        }}
      />
      {shimmer && (
        <div
          className="absolute inset-0 overflow-hidden rounded-full pointer-events-none"
          style={{ WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 70%)' }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)',
              animation: 'badge-shimmer 3s infinite',
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes badge-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
