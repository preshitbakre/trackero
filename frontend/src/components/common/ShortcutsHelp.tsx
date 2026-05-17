import { useState, useEffect } from 'react';

export function ShortcutsHelp() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    document.addEventListener('show-shortcuts-help', handler);
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    window.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('show-shortcuts-help', handler);
      window.removeEventListener('keydown', escHandler);
    };
  }, []);

  if (!show) return null;

  const shortcuts = [
    { key: 'C', description: 'Create new task' },
    { key: '/', description: 'Focus search' },
    { key: '\u2318K', description: 'Command palette' },
    { key: 'G then B', description: 'Go to board' },
    { key: 'G then L', description: 'Go to backlog' },
    { key: 'G then S', description: 'Go to sprints' },
    { key: 'G then E', description: 'Go to epics' },
    { key: 'M', description: 'Assign to me' },
    { key: 'Esc', description: 'Close panel/modal' },
    { key: '?', description: 'Show this help' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-neutral-700/50" onClick={() => setShow(false)} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-neutral-50 dark:bg-dneutral-100 rounded-xl shadow-2xl p-6 border border-neutral-200 dark:border-dneutral-300">
        <h2 className="text-lg font-bold text-neutral-700 dark:text-dneutral-700 mb-4">Keyboard Shortcuts</h2>
        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-neutral-500 dark:text-dneutral-600">{s.description}</span>
              <kbd className="text-sm bg-neutral-100 dark:bg-dneutral-200 px-2 py-1 rounded font-mono text-neutral-600 dark:text-dneutral-600">{s.key}</kbd>
            </div>
          ))}
        </div>
        <button onClick={() => setShow(false)} className="mt-4 w-full text-center text-sm text-neutral-400 hover:text-neutral-500">Press Esc to close</button>
      </div>
    </>
  );
}
