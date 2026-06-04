import { useState, useEffect, useCallback, useRef } from 'react';
import { Filter, Search, X } from 'lucide-react';
import type { EpicChildrenGroups } from '../../api/epics';
import { getEpicChildren } from '../../api/epics';
import { apiClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { TypeTag } from '../../components/ui/TypeTag';
import { EpicChildRow } from '../../components/epics/EpicChildRow';
import { toast } from '../../components/common/Toast';

const LINK_OPTIONS = [
  { value: 'belongs_to', label: 'Part of' },
  { value: 'contains', label: 'Contains' },
  { value: 'relates_to', label: 'Related' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'blocked_by', label: 'Blocked by' },
  { value: 'caused_by', label: 'Caused by' },
];

const GROUP_DOT: Record<string, string> = {
  in_progress: '#D6B588',
  in_review: '#D688D0',
  open: '#A8A1B5',
  done: '#88D68E',
};

const GROUP_OPTIONS: { value: 'status' | 'sprint'; label: string }[] = [
  { value: 'status', label: 'By status' },
  { value: 'sprint', label: 'By sprint' },
];

interface SearchItem {
  id: number;
  itemKey?: string;
  itemNumber: number;
  title: string;
  itemType: string;
  priority: string;
  status?: { name: string; color: string };
}

interface Props {
  epicId: number;
  epicKey: string;
  projectId: string;
  canEdit: boolean;
  onOpenChild: (id: number) => void;
  reloadKey?: number;
  onLinked?: () => void;
}

export function TicketsTab({ epicId, projectId, canEdit, onOpenChild, reloadKey, onLinked }: Props) {
  const [groupBy, setGroupBy] = useState<'status' | 'sprint'>('status');
  const [data, setData] = useState<EpicChildrenGroups | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(new Set());
  const [linkType, setLinkType] = useState('belongs_to');
  const [linking, setLinking] = useState(false);
  const searchSeqRef = useRef(0);

  const load = useCallback(() => {
    getEpicChildren(projectId, epicId, groupBy).then(setData).catch(() => {});
  }, [projectId, epicId, groupBy]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!filterOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [filterOpen]);

  const existingChildIds = new Set<number>();
  if (data) {
    for (const g of data.groups) {
      for (const item of g.items) existingChildIds.add(item.id);
    }
  }

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeqRef.current;
    setSearching(true);
    try {
      const params = q.length >= 2
        ? `search=${encodeURIComponent(q)}&limit=30&itemType=task,bug,story&excludeAssociationsOf=${epicId}`
        : `limit=30&sort=updatedAt&order=DESC&itemType=task,bug,story&excludeAssociationsOf=${epicId}`;
      const { data: res } = await apiClient.get(`/projects/${projectId}/items?${params}`);
      if (seq !== searchSeqRef.current) return;
      const list: SearchItem[] = (res.data.list || []).filter((it: any) => !existingChildIds.has(it.id) && it.id !== epicId);
      setSearchResults(list);
    } catch { /* ignore */ }
    if (seq === searchSeqRef.current) setSearching(false);
  }, [projectId, epicId, existingChildIds]);

  useEffect(() => {
    if (!showLinkPicker) return;
    const timer = setTimeout(() => runSearch(searchQuery), searchQuery.length >= 2 ? 250 : 0);
    return () => clearTimeout(timer);
  }, [searchQuery, showLinkPicker]);

  useEffect(() => {
    if (showLinkPicker) {
      setSearchQuery('');
      setSelectedLinkIds(new Set());
      setLinkType('belongs_to');
      setSearchResults([]);
      runSearch('');
    }
  }, [showLinkPicker]);

  const toggleLinkItem = (id: number) => {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleLinkSelected = async () => {
    if (selectedLinkIds.size === 0) return;
    setLinking(true);
    try {
      for (const itemId of selectedLinkIds) {
        if (linkType === 'contains' || linkType === 'belongs_to') {
          await apiClient.post(`/projects/${projectId}/items/${itemId}/associations`, {
            linkedItemId: epicId,
            linkType: 'belongs_to',
          });
        } else if (linkType === 'blocked_by') {
          await apiClient.post(`/projects/${projectId}/items/${itemId}/associations`, {
            linkedItemId: epicId,
            linkType: 'blocks',
          });
        } else {
          await apiClient.post(`/projects/${projectId}/items/${epicId}/associations`, {
            linkedItemId: itemId,
            linkType,
          });
        }
      }
      toast(`Linked ${selectedLinkIds.size} ticket${selectedLinkIds.size > 1 ? 's' : ''}`);
      setShowLinkPicker(false);
      setSelectedLinkIds(new Set());
      load();
      onLinked?.();
    } catch {
      toast('Failed to link tickets', 'error');
    }
    setLinking(false);
  };

  const filterLabel = GROUP_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'By status';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[20px] text-text font-serif italic">
          Tickets <span className="text-mute font-sans not-italic text-[14px]">· {data?.totalItems ?? 0} items · {data?.totalPoints ?? 0} pts total</span>
        </p>
        <div className="flex items-center gap-2">
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={`btn-ghost inline-flex items-center gap-2 ${filterOpen ? 'bg-shade' : ''}`}
            >
              <Filter size={14} aria-hidden />
              {filterLabel}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 bg-card shadow-[0_4px_14px_rgba(0,0,0,0.10)] border border-rule min-w-[160px] z-10 py-1">
                {GROUP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setGroupBy(opt.value);
                      setFilterOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-[13px] hover:bg-shade ${
                      groupBy === opt.value ? 'bg-shade font-medium' : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <Button variant="ink" onClick={() => setShowLinkPicker(true)} className="inline-flex items-center gap-2">
              + Link tickets
            </Button>
          )}
        </div>
      </div>

      {/* Link picker panel */}
      {showLinkPicker && (
        <div className="mb-4 border border-rule bg-card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule bg-paper-2">
            <span className="text-[13px] font-medium text-text">Link existing tickets to this epic</span>
            <button onClick={() => setShowLinkPicker(false)} className="text-mute hover:text-text">
              <X size={16} />
            </button>
          </div>
          <div className="px-4 py-3">
            <div className="flex gap-2 mb-2">
              <Select
                value={linkType}
                onChange={setLinkType}
                options={LINK_OPTIONS}
                className="flex-shrink-0"
              />
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title or key..."
                  className="!pl-8 !text-[13px]"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-[280px] overflow-y-auto border border-rule">
              {searching && searchResults.length === 0 && (
                <p className="text-[13px] text-faint py-6 text-center">Searching...</p>
              )}
              {!searching && searchResults.length === 0 && (
                <p className="text-[13px] text-faint py-6 text-center">
                  {searchQuery.length >= 2 ? 'No matching tickets found.' : 'No unlinked tickets available.'}
                </p>
              )}
              {searchResults.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-lilac-tint/40 border-b border-rule last:border-b-0 ${
                    selectedLinkIds.has(item.id) ? 'bg-lilac-tint/30' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedLinkIds.has(item.id)}
                    onChange={() => toggleLinkItem(item.id)}
                    className="w-3.5 h-3.5 accent-lilac flex-shrink-0"
                  />
                  <TypeTag kind={item.itemType as any} size="sm" />
                  <span className="text-[12px] font-mono text-faint w-[70px] flex-shrink-0">
                    {item.itemKey ?? `#${item.itemNumber}`}
                  </span>
                  <span className="flex-1 min-w-0 text-[13px] text-text truncate">{item.title}</span>
                  {item.status && (
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.status.color }} />
                      <span className="text-[11px] text-mute">{item.status.name}</span>
                    </span>
                  )}
                </label>
              ))}
            </div>
            {selectedLinkIds.size > 0 && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-[13px] text-mute">{selectedLinkIds.size} selected</span>
                <Button size="sm" variant="primary" onClick={handleLinkSelected} disabled={linking}>
                  {linking ? 'Linking...' : `Link ${selectedLinkIds.size} ticket${selectedLinkIds.size > 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {data && data.groups.length > 0 ? (
        <div className="bg-card border-y border-rule">
          {data.groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-paper-2 text-[12px] tracking-[0.1em] uppercase text-faint">
                {GROUP_DOT[g.key] && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GROUP_DOT[g.key] }} />
                )}
                <span>{g.label}</span>
                <span>{g.count}</span>
                <span className="ml-auto normal-case tracking-normal">{g.points} pts</span>
              </div>
              {g.items.map((it) => (
                <EpicChildRow key={it.id} item={it} onClick={onOpenChild} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-faint py-10 text-center">No tickets linked to this epic yet.</p>
      )}
    </div>
  );
}
