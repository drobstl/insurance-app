'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, animate as animateMotionValue, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';
import { getSuggestedQuestions } from '../lib/patch-knowledge';
import { pickNudge, getDismissedNudges, dismissNudge, PATCH_NUDGES, type PatchNudge } from '../lib/patch-nudges';

const MotionDiv = motion.div;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DashboardAssistantProps {
  onFirstUserMessage?: (message: string) => void;
}

const LINK_REGEX = /(\[[^\]]+\]\([^)]+\))/g;
const LINK_MATCH_REGEX = /^\[([^\]]+)\]\(([^)]+)\)$/;
const BOLD_REGEX = /(\*\*[^*]+\*\*)/g;
const BOLD_MATCH_REGEX = /^\*\*([^*]+)\*\*$/;
const PATCH_OFFSET_STORAGE_KEY = 'patch-fab-offset-v1';
const PATCH_BUTTON_SIZE_PX = 44;
const PATCH_MIN_MARGIN_PX = 12;
const PATCH_REVEAL_SEEN_KEY = 'patch-reveal-seen-v1';

function parseLinks(text: string): React.ReactNode[] {
  const parts = text.split(LINK_REGEX);
  return parts.map((part, i) => {
    const match = part.match(LINK_MATCH_REGEX);
    if (match) {
      const [, label, href] = match;
      if (href.startsWith('/dashboard')) {
        return (
          <a
            key={i}
            href={href}
            className="text-[#3DD6C3] underline underline-offset-2 hover:text-[#44bbaa] font-medium"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = href;
            }}
          >
            {label}
          </a>
        );
      }
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-[#3DD6C3] underline underline-offset-2 hover:text-[#44bbaa] font-medium">
          {label}
        </a>
      );
    }

    return part.split(BOLD_REGEX).map((seg, j) => {
      const boldMatch = seg.match(BOLD_MATCH_REGEX);
      if (boldMatch) return <strong key={`${i}-${j}`}>{boldMatch[1]}</strong>;
      return <span key={`${i}-${j}`}>{seg}</span>;
    });
  });
}

function PatchMascot({ size = 40, animated = false, winkTrigger }: { size?: number; animated?: boolean; winkTrigger?: boolean }) {
  if (animated) {
    const showWink = winkTrigger === true;
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <img
          src="/patch-face.png"
          alt="Patch"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          style={{ opacity: showWink ? 0 : 1 }}
        />
        <img
          src="/patch-face-wink.png"
          alt="Patch winking"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          style={{ opacity: showWink ? 1 : 0 }}
        />
      </div>
    );
  }
  return (
    <img
      src="/patch-face.png"
      alt="Patch"
      draggable={false}
      style={{ width: size, height: size }}
      className="object-contain pointer-events-none select-none"
    />
  );
}

