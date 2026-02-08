'use client';

import { useEffect } from 'react';

interface LoomVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Replace with your real Loom embed URL, e.g. https://www.loom.com/embed/abc123 */
  videoUrl?: string;
}

export default function LoomVideoModal({
  isOpen,
  onClose,
  videoUrl = 'https://www.loom.com/embed/REPLACE_WITH_YOUR_VIDEO_ID',
}: LoomVideoModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isPlaceholder = videoUrl.includes('REPLACE_WITH_YOUR_VIDEO_ID');

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#3DD6C3]/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-[#005851]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0D4D4D]">Getting Started with AgentForLife</h3>
              <p className="text-sm text-[#707070]">Watch this quick tutorial to set up your dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#707070] hover:text-[#0D4D4D] hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close video"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video */}
        <div className="relative bg-black" style={{ paddingBottom: '56.25%' }}>
          {isPlaceholder ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D4D4D] text-white">
              <svg className="w-16 h-16 text-[#3DD6C3] mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <p className="text-lg font-semibold">Tutorial Video Coming Soon</p>
              <p className="text-white/60 text-sm mt-2">Record your Loom video and replace the placeholder URL</p>
              <p className="text-white/40 text-xs mt-4 font-mono">components/LoomVideoModal.tsx</p>
            </div>
          ) : (
            <iframe
              src={videoUrl}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture"
            />
          )}
        </div>
      </div>
    </div>
  );
}
