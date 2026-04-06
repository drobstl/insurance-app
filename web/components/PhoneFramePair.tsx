'use client';

import PhoneFrame, { type PhoneFrameId } from '@/components/PhoneFrame';

type PhoneFrameItem = {
  frame: PhoneFrameId;
  src: string;
  alt?: string;
  className?: string;
};

type PhoneFramePairProps = {
  left: PhoneFrameItem;
  right: PhoneFrameItem;
  className?: string;
  direction?: 'ltr' | 'rtl';
  front?: 'left' | 'right';
  overlapPx?: number;
  phoneClassName?: string;
};

function cx(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export default function PhoneFramePair({
  left,
  right,
  className,
  direction = 'ltr',
  front = 'right',
  overlapPx = 36,
  phoneClassName,
}: PhoneFramePairProps) {
  const first = direction === 'ltr' ? left : right;
  const second = direction === 'ltr' ? right : left;
  const firstKey = direction === 'ltr' ? 'left' : 'right';
  const secondKey = direction === 'ltr' ? 'right' : 'left';

  return (
    <div className={cx('relative flex items-end justify-center', className)}>
      <div className={cx('relative', front === firstKey ? 'z-20' : 'z-10')}>
        <PhoneFrame
          frame={first.frame}
          src={first.src}
          alt={first.alt}
          className={cx(phoneClassName ?? 'w-[220px]', first.className)}
        />
      </div>
      <div
        className={cx('relative', front === secondKey ? 'z-20' : 'z-10')}
        style={{ marginLeft: `-${overlapPx}px` }}
      >
        <PhoneFrame
          frame={second.frame}
          src={second.src}
          alt={second.alt}
          className={cx(phoneClassName ?? 'w-[220px]', second.className)}
        />
      </div>
    </div>
  );
}
