'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';

export interface PanelPosition {
  left: number;
  top: number;
}

interface UseDraggablePanelResult {
  /** Attach to the panel container so we can measure + clamp it. */
  panelRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the panel container's style: docked (bottom/right) until dragged, then absolute left/top. */
  positionStyle: CSSProperties;
  /** Spread onto the drag-handle element (e.g. the panel header). */
  dragHandleProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    style: CSSProperties;
  };
  dragging: boolean;
  /** Has the panel been moved off its default docked position? */
  moved: boolean;
  /** Snap back to the default docked corner and forget the saved spot. */
  resetPosition: () => void;
  /** Re-clamp into the current viewport — call when the panel (re)opens. */
  revalidate: () => void;
}

// Matches the panel's docked inset (1rem) and is reused as the on-screen margin.
const MARGIN = 16;
// Fallback width when the panel hasn't been measured yet (matches the design width).
const FALLBACK_WIDTH = 380;

/**
 * Makes a fixed-position floating panel draggable by a handle, persisting the
 * landing spot per-device in localStorage. Position is screen-specific, so we
 * deliberately keep it device-local rather than syncing it to the agent's
 * Firestore profile. The panel always starts docked bottom-right (the original
 * behavior) until the agent drags it.
 */
export function useDraggablePanel(storageKey: string): UseDraggablePanelResult {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<PanelPosition | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        return parsed as PanelPosition;
      }
    } catch {
      /* ignore malformed/blocked storage */
    }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  // Keep a candidate position fully on-screen, accounting for the panel's
  // measured size (falls back to the design width before first measure).
  const clamp = useCallback((left: number, top: number): PanelPosition => {
    const el = panelRef.current;
    const w = el?.offsetWidth || FALLBACK_WIDTH;
    const h = el?.offsetHeight || 0;
    const maxLeft = Math.max(MARGIN, window.innerWidth - w - MARGIN);
    const maxTop = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    return {
      left: Math.min(Math.max(MARGIN, left), maxLeft),
      top: Math.min(Math.max(MARGIN, top), maxTop),
    };
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const el = panelRef.current;
    if (!el) return;
    // Let clicks on real controls in the handle (close button, links) behave.
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    // Pin to the current on-screen spot up front so the first move doesn't jump
    // (the panel may have been docked via bottom/right until now).
    setPos({ left: rect.left, top: rect.top });
    setDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    e.preventDefault();
  }, []);

  // Drag move/end listeners live on window so the drag survives the pointer
  // briefly leaving the handle.
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st || e.pointerId !== st.pointerId) return;
      setPos(clamp(e.clientX - st.offsetX, e.clientY - st.offsetY));
    };
    const handleUp = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st || e.pointerId !== st.pointerId) return;
      dragState.current = null;
      setDragging(false);
      setPos((prev) => {
        if (prev) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(prev));
          } catch {
            /* ignore blocked storage */
          }
        }
        return prev;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, clamp, storageKey]);

  // Re-clamp into view when the window resizes (smaller window, rotate, etc.).
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((p) => (p ? clamp(p.left, p.top) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, clamp]);

  const revalidate = useCallback(() => {
    setPos((p) => (p ? clamp(p.left, p.top) : p));
  }, [clamp]);

  const resetPosition = useCallback(() => {
    setPos(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore blocked storage */
    }
  }, [storageKey]);

  const positionStyle: CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { bottom: '1rem', right: '1rem' };

  const dragHandleProps = {
    onPointerDown,
    style: {
      cursor: dragging ? 'grabbing' : 'grab',
      touchAction: 'none' as const,
    } satisfies CSSProperties as CSSProperties,
  };

  return {
    panelRef,
    positionStyle,
    dragHandleProps,
    dragging,
    moved: pos !== null,
    resetPosition,
    revalidate,
  };
}
