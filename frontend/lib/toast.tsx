import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

/** enter: just added (slides in); shown: resting; leave: closing (slides out and the space folds away). */
type ToastPhase = 'enter' | 'shown' | 'leave';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  phase: ToastPhase;
  /** How long it stays, for the countdown bar. */
  ms: number;
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

const TONE: Record<ToastTone, { accent: string; icon: string; title: string; path: string }> = {
  success: { accent: 'bg-emerald-500', icon: 'text-emerald-600 bg-emerald-50', title: 'Done', path: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  error: { accent: 'bg-red-500', icon: 'text-red-600 bg-red-50', title: 'Something went wrong', path: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z' },
  warning: { accent: 'bg-amber-500', icon: 'text-amber-600 bg-amber-50', title: 'Please check', path: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z' },
  info: { accent: 'bg-sky-500', icon: 'text-sky-600 bg-sky-50', title: 'Note', path: 'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z' },
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
  const recent = useRef(new Map<string, number>());
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
      // Checked against a list kept right here, not the rendered one: two calls in the same instant would both look new otherwise.
      const key = `${tone}:${message}`;
      const last = recent.current.get(key) ?? 0;
      if (Date.now() - last < 2000 || itemsRef.current.some((t) => t.message === message && t.tone === tone && t.phase !== 'leave')) return;
      recent.current.set(key, Date.now());
      const id = nextId.current++;
      // First in, first out: close after its own time, but never before the toast before it.
      const closeAt = Math.max(Date.now() + DURATION_MS[tone], lastCloseAt.current + CLOSE_GAP_MS);
      lastCloseAt.current = closeAt;
      const ms = closeAt - Date.now();
      setItems((prev) => {
        // Too many on screen: the oldest one closes first.
        const open = prev.filter((t) => t.phase !== 'leave');
        if (open.length >= MAX_VISIBLE) window.setTimeout(() => dismiss(open[0].id), 0);
        return [...prev, { id, tone, message, phase: 'enter' as const, ms }];
      });
      // Next frame: move to the resting place, which plays the slide-in.
      window.setTimeout(() => setItems((prev) => prev.map((t) => (t.id === id && t.phase === 'enter' ? { ...t, phase: 'shown' as const } : t))), 30);
      window.setTimeout(() => dismiss(id), ms);
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
      <style>{`@keyframes toast-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col">
        {items.map((t) => {
          const tone = TONE[t.tone];
          return (
            // The row grows in and folds away (grid rows 0fr <-> 1fr) so the toasts below slide up smoothly.
            <div key={t.id} className={`grid transition-all duration-300 ease-out ${t.phase === 'shown' ? 'translate-x-0 grid-rows-[1fr] opacity-100' : 'translate-x-10 grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden px-1 pb-3 pt-0.5">
                <div role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl bg-white py-3 pl-5 pr-3 shadow-lg ring-1 ring-gray-900/10">
                  <span className={`absolute inset-y-0 left-0 w-1.5 ${tone.accent}`} />
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={tone.path} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm font-semibold leading-5 text-gray-900">{tone.title}</p>
                    <p className="mt-0.5 break-words text-sm leading-5 text-gray-600">{t.message}</p>
                  </div>
                  <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-0.5 mt-0.5 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                  {/* Time left before it closes. */}
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 origin-left ${tone.accent} opacity-60`} style={{ animation: `toast-countdown ${t.ms}ms linear forwards` }} />
                </div>
              </div>
            </div>
          );
        })}
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
