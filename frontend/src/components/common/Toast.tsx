import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'warning' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let addToastFn: ((message: string, type?: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = 'success') {
  if (addToastFn) addToastFn(message, type);
}

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-l-4 border-mint dark:border-mint-dm bg-mint-light dark:bg-mint-dm/30 text-neutral-700 dark:text-mint-dm',
  warning: 'border-l-4 border-tan dark:border-tan-dm bg-tan-light dark:bg-tan-dm/30 text-neutral-600 dark:text-tan-dm',
  error: 'border-l-4 border-danger bg-red-50 dark:bg-red-950/30 text-danger',
  info: 'border-l-4 border-peri dark:border-peri-dm bg-peri-light dark:bg-peri-dm/30 text-neutral-700 dark:text-peri-dm',
};

let nextId = 0;

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
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
