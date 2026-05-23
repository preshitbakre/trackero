import { useEffect } from 'react';
import { KEYMAP } from '../../lib/keymap';

interface ShortcutsHelpProps {
  onClose: () => void;
}

/**
 * Keyboard-shortcuts modal. AppShell owns the open/close state and
 * mounts this component conditionally; the content is driven entirely
 * by `lib/keymap.ts` so the help dialog and the actual wiring stay in
 * lockstep.
 */
export function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
  useEffect(() => {
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40" onClick={onClose} />
      <div className="fixed top-[14%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg bg-card dark:bg-dneutral-100 rounded-xl shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[24px] font-serif italic text-text dark:text-dneutral-700">
            Keyboard shortcuts.
          </h2>
          <button
            onClick={onClose}
            aria-label="Close shortcuts"
            className="text-[14px] text-mute hover:text-text"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          {KEYMAP.map((section) => (
            <section key={section.title}>
              <h3 className="text-[10px] font-serif font-semibold uppercase tracking-[0.18em] text-faint mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.entries.map((s) => (
                  <li key={s.key} className="flex items-center justify-between">
                    <span className="text-[14px] text-mute dark:text-dneutral-600">
                      {s.label}
                    </span>
                    <kbd className="text-[11px] bg-paper dark:bg-dneutral-200 border border-rule dark:border-dneutral-300 px-2 py-0.5 rounded font-mono text-mute dark:text-dneutral-600">
                      {s.key}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-5 pt-3 border-t border-rule text-[11px] text-faint text-right">
          Press <kbd className="bg-paper border border-rule px-1.5 py-0.5 rounded font-mono">Esc</kbd> to close
        </div>
      </div>
    </>
  );
}
