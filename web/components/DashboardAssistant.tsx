'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../app/dashboard/DashboardContext';

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

function parseLinks(text: string): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
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

    return part.split(/(\*\*[^*]+\*\*)/).map((seg, j) => {
      const boldMatch = seg.match(/^\*\*([^*]+)\*\*$/);
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
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-150"
          style={{ opacity: showWink ? 0 : 1 }}
        />
        <img
          src="/patch-face-wink.png"
          alt="Patch winking"
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-150"
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

  // Subtle tilt: 7° clockwise then back, on random intervals (only when button shows mascot)
  useEffect(() => {
    if (open) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleTilt = () => {
      timers.push(
        setTimeout(() => {
          setTiltDeg(7);
          timers.push(
            setTimeout(() => {
              setTiltDeg(0);
              scheduleTilt();
            }, 350),
          );
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

  return (
    <>
      {/* Floating mascot button */}
      <motion.button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-50 w-11 h-11 rounded-full flex items-center justify-center bg-transparent border border-gray-200/80 shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.15)] p-0 transition-shadow"
        animate={{ rotate: open ? 0 : tiltDeg }}
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
            <motion.div
              key="mascot"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ scale: { duration: 0.15 }, opacity: { duration: 0.15 } }
            >
              <PatchMascot size={44} animated winkTrigger={showWink} />
            </motion.div>
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
            className="fixed bottom-[60px] right-5 z-50 w-[380px] max-h-[520px] bg-white rounded-[12px] shadow-2xl border border-[#e0e0e0] flex flex-col overflow-hidden"
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
