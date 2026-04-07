'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { useDashboard } from '../app/dashboard/DashboardContext';
import { captureEvent } from '../lib/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics-events';

const MotionDiv = motion.div;

interface Message {
  role: 'user' | 'assistant';
  content: string;
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

export default function DashboardAssistant() {
  const { user } = useDashboard();
  const [open, setOpen] = useState(false);
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

  const sendMessage = useCallback(
    async (text: string) => {
      if (!user || !text.trim() || streaming) return;

      const userMsg: Message = { role: 'user', content: text.trim() };
      captureEvent(ANALYTICS_EVENTS.PATCH_MESSAGE_SENT, { message_length: text.trim().length });
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
    [user, messages, streaming],
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
    setFabOffset((prev) => clampFabOffset({ x: prev.x + info.offset.x, y: prev.y + info.offset.y }));
  };

  return (
    <>
      {/* Floating mascot button */}
      <motion.button
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
        className="fixed bottom-24 md:bottom-5 right-4 md:right-5 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-transparent border border-gray-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.15)] p-0 transition-shadow"
        animate={{ rotate: open ? 0 : tiltDeg, x: fabOffset.x, y: fabOffset.y }}
        transition={{ rotate: { duration: 0.35, ease: 'easeInOut' } }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
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
