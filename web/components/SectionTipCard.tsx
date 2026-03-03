'use client';

import type { ReactNode } from 'react';

interface SectionTipCardProps {
  children: ReactNode;
  onDismiss: () => void;
}

export default function SectionTipCard({ children, onDismiss }: SectionTipCardProps) {
  return (
    <div className="flex items-start gap-3 bg-white border border-[#d0d0d0] rounded-[5px] px-4 py-3 mb-4 border-l-[3px] border-l-[#3DD6C3]">
      <svg
        className="w-5 h-5 text-[#005851] mt-0.5 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="flex-1 text-sm text-[#374151] leading-relaxed">{children}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-xs font-medium text-[#005851] hover:text-[#003d38] bg-[#daf3f0] hover:bg-[#c5ece7] px-3 py-1.5 rounded-[5px] transition-colors"
      >
        Got it
      </button>
    </div>
  );
}
