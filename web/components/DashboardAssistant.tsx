'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

const MotionDiv = motion.div;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DashboardAssistantProps {
  onFirstUserMessage?: (message: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'How do I add clients?',
  'How do referrals work?',
  'What are conservation alerts?',
  'Where do I change my branding?',
];

const LINK_REGEX = /(\[[^\]]+\]\([^)]+\))/g;
const LINK_MATCH_REGEX = /^\[([^\]]+)\]\(([^)]+)\)$/;
const BOLD_REGEX = /(\*\*[^*]+\*\*)/g;
const BOLD_MATCH_REGEX = /^\*\*([^*]+)\*\*$/;
const PATCH_DRAG_HOLD_MS = 280;
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
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: showWink ? 0 : 1 }}
        />
        <img
          src="/patch-face-wink.png"
          alt="Patch winking"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: showWink ? 1 : 0 }}
        />
      </div>
    );
  }
  return (
    <img
      src="/patch-face.png"
      alt="Patch"
      style={{ width: size, height: size }}
      className="object-contain"
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
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const [showCaption, setShowCaption] = useState(false);
  const [bgVisible, setBgVisible] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  // Delta from screen center to Patch's bottom-right resting spot — he genies in
  // from there and tucks back to it, so the handoff to the real FAB is seamless.
  const cornerDelta = () => {
    if (typeof window === 'undefined') return { x: 240, y: 240 };
    const margin = 24;
    return {
      x: window.innerWidth / 2 - PATCH_BUTTON_SIZE_PX / 2 - margin,
      y: window.innerHeight / 2 - PATCH_BUTTON_SIZE_PX / 2 - margin,
    };
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const corner = cornerDelta();
      setBgVisible(true);
      if (reduce) {
        await controls.start({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, transition: { duration: 0.3 } });
      } else {
        await controls.start({
          x: 0,
          y: 0,
          opacity: 1,
          scaleX: [0.5, 0.72, 1],
          scaleY: [0.5, 1.28, 1],
          transition: { duration: 0.85, ease: [0.42, 0, 0.2, 1], times: [0, 0.5, 1] },
        });
      }
      if (cancelled) return;
      setShowCaption(true);
      await new Promise((resolve) => setTimeout(resolve, 2400));
      if (cancelled) return;
      setShowCaption(false);
      setBgVisible(false);
      if (reduce) {
        await controls.start({ opacity: 0, transition: { duration: 0.3 } });
      } else {
        await controls.start({
          x: corner.x,
          y: corner.y,
          opacity: 0,
          scaleX: [1, 0.72, 0.42],
          scaleY: [1, 1.28, 0.42],
          transition: { duration: 0.8, ease: [0.42, 0, 0.2, 1], times: [0, 0.45, 1] },
        });
      }
      if (cancelled) return;
      finish();
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const corner = cornerDelta();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-label="Meet Patch">
      <motion.div
        className="absolute inset-0 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: bgVisible ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        onClick={finish}
      />
      <div className="relative flex flex-col items-center" style={{ pointerEvents: 'none' }}>
        <motion.div
          initial={{ x: corner.x, y: corner.y, scaleX: 0.5, scaleY: 0.5, opacity: 0 }}
          animate={controls}
          style={{ transformOrigin: 'bottom right' }}
        >
          <PatchMascot size={104} />
        </motion.div>
        <AnimatePresence>
          {showCaption && (
            <motion.div
              key="patch-reveal-caption"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.4 }}
              className="mt-5 max-w-[300px] text-center px-4"
            >
              <p className="text-white text-[15px] font-medium leading-snug">Hi, I&apos;m Patch — your guide.</p>
              <p className="text-white/85 text-sm leading-snug mt-1">
                You don&apos;t have to memorize any of this. Ask me anything, anytime.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function DashboardAssistant({ onFirstUserMessage }: DashboardAssistantProps) {
  const { user, agentProfile, profileLoading } = useDashboard();
  const [open, setOpen] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [showWink, setShowWink] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const [fabOffset, setFabOffset] = useState({ x: 0, y: 0 });
  const [dragArmed, setDragArmed] = useState(false);
  const [enableSnapAnim, setEnableSnapAnim] = useState(false);
  const firstUserMessageReportedRef = useRef(false);

  // Tilt: two 10deg nods back-to-back, then rest, then random delay and repeat
  useEffect(() => {
    if (open) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleTilt = () => {
      timers.push(
        setTimeout(() => {
          setTiltDeg(10);
          timers.push(setTimeout(() => {
            setTiltDeg(0);
            timers.push(setTimeout(() => {
              setTiltDeg(10);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(PATCH_OFFSET_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      const x = typeof parsed.x === 'number' ? parsed.x : 0;
      const y = typeof parsed.y === 'number' ? parsed.y : 0;
      setFabOffset(clampFabOffset({ x, y }));
    } catch {
      // Ignore malformed local state and use defaults.
    }
  }, [clampFabOffset]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PATCH_OFFSET_STORAGE_KEY, JSON.stringify(fabOffset));
  }, [fabOffset]);

  useEffect(() => {
    const handleResize = () => {
      setFabOffset((prev) => clampFabOffset(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampFabOffset]);

  const clearDragHoldTimer = useCallback(() => {
    if (!dragHoldTimerRef.current) return;
    clearTimeout(dragHoldTimerRef.current);
    dragHoldTimerRef.current = null;
  }, []);

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
    if (!forced && (seen || agentProfile.onboardingComplete === true)) return;
    const timer = setTimeout(() => setShowReveal(true), 700);
    return () => clearTimeout(timer);
  }, [profileLoading, agentProfile.onboardingComplete]);

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
    [user, messages, streaming, onFirstUserMessage],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleFabPointerDown = () => {
    clearDragHoldTimer();
    dragHoldTimerRef.current = setTimeout(() => {
      setDragArmed(true);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(8);
      }
    }, PATCH_DRAG_HOLD_MS);
  };

  const handleFabPointerUpOrCancel = () => {
    clearDragHoldTimer();
    setDragArmed(false);
  };

  const handleFabDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    suppressClickRef.current = true;
    setDragArmed(false);
    setEnableSnapAnim(true);
    setFabOffset((prev) => snapNearCorner(clampFabOffset({ x: prev.x + info.offset.x, y: prev.y + info.offset.y })));
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

      {/* Floating mascot button */}
      <motion.button
        data-onboarding-target="patch-launcher"
        style={{ pointerEvents: showReveal ? 'none' : 'auto' }}
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
        onPointerDown={handleFabPointerDown}
        onPointerUp={handleFabPointerUpOrCancel}
        onPointerCancel={handleFabPointerUpOrCancel}
        drag={dragArmed}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => {
          suppressClickRef.current = true;
        }}
        onDragEnd={handleFabDragEnd}
        className={`fixed bottom-24 md:bottom-5 right-4 md:right-5 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-transparent border p-0 transition-shadow ${
          dragArmed
            ? 'border-[#3DD6C3] ring-2 ring-[#3DD6C3]/60 shadow-[0_12px_30px_rgba(0,0,0,0.22)]'
            : 'border-gray-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.15)]'
        }`}
        animate={{ rotate: open ? 0 : tiltDeg, x: fabOffset.x, y: fabOffset.y, scale: dragArmed ? 1.1 : 1, opacity: showReveal ? 0 : 1 }}
        transition={{
          opacity: { duration: 0.3 },
          rotate: { duration: 0.35, ease: 'easeInOut' },
          scale: { type: 'spring', stiffness: 500, damping: 28 },
          x: enableSnapAnim ? { type: 'spring', stiffness: 520, damping: 34 } : { duration: 0 },
          y: enableSnapAnim ? { type: 'spring', stiffness: 520, damping: 34 } : { duration: 0 },
        }}
        whileHover={{ scale: dragArmed ? 1.1 : 1.08 }}
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
                    {SUGGESTED_QUESTIONS.map((q) => (
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
