import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import type { EpicChildItem } from '../../api/epics';
import { getEpicChildren } from '../../api/epics';
import { apiClient } from '../../api/client';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/auth.store';
import { PRIORITY_BADGE_COLORS, PRIORITY_BORDER_COLORS } from '../../lib/colors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { TypeTag } from '../../components/ui/TypeTag';
import type { TypeTagKind } from '../../components/ui/TypeTag';
import { Avatar } from '../../components/ui/Avatar';
import { LabelList } from '../../components/ui/LabelBadge';
import { RowStatusSelect } from '../../components/epics/RowStatusSelect';
import type { StatusOption } from '../../components/epics/RowStatusSelect';
import { toast } from '../../components/common/Toast';

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
  epicId: number;
  epicKey: string;
  projectId: string;
  canEdit: boolean;
  onOpenChild: (id: number) => void;
  reloadKey?: number;
  onLinked?: () => void;
}

export function TicketsTab({ epicId, projectId, canEdit, onOpenChild, reloadKey, onLinked }: Props) {
  const [items, setItems] = useState<EpicChildItem[]>([]);
  const [totals, setTotals] = useState<{ totalItems: number; totalPoints: number }>({ totalItems: 0, totalPoints: 0 });
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(new Set());
  const [linkType, setLinkType] = useState('belongs_to');
  const [linking, setLinking] = useState(false);
  const searchSeqRef = useRef(0);

  const load = useCallback(() => {
    getEpicChildren(projectId, epicId, 'none')
      .then((data) => {
        setItems(data.groups[0]?.items ?? []);
        setTotals({ totalItems: data.totalItems, totalPoints: data.totalPoints });
      })
      .catch(() => {});
  }, [projectId, epicId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Project statuses for the inline dropdown — these are the board-settings
  // statuses (project_statuses) with their real colours, ordered by sortOrder.
  useEffect(() => {
    apiClient
      .get(`/projects/${projectId}/statuses`)
      .then((res) => {
        const list = res.data.data?.list || res.data.data || [];
        setStatuses(list.map((s: any) => ({ id: s.id, name: s.name, color: s.color })));
      })
      .catch(() => {});
  }, [projectId]);

  // Live sync — reload when a listed item changes elsewhere (board drag or
  // another user's edit). Same pattern as TaskDetailPanel.
  useEffect(() => {
    const socket = getSocket();
    const currentUserId = useAuthStore.getState().user?.id;
    const inList = (id: number) => items.some((it) => it.id === id);

    const handleMoved = (data: { itemId: number; actorId?: number }) => {
      if (data.actorId === currentUserId) return;
      if (inList(data.itemId)) load();
    };
    const handleUpdated = (data: { itemId: number }) => {
      if (inList(data.itemId)) load();
    };

    socket.on('board:moved', handleMoved);
    socket.on('work-item:updated', handleUpdated);
    return () => {
      socket.off('board:moved', handleMoved);
      socket.off('work-item:updated', handleUpdated);
    };
  }, [items, load]);

  // Reload when an item is created anywhere (global create dialog, another
  // user, etc.). The children query is epic-scoped, so a creation that isn't
  // part of this epic just no-ops. Mirrors the KanbanBoard refresh pattern.
  useEffect(() => {
    const socket = getSocket();
    const handleCreated = () => load();
    document.addEventListener('item-created', handleCreated);
    socket.on('work-item:created', handleCreated);
    return () => {
      document.removeEventListener('item-created', handleCreated);
      socket.off('work-item:created', handleCreated);
    };
  }, [load]);

  const existingChildIds = new Set<number>(items.map((it) => it.id));

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

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
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

  const handleStatusChange = async (itemId: number, statusId: number) => {
    const newStatus = statuses.find((s) => s.id === statusId);
    if (!newStatus) return;
    const prev = items;
    // Optimistic update.
    setItems((cur) =>
      cur.map((it) =>
        it.id === itemId
          ? { ...it, status: { ...it.status, id: newStatus.id, name: newStatus.name, color: newStatus.color } }
          : it,
      ),
    );
    try {
      await apiClient.put(`/projects/${projectId}/items/${itemId}`, { statusId });
      load();
    } catch (err: any) {
      setItems(prev);
      toast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  // Top-level rows = everything that isn't a subtask; subtasks nest one level
  // under their parent. Subtasks whose parent isn't in the list fall back to
  // top level so they're never hidden.
  const subtasksByParent = new Map<number, EpicChildItem[]>();
  for (const it of items) {
    if (it.itemType === 'subtask' && it.parentId != null && existingChildIds.has(it.parentId)) {
      if (!subtasksByParent.has(it.parentId)) subtasksByParent.set(it.parentId, []);
      subtasksByParent.get(it.parentId)!.push(it);
    }
  }
  const topLevel = items.filter(
    (it) => !(it.itemType === 'subtask' && it.parentId != null && existingChildIds.has(it.parentId)),
  );

  const renderRow = (item: EpicChildItem, opts: { nested: boolean; hasSubs?: boolean; isCollapsed?: boolean }) => {
    const { nested, hasSubs, isCollapsed } = opts;
    const badge = PRIORITY_BADGE_COLORS[item.priority];
    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => onOpenChild(item.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpenChild(item.id); }}
        className="flex items-center gap-3 px-4 py-2 border-b border-rule transition-colors cursor-pointer hover:bg-paper/50"
      >
        {/* Leading cell — fixed width (chevron/connector + type tag). Subtasks
            indent the type tag inside this cell so the start reads as nested,
            while ID / Title / right columns stay column-aligned for every row. */}
        <div className="flex items-center flex-shrink-0" style={{ width: 56 }}>
          {nested && <span className="flex-shrink-0" style={{ width: 18 }} />}
          <span className="w-[16px] flex-shrink-0 flex items-center justify-center">
            {nested ? (
              <span className="text-faint text-[12px] leading-none">└</span>
            ) : hasSubs ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}
                className="text-faint hover:text-text flex items-center"
                aria-label={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
              >
                <ChevronDown size={12} className={`transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`} />
              </button>
            ) : null}
          </span>
          <span className="flex items-center">
            <TypeTag kind={(item.itemType || 'task') as TypeTagKind} size="sm" />
          </span>
        </div>

        <span className="text-[12px] font-mono text-faint flex-shrink-0 w-[90px]">{item.itemKey}</span>

        <span className="flex-1 min-w-0 text-[14px] text-text truncate">{item.title}</span>

        <div className="flex-shrink-0 w-[140px] min-w-0">
          <LabelList labels={item.labels || []} max={2} />
        </div>

        {/* Priority — solid pill in the priority colour with white uppercase
            text (matches StatusPill's solid treatment). Shown for subtasks too. */}
        {badge ? (
          <span className="w-[70px] flex-shrink-0 flex">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase tracking-[0.06em] text-white"
              style={{ backgroundColor: PRIORITY_BORDER_COLORS[item.priority] }}
            >
              {item.priority}
            </span>
          </span>
        ) : (
          <span className="w-[70px] flex-shrink-0 text-[12px] text-faint">—</span>
        )}

        {/* Status — editable dropdown with board colours */}
        <span className="w-[150px] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <RowStatusSelect
            value={item.status.id}
            options={statuses}
            onChange={(sid) => handleStatusChange(item.id, sid)}
            disabled={!canEdit || statuses.length === 0}
          />
        </span>

        <span className="text-[13px] tabular-nums text-text w-[40px] text-right flex-shrink-0">
          {item.storyPoints != null && item.storyPoints > 0 ? item.storyPoints : '—'}
        </span>

        <div className="flex-shrink-0 w-[50px] flex justify-center" title={item.assignee?.displayName}>
          {item.assignee ? <Avatar user={item.assignee} size="xs" /> : <span className="text-faint text-[13px]">—</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[20px] text-text font-serif italic">
          Tickets <span className="text-mute font-sans not-italic text-[14px]">· {totals.totalItems} items · {totals.totalPoints} pts total</span>
        </p>
        {canEdit && (
          <Button variant="ink" onClick={() => setShowLinkPicker(true)} className="inline-flex items-center gap-2">
            + Link tickets
          </Button>
        )}
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

      {topLevel.length > 0 ? (
        <div>
          {/* Column header — widths mirror the rows below */}
          <div
            className="flex items-center gap-3 px-4 h-[26px] border-b border-rule-2 text-mute text-[10px] font-semibold tracking-[0.1em] uppercase"
            role="row"
          >
            <span className="flex-shrink-0" style={{ width: 56 }} />{/* chevron + type tag */}
            <span className="w-[90px] flex-shrink-0" role="columnheader">ID</span>
            <span className="flex-1 min-w-0" role="columnheader">Title</span>
            <span className="w-[140px] flex-shrink-0" role="columnheader">Labels</span>
            <span className="w-[70px] flex-shrink-0" role="columnheader">Priority</span>
            <span className="w-[150px] flex-shrink-0" role="columnheader">Status</span>
            <span className="w-[40px] flex-shrink-0 text-right" role="columnheader">Pts</span>
            <span className="w-[50px] flex-shrink-0 text-center" role="columnheader">Owner</span>
          </div>

          {topLevel.map((item) => {
            const subs = subtasksByParent.get(item.id) ?? [];
            const isCollapsed = collapsed.has(item.id);
            return (
              <div key={item.id}>
                {renderRow(item, { nested: false, hasSubs: subs.length > 0, isCollapsed })}
                {subs.length > 0 && !isCollapsed && subs.map((sub) => renderRow(sub, { nested: true }))}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[14px] text-faint py-10 text-center">No tickets linked to this epic yet.</p>
      )}
    </div>
  );
}
