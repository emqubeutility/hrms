import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

/** enter: just added (slides in); shown: resting; leave: closing (slides out and the space folds away). */
type ToastPhase = 'enter' | 'shown' | 'leave';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  phase: ToastPhase;
}

const EXIT_MS = 300;
const MAX_VISIBLE = 5;
/** The gap kept between two toasts closing, so they leave one after the other in the order they came. */
const CLOSE_GAP_MS = 500;

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS: Record<ToastTone, number> = { success: 3500, info: 3500, warning: 5000, error: 6000 };

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-700',
};

/**
 * Lets code outside React (the API client) show a toast. The provider registers itself here when it is on screen;
 * before that, or on the server, calls do nothing.
 */
let bridge: ToastApi | null = null;
export const toastBridge = {
  success: (m: string) => bridge?.success(m),
  error: (m: string) => bridge?.error(m),
};

/** Provides `useToast()`: short messages that appear at the top right and go away by themselves. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const itemsRef = useRef<ToastItem[]>([]);
  itemsRef.current = items;

  /** The time the last toast is due to close; a newer toast never closes before an older one. */
  const lastCloseAt = useRef(0);

  /** Closes a toast with the leaving animation, then removes it. */
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id && t.phase !== 'leave' ? { ...t, phase: 'leave' as const } : t)));
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      if (!message) return;
      // The same message already on screen (a bulk action calling the API many times): show it once.
      if (itemsRef.current.some((t) => t.message === message && t.tone === tone && t.phase !== 'leave')) return;
      const id = nextId.current++;
      setItems((prev) => {
        // Too many on screen: the oldest one closes first.
        const open = prev.filter((t) => t.phase !== 'leave');
        if (open.length >= MAX_VISIBLE) window.setTimeout(() => dismiss(open[0].id), 0);
        return [...prev, { id, tone, message, phase: 'enter' as const }];
      });
      // Next frame: move to the resting place, which plays the slide-in.
      window.setTimeout(() => setItems((prev) => prev.map((t) => (t.id === id && t.phase === 'enter' ? { ...t, phase: 'shown' as const } : t))), 30);
      // First in, first out: close after its own time, but never before the toast before it.
      const closeAt = Math.max(Date.now() + DURATION_MS[tone], lastCloseAt.current + CLOSE_GAP_MS);
      lastCloseAt.current = closeAt;
      window.setTimeout(() => dismiss(id), closeAt - Date.now());
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      info: (m) => show(m, 'info'),
      warning: (m) => show(m, 'warning'),
      error: (m) => show(m, 'error'),
    }),
    [show],
  );

  useEffect(() => {
    bridge = api;
    return () => {
      if (bridge === api) bridge = null;
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col">
        {items.map((t) => (
          // The row grows in and folds away (grid rows 0fr <-> 1fr) so the toasts below slide up smoothly.
          <div key={t.id} className={`grid transition-all duration-300 ease-out ${t.phase === 'shown' ? 'translate-x-0 grid-rows-[1fr] opacity-100' : 'translate-x-10 grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
              <div
                role={t.tone === 'error' ? 'alert' : 'status'}
                className={`pointer-events-auto mb-2 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${TONE_CLASS[t.tone]}`}
              >
                <span className="min-w-0 break-words">{t.message}</span>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 text-base leading-none opacity-60 hover:opacity-100">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Use inside the app: `const toast = useToast(); toast.success('Saved');` */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
