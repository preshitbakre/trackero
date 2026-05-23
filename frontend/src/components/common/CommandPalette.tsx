import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#7C5CFC35', text: '#4A2FC0' },
  story:   { bg: '#88A9D640', text: '#2E5A8E' },
  task:    { bg: '#D6B58840', text: '#7A5E2A' },
  subtask: { bg: '#A8A19A35', text: '#5C5650' },
};

interface SearchResult {
  id: number;
  itemType?: string;
  taskKey: string;
  title: string;
  projectName: string;
  projectId: number;
  status: { name: string; color: string };
}

function getNavigationPath(r: SearchResult): string {
  const type = r.itemType || 'task';
  if (type === 'epic') return `/projects/${r.projectId}/epics/${r.id}`;
  if (type === 'story') return `/projects/${r.projectId}/stories/${r.id}`;
  return `/projects/${r.projectId}/tasks/${r.id}`;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let ignored = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.get(`/search?q=${encodeURIComponent(query)}`);
        if (ignored) return;
        setResults(data.data.list || []);
        setSelectedIndex(0);
      } catch (err) { console.error(err); }
    }, 200);
    return () => {
      ignored = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && results[selectedIndex]) {
      navigate(getNavigationPath(results[selectedIndex]));
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-neutral-700/50" onClick={onClose} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg bg-white dark:bg-dneutral-100 rounded-xl shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="flex items-center px-4 border-b border-neutral-200 dark:border-dneutral-300">
          <svg className="w-4 h-4 text-neutral-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search epics, stories, tasks..."
            className="flex-1 py-3 text-[16px] bg-transparent outline-none text-neutral-700 dark:text-dneutral-700 placeholder-neutral-400"
          />
        </div>

        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map((r, i) => {
              const typeStyle = TYPE_STYLES[r.itemType || 'task'] || TYPE_STYLES.task;
              return (
                <button
                  key={r.id}
                  onClick={() => { navigate(getNavigationPath(r)); onClose(); }}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 ${
                    i === selectedIndex ? 'bg-lilac-tint text-lilac-dark' : 'text-neutral-600 dark:text-dneutral-600 hover:bg-neutral-100 dark:hover:bg-dneutral-200'
                  }`}
                >
                  <span
                    className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
                  >
                    {(r.itemType || 'task').slice(0, r.itemType === 'subtask' ? 3 : undefined)}
                  </span>
                  <span className="text-[14px] font-mono text-neutral-400 flex-shrink-0">{r.taskKey}</span>
                  <span className="text-[16px] flex-1 truncate">{r.title}</span>
                  <span className="text-[12px] text-neutral-400 flex-shrink-0">{r.projectName}</span>
                </button>
              );
            })}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && (
          <div className="p-4 text-center text-[14px] text-faint">
            No matches for &ldquo;{query}&rdquo;.
          </div>
        )}

        {query.length < 2 && (
          <div className="p-4 text-center text-[16px] text-neutral-400">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </>
  );
}
