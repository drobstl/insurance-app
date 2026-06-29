'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';

/**
 * One-time celebratory moment shown right after an agent books a sit-down
 * while their phone is still unpaired. It rides the highest-emotion beat in
 * the day (a booking!) to make pairing feel like finishing the win rather
 * than a settings chore — tied to the actual lead they just booked.
 *
 * Shown at most once per agent (the Leads page gates on a per-uid
 * localStorage flag and only mounts this for unpaired, text-channel
 * agents). It does NOT block the confirmation drawer — the Leads page
 * reveals this only after that drawer closes, so the two never stack.
 */
interface Props {
  firstName: string;
  onClose: () => void;
}

export default function FirstBookingPairCelebration({ firstName, onClose }: Props) {
  const router = useRouter();
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    const burst = () => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6, x: 0.5 },
        colors: ['#44bbaa', '#5be0d0', '#005851', '#ffffff'],
      });
    };
    burst();
    const t = setTimeout(burst, 400);
    return () => clearTimeout(t);
  }, []);

  const handleSetUp = () => {
    onClose();
    router.push('/dashboard/pair-phone');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-[12px] shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in-95 duration-300">
        <div className="mx-auto w-16 h-16 rounded-full bg-[#daf3f0] flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-[#005851]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>

        <h2 className="text-2xl font-extrabold text-[#005851] mb-2">
          You booked {firstName}! 🎉
        </h2>
        <p className="text-sm text-[#444] mb-6 leading-relaxed">
          Pair your phone and the next one sends itself — their confirmation and your prep page
          (intro video, client stories, a quick intake), in two taps. They show up warm.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSetUp}
            className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#44bbaa] hover:bg-[#005751] rounded-[5px] border-2 border-[#1A1A1A] border-r-[3px] border-b-[3px] transition-colors"
          >
            Set up my phone
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 text-sm font-semibold text-[#707070] hover:text-[#005851] transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
