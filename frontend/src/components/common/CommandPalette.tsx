import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';

interface SearchResult {
  id: number;
  taskKey: string;
  title: string;
  projectName: string;
  projectId: number;
  status: { name: string; color: string };
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
    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(data.data.list || []);
        setSelectedIndex(0);
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
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
      const r = results[selectedIndex];
      navigate(`/projects/${r.projectId}/board`);
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
          <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, projects, actions..."
            className="flex-1 py-3 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-50 placeholder-gray-400"
          />
        </div>

        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => { navigate(`/projects/${r.projectId}/board`); onClose(); }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 ${
                  i === selectedIndex ? 'bg-brand/10 text-brand' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="text-xs font-mono text-gray-400">{r.taskKey}</span>
                <span className="text-sm flex-1 truncate">{r.title}</span>
                <span className="text-xs text-gray-400">{r.projectName}</span>
              </button>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-400">No results found</div>
        )}

        {query.length < 2 && (
          <div className="p-4 text-center text-xs text-gray-400">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </>
  );
}
