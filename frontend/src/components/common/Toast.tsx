import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'warning' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type AddToastFn = (message: string, type?: ToastType) => void;

// Subscriber set (approach A): supports zero, one, or many concurrent
// ToastProviders without clobbering. In practice we mount one provider at the
// app root, but HMR / tests / accidental double-mounts no longer break toasts.
const subscribers: Set<AddToastFn> = new Set();

export function toast(message: string, type: ToastType = 'success') {
  // Iterate a snapshot so a subscriber that unsubscribes mid-iteration is safe.
  for (const fn of Array.from(subscribers)) {
    fn(message, type);
  }
}

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-l-4 border-mint bg-mint-light text-neutral-700',
  warning: 'border-l-4 border-tan bg-tan-light text-neutral-600',
  error: 'border-l-4 border-danger bg-red-50 text-danger',
  info: 'border-l-4 border-lilac bg-lilac-tint text-neutral-700',
};

let nextId = 0;

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Track pending self-expiry timers so we can clear them on unmount and
  // avoid setState-on-unmounted warnings / leaked timers.
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback<AddToastFn>((message, type = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    const handle = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
    timersRef.current.set(id, handle);
  }, []);

  useEffect(() => {
    subscribers.add(addToast);
    const timers = timersRef.current;
    return () => {
      subscribers.delete(addToast);
      // Clear any in-flight self-expiry timers belonging to this provider.
      for (const handle of timers.values()) {
        clearTimeout(handle);
      }
      timers.clear();
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-[16px] font-medium animate-slide-in ${TOAST_STYLES[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
