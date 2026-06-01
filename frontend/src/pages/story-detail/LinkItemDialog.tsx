import { useState, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { Button } from '../../components/ui/Button';
import { TypeTag } from '../../components/ui/TypeTag';
import type { TypeTagKind } from '../../components/ui/TypeTag';

interface Props {
  projectId: number;
  storyId: number;
  onLinked: () => void;
  onClose: () => void;
}

const PAGE_SIZE = 20;

export function LinkItemDialog({ projectId, storyId, onLinked, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const seqRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (q: string, p: number, seq: number) => {
    const params = q.length >= 2
      ? `search=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&page=${p}&itemType=task,bug`
      : `limit=${PAGE_SIZE}&page=${p}&sort=updatedAt&order=DESC&itemType=task,bug`;
    const { data } = await apiClient.get(`/projects/${projectId}/items?${params}`);
    if (seq !== seqRef.current) return null;
    const list = (data.data.list || []).filter((t: any) => t.id !== storyId);
    const total = data.data.total ?? 0;
    return { list, hasMore: p * PAGE_SIZE < total };
  }, [projectId, storyId]);

  const search = async (q: string) => {
    setQuery(q);
    setSearching(true);
    setPage(1);
    const seq = ++seqRef.current;
    try {
      const result = await fetchPage(q, 1, seq);
      if (!result) return;
      setResults(result.list);
      setHasMore(result.hasMore);
    } catch { /* ignore */ }
    if (seq === seqRef.current) setSearching(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const seq = seqRef.current;
    try {
      const result = await fetchPage(query, nextPage, seq);
      if (!result) return;
      setResults((prev) => [...prev, ...result.list]);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  const link = async (itemId: number) => {
    setLinking(itemId);
    try {
      await apiClient.post(`/projects/${projectId}/items/${itemId}/associations`, {
        linkedItemId: storyId,
        linkType: 'belongs_to',
      });
      toast('Item linked to story');
      onLinked();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to link item', 'error');
    }
    setLinking(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/20" />
      <div
        className="relative bg-card border border-rule shadow-lg w-[480px] max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-rule bg-paper-2">
          <h3 className="text-[14px] font-semibold text-text mb-2">Link existing item</h3>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => search(e.target.value)}
              onFocus={() => { if (results.length === 0) search(''); }}
              placeholder="Search tasks and bugs…"
              autoFocus
              className="w-full h-[32px] text-[13px] pl-8 pr-3 bg-card border border-rule text-text placeholder:text-faint outline-none"
            />
          </div>
        </div>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMore();
          }}
        >
          {searching && results.length === 0 && (
            <p className="text-[13px] text-faint px-4 py-6 text-center">Searching…</p>
          )}
          {!searching && results.length === 0 && query.length > 0 && (
            <p className="text-[13px] text-faint px-4 py-6 text-center">No items found</p>
          )}
          {!searching && results.length === 0 && query.length === 0 && (
            <p className="text-[13px] text-faint px-4 py-6 text-center">Type to search for tasks and bugs</p>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => link(item.id)}
              disabled={linking === item.id}
              className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 border-b border-rule/60 last:border-b-0 hover:bg-lilac-tint transition-colors disabled:opacity-50"
            >
              <TypeTag kind={(item.itemType || 'task') as TypeTagKind} />
              <span className="font-mono text-[12px] text-mute flex-shrink-0">{item.itemKey}</span>
              <span className="text-[13px] text-text truncate flex-1">{item.title}</span>
              {item.status && (
                <span className="text-[11px] text-faint flex-shrink-0">{item.status.name}</span>
              )}
            </button>
          ))}
          {loadingMore && <p className="text-[12px] text-faint px-4 py-2 text-center">Loading more…</p>}
        </div>

        <div className="px-4 py-3 border-t border-rule">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
