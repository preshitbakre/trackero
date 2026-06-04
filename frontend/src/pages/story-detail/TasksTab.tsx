import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { toast } from '../../components/common/Toast';
import { TypeTag } from '../../components/ui/TypeTag';
import type { TypeTagKind } from '../../components/ui/TypeTag';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import type { TaskRow } from './types';

const LINK_OPTIONS = [
  { value: 'belongs_to', label: 'Part of' },
  { value: 'contains', label: 'Contains' },
  { value: 'relates_to', label: 'Related' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'blocked_by', label: 'Blocked by' },
  { value: 'caused_by', label: 'Caused by' },
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
  topLevel: TaskRow[];
  subtasksByParent: Map<number, TaskRow[]>;
  statuses: { id: number; name: string; category: string }[];
  canEdit: boolean;
  projectId: number;
  storyId: number;
  onOpenItem: (id: number) => void;
  onAddTask: () => void;
  onReportBug: () => void;
  onLinked: () => void;
}

export function TasksTab({ topLevel, subtasksByParent, statuses, canEdit, projectId, storyId, onOpenItem, onAddTask, onReportBug, onLinked }: Props) {
  const allRows = [...topLevel, ...Array.from(subtasksByParent.values()).flat()];
  const totalPts = allRows.reduce((sum, r) => sum + (r.storyPoints ?? 0), 0);

  const order = new Map(statuses.map((s, i) => [s.id, i]));
  const groups = new Map<number, TaskRow[]>();
  for (const r of topLevel) {
    const sid = r.status?.id ?? -1;
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid)!.push(r);
  }
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999),
  );

  const groupPts = (items: TaskRow[]) =>
    items.reduce((s, r) => s + (r.storyPoints ?? 0) + (subtasksByParent.get(r.id)?.reduce((x, st) => x + (st.storyPoints ?? 0), 0) ?? 0), 0);

  // Link picker state
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(new Set());
  const [linkType, setLinkType] = useState('belongs_to');
  const [linking, setLinking] = useState(false);
  const searchSeqRef = useRef(0);

  const existingChildIds = new Set<number>(topLevel.map((r) => r.id));

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeqRef.current;
    setSearching(true);
    try {
      const params = q.length >= 2
        ? `search=${encodeURIComponent(q)}&limit=30&itemType=task,bug&excludeAssociationsOf=${storyId}`
        : `limit=30&sort=updatedAt&order=DESC&itemType=task,bug&excludeAssociationsOf=${storyId}`;
      const { data: res } = await apiClient.get(`/projects/${projectId}/items?${params}`);
      if (seq !== searchSeqRef.current) return;
      const list: SearchItem[] = (res.data.list || []).filter((it: any) => !existingChildIds.has(it.id) && it.id !== storyId);
      setSearchResults(list);
    } catch { /* ignore */ }
    if (seq === searchSeqRef.current) setSearching(false);
  }, [projectId, storyId, existingChildIds]);

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
            linkedItemId: storyId,
            linkType: 'belongs_to',
          });
        } else if (linkType === 'blocked_by') {
          await apiClient.post(`/projects/${projectId}/items/${itemId}/associations`, {
            linkedItemId: storyId,
            linkType: 'blocks',
          });
        } else {
          await apiClient.post(`/projects/${projectId}/items/${storyId}/associations`, {
            linkedItemId: itemId,
            linkType,
          });
        }
      }
      toast(`Linked ${selectedLinkIds.size} ticket${selectedLinkIds.size > 1 ? 's' : ''}`);
      setShowLinkPicker(false);
      setSelectedLinkIds(new Set());
      onLinked();
    } catch {
      toast('Failed to link tickets', 'error');
    }
    setLinking(false);
  };

  return (
    <div className="flex-1 min-w-0 px-[28px] py-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-serif text-[22px] text-text">Tasks &amp; bugs</h2>
          <span className="text-[13px] text-mute">· {allRows.length} child{allRows.length === 1 ? '' : 'ren'} · {totalPts} pts total</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="inline-flex items-center gap-1.5" onClick={onReportBug}>⚑ Report a bug</Button>
            <Button variant="ink" size="sm" onClick={onAddTask}>+ Add task</Button>
            <Button variant="ink" size="sm" onClick={() => setShowLinkPicker(true)}>+ Link tickets</Button>
          </div>
        )}
      </div>

      {/* Inline link picker — matches epic TicketsTab layout */}
      {showLinkPicker && (
        <div className="mb-4 border border-rule bg-card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule bg-paper-2">
            <span className="text-[13px] font-medium text-text">Link existing tickets to this story</span>
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

      {topLevel.length === 0 && !showLinkPicker ? (
        <div className="text-center py-12 text-mute text-[14px]">No tasks or bugs in this story yet.</div>
      ) : topLevel.length > 0 && (
        <div className="bg-card border border-rule/60">
          {sortedGroups.map(([sid, items], gi) => {
            const status = items[0]?.status;
            return (
              <div key={sid} className={gi > 0 ? 'border-t border-rule/60' : ''}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 bg-paper-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusDot(status?.category) }} />
                  <span className="text-[12px] font-semibold text-text uppercase tracking-[0.04em]">{status?.name ?? 'No status'}</span>
                  <span className="text-[11px] text-faint">{items.length}</span>
                  <span className="ml-auto text-[12px] text-mute">{groupPts(items)} pts</span>
                </div>
                {items.map((r) => (
                  <div key={r.id}>
                    <Row row={r} onOpenItem={onOpenItem} />
                    {(subtasksByParent.get(r.id) ?? []).map((st) => (
                      <Row key={st.id} row={st} onOpenItem={onOpenItem} indent />
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ row, onOpenItem, indent }: { row: TaskRow; onOpenItem: (id: number) => void; indent?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpenItem(row.id)}
      className="w-full flex items-center gap-2.5 h-[36px] border-b border-rule/40 px-4 text-[13px] hover:bg-lilac-tint/50 transition-colors text-left last:border-b-0"
      style={indent ? { paddingLeft: 44 } : undefined}
    >
      <span className="w-3.5 h-3.5 border border-rule/80 inline-flex items-center justify-center flex-shrink-0">
        {row.status?.category === 'done' && <span className="text-[9px] text-[#3E8E44]">✓</span>}
      </span>
      <TypeTag kind={(row.itemType as TypeTagKind) || 'task'} />
      <span className="font-mono text-[11px] text-mute w-[72px] flex-shrink-0">{row.itemKey}</span>
      <span className="flex-1 truncate text-text">{row.title}</span>
      <span className="inline-flex items-center gap-1.5 text-[12px] text-mute flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot(row.status?.category) }} />
        {row.status?.name ?? 'No status'}
      </span>
      <span className="font-mono text-[12px] text-text w-[28px] text-right flex-shrink-0">{row.storyPoints ?? '—'}</span>
      {row.assignee ? <Avatar user={row.assignee} size="xs" /> : <span className="w-6" />}
    </button>
  );
}

function statusDot(cat?: string): string {
  switch (cat) {
    case 'done': return '#88D68E';
    case 'in_progress': return '#D6B588';
    case 'in_review': return '#D688D0';
    case 'cancelled': return '#E05252';
    default: return '#A8A1B5';
  }
}