function AssistantMessage({ content }: { content: string }) {
  const paragraphs = content.split('\n').filter(Boolean);
  return (
    <div className="space-y-1.5">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-[#1a1a1a] leading-relaxed">
          {parseLinks(p)}
        </p>
      ))}
    </div>
  );
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// First-meeting reveal: Patch genies up to center, introduces himself as the
// guide (emotional note: relief, not "look how much we have"), then genies back
// down to his corner. His look — the face PNG — is untouched; this is motion only.
function PatchReveal({ onDone }: { onDone: () => void }) {
  type Pt = { x: number; y: number };
  const reduce = useReducedMotion();
  const patchRef = useRef<HTMLDivElement>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [bgVisible, setBgVisible] = useState(false);
  const doneRef = useRef(false);
  const dismissingRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  // Quadratic bezier point — bends Patch's path into a graceful arc.
  const bezier = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
    const mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };
  };

  // Delta from screen center to Patch's bottom-right resting spot.
  const cornerDelta = (): Pt => {
    if (typeof window === 'undefined') return { x: 240, y: 240 };
    const margin = 24;
    return {
      x: window.innerWidth / 2 - PATCH_BUTTON_SIZE_PX / 2 - margin,
      y: window.innerHeight / 2 - PATCH_BUTTON_SIZE_PX / 2 - margin,
    };
  };

  const tf = (x: number, y: number, sx: number, sy: number) =>
    `translate(${x}px, ${y}px) scaleX(${sx}) scaleY(${sy})`;

  // Entrance: arc up from the corner with squash-and-stretch — his body
  // elongates into the motion, then his mass catches up and reforms with a
  // settle. Driven by the Web Animations API as one transform track so
  // position and scale never drift apart (the cause of the old wobble).
  useEffect(() => {
    const el = patchRef.current;
    if (!el) return;
    let cancelled = false;
    setBgVisible(true);
    const c = cornerDelta();
    if (reduce) {
      el.style.transform = 'translate(0px, 0px)';
      el.style.opacity = '1';
      setShowMessage(true);
      return;
    }
    el.style.transformOrigin = 'center bottom';
    const p0 = { x: c.x, y: c.y };
    const p2 = { x: 0, y: 0 };
    const p1 = { x: c.x * 0.5, y: -Math.abs(c.y) * 0.5 };
    const at = (t: number) => bezier(p0, p1, p2, Math.min(1, t / 0.68));
    const anim = el.animate(
      [
        { offset: 0, opacity: 0, transform: tf(p0.x, p0.y, 0.5, 0.5) },
        { offset: 0.22, opacity: 1, transform: tf(at(0.22).x, at(0.22).y, 0.7, 1.42) },
        { offset: 0.46, opacity: 1, transform: tf(at(0.46).x, at(0.46).y, 0.64, 1.54) },
        { offset: 0.68, opacity: 1, transform: tf(0, 0, 0.82, 1.26) },
        { offset: 0.82, opacity: 1, transform: tf(0, 0, 1.14, 0.86) },
        { offset: 0.92, opacity: 1, transform: tf(0, 0, 0.97, 1.04) },
        { offset: 1, opacity: 1, transform: tf(0, 0, 1, 1) },
      ],
      { duration: 1300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );
    anim.finished
      .then(() => {
        if (cancelled) return;
        el.style.transformOrigin = 'center';
        setShowMessage(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      anim.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  // Exit: a small acknowledging bob, then arc back out to the corner. Only the
  // agent dismisses him (the Got it button or the backdrop) — no auto-timeout.
  const dismiss = useCallback(() => {
    const el = patchRef.current;
    if (!el || dismissingRef.current) return;
    dismissingRef.current = true;
    setShowMessage(false);
    setBgVisible(false);
    const c = cornerDelta();
    if (reduce) {
      finish();
      return;
    }
    el.style.transformOrigin = 'center top';
    const q0 = { x: 0, y: 0 };
    const q2 = { x: c.x, y: c.y };
    const q1 = { x: c.x * 0.5, y: -Math.abs(c.y) * 0.42 };
    const at = (t: number) => bezier(q0, q1, q2, t);
    el.animate(
      [
        { transform: tf(0, 0, 1, 1) },
        { transform: tf(0, 0, 1.1, 0.9), offset: 0.22 },
        { transform: tf(0, 0, 1, 1), offset: 0.42 },
      ],
      { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' },
    )
      .finished.then(() =>
        el.animate(
          [
            { offset: 0, opacity: 1, transform: tf(0, 0, 1, 1) },
            { offset: 0.3, opacity: 1, transform: tf(at(0.3).x, at(0.3).y, 0.74, 1.4) },
            { offset: 0.66, opacity: 0.95, transform: tf(at(0.66).x, at(0.66).y, 0.64, 1.5) },
            { offset: 1, opacity: 0, transform: tf(q2.x, q2.y, 0.5, 0.5) },
          ],
          { duration: 1000, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' },
        ).finished,
      )
      .then(() => finish())
      .catch(() => finish());
  }, [reduce, finish]);

  const c0 = cornerDelta();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-label="Meet Patch">
      <motion.div
        className="absolute inset-0 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: bgVisible ? 1 : 0 }}
        transition={{ duration: 0.45 }}
        onClick={dismiss}
      />
      <div className="relative flex flex-col items-center px-4" style={{ pointerEvents: 'none' }}>
        <div ref={patchRef} style={{ opacity: 0, transform: tf(c0.x, c0.y, 0.5, 0.5), willChange: 'transform' }}>
          <motion.div
            animate={showMessage && !reduce ? { scale: [1, 1.035, 1] } : { scale: 1 }}
            transition={
              showMessage && !reduce ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }
            }
          >
            <PatchMascot size={104} />
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: showMessage ? 1 : 0, y: showMessage ? 0 : 12 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-[320px] text-center"
          style={{ pointerEvents: showMessage ? 'auto' : 'none' }}
        >
          <p className="text-white text-[15px] font-medium leading-snug">Hi, I&apos;m Patch — your guide.</p>
          <p className="text-white/85 text-sm leading-snug mt-1">
            You don&apos;t have to memorize any of this. Ask me anything, anytime.
          </p>
          <button
            onClick={dismiss}
            className="mt-4 bg-white text-[#005851] hover:bg-white/90 rounded-[9px] px-5 py-2 text-sm font-semibold transition-colors"
          >
            Got it
          </button>
        </motion.div>
      </div>
    </div>
  );
}

export default function DashboardAssistant({ onFirstUserMessage }: DashboardAssistantProps) {
  const { user, agentProfile, profileLoading } = useDashboard();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [nudge, setNudge] = useState<PatchNudge | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const nudgeShownRef = useRef(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [showWink, setShowWink] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suppressClickRef = useRef(false);
  // Patch's position is driven by motion values the drag writes to directly, so
  // a drop sticks (binding x/y via `animate` instead fights the drag and snaps
  // him back to the corner — the old bug).
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const firstUserMessageReportedRef = useRef(false);

  // Tilt: two nods back-to-back, then rest, then random delay and repeat
  useEffect(() => {
    if (open) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleTilt = () => {
      timers.push(
        setTimeout(() => {
          setTiltDeg(22);
          timers.push(setTimeout(() => {
            setTiltDeg(0);
            timers.push(setTimeout(() => {
              setTiltDeg(22);
              timers.push(setTimeout(() => {
                setTiltDeg(0);
                scheduleTilt();
              }, 350));
            }, 250));
          }, 350));
        }, randomBetween(2000, 6000)),
      );
    };
    scheduleTilt();
    return () => timers.forEach((t) => clearTimeout(t));
  }, [open]);

  // Wink every now and then, random interval
  useEffect(() => {
    if (open) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleWink = () => {
      timers.push(
        setTimeout(() => {
          setShowWink(true);
          timers.push(
            setTimeout(() => {
              setShowWink(false);
              scheduleWink();
            }, 220),
          );
        }, randomBetween(3000, 8000)),
      );
    };
    scheduleWink();
    return () => timers.forEach((t) => clearTimeout(t));
  }, [open]);

  useEffect(() => {
    if (open) {
      setTiltDeg(0);
      setShowWink(false);
    }
  }, [open]);

  // Preload wink image so first wink doesn't flash
  useEffect(() => {
    const img = new Image();
    img.src = '/patch-face-wink.png';
  }, []);

  const clampFabOffset = useCallback((next: { x: number; y: number }) => {
    if (typeof window === 'undefined') return next;
    const maxLeft = Math.min(0, -(window.innerWidth - PATCH_BUTTON_SIZE_PX - PATCH_MIN_MARGIN_PX * 2));
    const maxUp = Math.min(0, -(window.innerHeight - PATCH_BUTTON_SIZE_PX - PATCH_MIN_MARGIN_PX * 2));
    return {
      x: Math.max(maxLeft, Math.min(0, next.x)),
      y: Math.max(maxUp, Math.min(0, next.y)),
    };
  }, []);

  // "Tuck near corners, free elsewhere" — if the agent drops Patch close to a
  // corner, ease him into it; otherwise leave him exactly where dropped.
  const snapNearCorner = useCallback((offset: { x: number; y: number }) => {
    if (typeof window === 'undefined') return offset;
    const maxLeft = Math.min(0, -(window.innerWidth - PATCH_BUTTON_SIZE_PX - PATCH_MIN_MARGIN_PX * 2));
    const maxUp = Math.min(0, -(window.innerHeight - PATCH_BUTTON_SIZE_PX - PATCH_MIN_MARGIN_PX * 2));
    const corners = [
      { x: 0, y: 0 },
      { x: maxLeft, y: 0 },
      { x: 0, y: maxUp },
      { x: maxLeft, y: maxUp },
    ];
    const SNAP_THRESHOLD_PX = 96;
    let nearest = offset;
    let nearestDist = SNAP_THRESHOLD_PX;
    for (const corner of corners) {
      const dist = Math.hypot(offset.x - corner.x, offset.y - corner.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = corner;
      }
    }
    return nearest;
  }, []);

  // Restore Patch's saved spot, and keep him on-screen on resize.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(PATCH_OFFSET_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { x?: number; y?: number };
        const clamped = clampFabOffset({
          x: typeof parsed.x === 'number' ? parsed.x : 0,
          y: typeof parsed.y === 'number' ? parsed.y : 0,
        });
        dragX.set(clamped.x);
        dragY.set(clamped.y);
      } catch {
        // Ignore malformed local state and use defaults.
      }
    }
    const handleResize = () => {
      const clamped = clampFabOffset({ x: dragX.get(), y: dragY.get() });
      dragX.set(clamped.x);
      dragY.set(clamped.y);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampFabOffset]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    const handleOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setOpen(true);
      if (detail?.prompt) {
        setInput(detail.prompt);
      }
    };
    window.addEventListener('afl:open-patch-assistant', handleOpenEvent as EventListener);
    return () => window.removeEventListener('afl:open-patch-assistant', handleOpenEvent as EventListener);
  }, []);

  // Replay the meet-Patch reveal on demand (?patchReveal=1, or after a big ship).
  useEffect(() => {
    const handleReveal = () => setShowReveal(true);
    window.addEventListener('afl:patch-reveal', handleReveal);
    return () => window.removeEventListener('afl:patch-reveal', handleReveal);
  }, []);

  // First-meeting reveal: play once for a genuinely new agent (onboarding not yet
  // complete) or when forced via ?patchReveal=1. Veterans mid-work never see it.
  useEffect(() => {
    if (typeof window === 'undefined' || profileLoading) return;
    const forced = new URLSearchParams(window.location.search).get('patchReveal') === '1';
    const seen = window.localStorage.getItem(PATCH_REVEAL_SEEN_KEY) === '1';
    // Auto-play only on the Home dashboard — the reveal is a first-meeting and
    // must never pop up (and block) on Clients/Leads/etc. ?patchReveal=1 still
    // forces it anywhere for previewing.
    if (!forced && (seen || agentProfile.onboardingComplete === true || pathname !== '/dashboard')) return;
    const timer = setTimeout(() => setShowReveal(true), 700);
    return () => clearTimeout(timer);
  }, [profileLoading, agentProfile.onboardingComplete, pathname]);

  // Fetch Google Calendar connection status once, for the calendar nudge.
  // On error we assume connected (suppresses the nudge rather than nagging).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user
      .getIdToken()
      .then((token) =>
        fetch('/api/integrations/google-calendar/status', { headers: { Authorization: `Bearer ${token}` } }),
      )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setCalendarConnected(data ? data.connected === true || data.data?.hasRefreshToken === true : true);
      })
      .catch(() => {
        if (!cancelled) setCalendarConnected(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Just-in-time nudge engine: at most one gentle, earned nudge per session, for
  // established agents only, never while the panel or reveal is up. Dismissed
  // nudges are gone for good (localStorage).
  useEffect(() => {
    if (nudgeShownRef.current || open || showReveal || profileLoading) return;
    // ?nudge=<id> forces a specific nudge so the bubble can be previewed.
    const forcedId =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('nudge') : null;
    if (forcedId) {
      const forced = PATCH_NUDGES.find((n) => n.id === forcedId) ?? PATCH_NUDGES[0];
      const previewTimer = setTimeout(() => {
        setNudge(forced);
        nudgeShownRef.current = true;
      }, 800);
      return () => clearTimeout(previewTimer);
    }
    if (agentProfile.onboardingComplete !== true) return;
    if (calendarConnected === null) return;
    const picked = pickNudge(
      {
        pathname: pathname || '',
        tier: agentProfile.membershipTier || '',
        phonePaired: agentProfile.phonePaired === true,
        calendarConnected: calendarConnected === true,
      },
      getDismissedNudges(),
    );
    if (!picked) return;
    const timer = setTimeout(() => {
      setNudge(picked);
      nudgeShownRef.current = true;
    }, 2500);
    return () => clearTimeout(timer);
  }, [pathname, agentProfile, calendarConnected, open, showReveal, profileLoading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!user || !text.trim() || streaming) return;

      const userMsg: Message = { role: 'user', content: text.trim() };
      captureEvent(ANALYTICS_EVENTS.PATCH_MESSAGE_SENT, { message_length: text.trim().length });
      if (!firstUserMessageReportedRef.current) {
        firstUserMessageReportedRef.current = true;
        onFirstUserMessage?.(text.trim());
      }
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      setStreaming(true);

      const assistantMsg: Message = { role: 'assistant', content: '' };
      setMessages([...newMessages, assistantMsg]);

      try {
        const token = await user.getIdToken();
        abortRef.current = new AbortController();

        const res = await fetch('/api/dashboard-assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            context: {
              page: pathname,
              tier: agentProfile.membershipTier,
              onboardingComplete: agentProfile.onboardingComplete,
            },
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');

        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: accumulated,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Sorry, something went wrong. Please try again.',
          };
          return updated;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [user, messages, streaming, onFirstUserMessage, pathname, agentProfile],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleFabDragEnd = () => {
    suppressClickRef.current = true;
    setDragging(false);
    const settled = snapNearCorner(clampFabOffset({ x: dragX.get(), y: dragY.get() }));
    animateMotionValue(dragX, settled.x, { type: 'spring', stiffness: 520, damping: 34 });
    animateMotionValue(dragY, settled.y, { type: 'spring', stiffness: 520, damping: 34 });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PATCH_OFFSET_STORAGE_KEY, JSON.stringify(settled));
    }
  };

  return (
    <>
      {showReveal && (
        <PatchReveal
          onDone={() => {
            setShowReveal(false);
            if (typeof window !== 'undefined') window.localStorage.setItem(PATCH_REVEAL_SEEN_KEY, '1');
          }}
        />
      )}

      {/* Just-in-time nudge bubble — tethered above the Patch button */}
      <AnimatePresence>
        {nudge && !open && !showReveal && (
          <motion.div
            key="patch-nudge"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-4 md:right-5 bottom-[150px] md:bottom-[74px] z-40 w-[268px] bg-white rounded-[12px] border border-[#e0e0e0] shadow-[0_6px_20px_rgba(0,0,0,0.14)] p-3"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#e1f5ee] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                <PatchMascot size={22} />
              </div>
              <p className="text-[13px] text-[#2a2a2a] leading-snug flex-1">{nudge.message}</p>
              <button
                onClick={() => {
                  dismissNudge(nudge.id);
                  setNudge(null);
                }}
                aria-label="Dismiss tip"
                className="text-[#b0b0b0] hover:text-[#666] shrink-0 p-0.5 -mr-0.5 -mt-0.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-2.5 pl-[38px]">
              <a
                href={nudge.cta.href}
                onClick={(e) => {
                  if (nudge.cta.patchPrompt) {
                    e.preventDefault();
                    window.dispatchEvent(
                      new CustomEvent('afl:open-patch-assistant', { detail: { prompt: nudge.cta.patchPrompt } }),
                    );
                  }
                  dismissNudge(nudge.id);
                  setNudge(null);
                }}
                className="inline-block bg-[#005851] text-white text-[12.5px] font-medium rounded-lg px-3 py-1.5 hover:bg-[#003d38] transition-colors"
              >
                {nudge.cta.label}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating mascot button */}
      <motion.button
        data-onboarding-target="patch-launcher"
        style={{ x: dragX, y: dragY, pointerEvents: showReveal ? 'none' : 'auto', touchAction: 'none', userSelect: 'none' }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setOpen((prev) => {
            const next = !prev;
            if (next && messages.length === 0) {
              captureEvent(ANALYTICS_EVENTS.PATCH_CONVERSATION_STARTED, { entry: 'floating_button' });
            }
            return next;
          });
        }}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => {
          suppressClickRef.current = true;
          setDragging(true);
        }}
        onDragEnd={handleFabDragEnd}
        className={`fixed bottom-24 md:bottom-5 right-4 md:right-5 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-transparent border p-0 transition-shadow ${
          dragging
            ? 'cursor-grabbing border-[#1D9E75] ring-4 ring-[#1D9E75]/70 shadow-[0_16px_40px_rgba(0,0,0,0.32)]'
            : 'cursor-grab border-gray-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.15)]'
        }`}
        animate={{ rotate: open ? 0 : tiltDeg, scale: dragging ? 1.22 : 1, opacity: showReveal ? 0 : 1 }}
        transition={{
          opacity: { duration: 0.3 },
          rotate: { duration: 0.35, ease: 'easeInOut' },
          scale: { type: 'spring', stiffness: 500, damping: 22 },
        }}
        whileHover={{ scale: dragging ? 1.22 : 1.08 }}
        aria-label={open ? 'Close Patch' : 'Open Patch'}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.svg
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-6 h-6 text-[#2a2a2a]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </motion.svg>
          ) : (
            <MotionDiv
              key="mascot"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ scale: { duration: 0.15 }, opacity: { duration: 0.15 } }}
            >
              <PatchMascot size={44} animated winkTrigger={showWink} />
            </MotionDiv>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            data-onboarding-surface="patch-panel"
            className="fixed bottom-[128px] md:bottom-[60px] right-4 md:right-5 z-50 w-[calc(100vw-2rem)] max-w-[380px] max-h-[60vh] md:max-h-[520px] bg-white rounded-[12px] shadow-2xl border border-[#e0e0e0] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#005851] text-white shrink-0">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                <PatchMascot size={28} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold leading-tight">Patch</h3>
                <p className="text-[11px] text-white/70">Dashboard assistant</p>
              </div>
              <button
                onClick={() => {
                  setMessages([]);
                  setInput('');
                }}
                className="text-white/60 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                title="Clear conversation"
              >
                Clear
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center text-center pt-4 pb-2">
                  <div className="mb-3 opacity-80">
                    <PatchMascot size={40} />
                  </div>
                  <p className="text-sm text-[#505050] font-medium mb-1">
                    Hi! I&apos;m Patch.
                  </p>
                  <p className="text-xs text-[#888] mb-4">
                    Ask me anything about the dashboard.
                  </p>
                  <div className="w-full space-y-2">
                    {getSuggestedQuestions(pathname).map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="w-full text-left text-sm px-3 py-2 rounded-[8px] border border-[#e4e4e4] text-[#333] hover:bg-[#f4faf9] hover:border-[#44bbaa] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-[10px] ${
                        msg.role === 'user'
                          ? 'bg-[#005851] text-white text-sm'
                          : 'bg-[#f1f1f1] text-[#1a1a1a]'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <AssistantMessage content={msg.content} />
                        ) : (
                          <div className="flex items-center gap-1 py-1">
                            <span className="w-1.5 h-1.5 bg-[#44bbaa] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-[#44bbaa] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-[#44bbaa] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="shrink-0 border-t border-[#e4e4e4] px-3 py-2.5 flex items-center gap-2 bg-white"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about the dashboard..."
                disabled={streaming}
                className="flex-1 text-sm px-3 py-2 rounded-[8px] border border-[#d0d0d0] focus:outline-none focus:border-[#44bbaa] focus:ring-1 focus:ring-[#44bbaa]/30 disabled:opacity-50 text-[#1a1a1a] placeholder:text-[#aaa]"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="w-8 h-8 rounded-[6px] bg-[#005851] hover:bg-[#003d38] disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
