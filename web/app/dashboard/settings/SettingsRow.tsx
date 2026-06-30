'use client';

import type { ReactNode } from 'react';

/** The brand toggle switch, shared across settings rows. */
export function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${on ? 'bg-[#44bbaa]' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

/**
 * One setting as a clean row: icon + title + one-line description on the
 * left, switch on the right. Stack several in a single bordered panel for
 * the hairline-divided list pattern; a lone row in its own panel works too
 * (last:border-b-0 drops the divider).
 */
export function ToggleRow({ icon, title, description, on, onToggle }: {
  icon: ReactNode;
  title: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5 px-5 py-4 border-b border-[#f1f1f1] last:border-b-0">
      <div className="flex items-start gap-3.5 min-w-0">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef6f4] text-[#0f6e56]">{icon}</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[#111827]">{title}</p>
          <p className="text-[13px] text-[#6b7280] mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
      <Switch on={on} onClick={onToggle} />
    </div>
  );
}

const ICON = 'h-[18px] w-[18px]';
export function IconSparkle() {
  return (<svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z" /><path d="M18.5 4l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4L16.6 6l1.4-.5z" /></svg>);
}
export function IconEnvelope() {
  return (<svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>);
}
export function IconRepeat() {
  return (<svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>);
}
export function IconForward() {
  return (<svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /><path d="M11 9l3 3-3 3" /></svg>);
}
export function IconTrendingUp() {
  return (<svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>);
}
