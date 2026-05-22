import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useRole } from '../hooks/useRole';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { ReadOnlyBanner } from '../components/common/ReadOnlyBanner';
import { AVATAR_COLORS, PRIORITY_BADGE_COLORS, STATUS_BADGE_COLORS, TYPE_ICONS, TYPE_ICON_COLORS } from '../lib/colors';
import { CreateItemDialog } from '../components/common/CreateItemDialog';
import { LabelList } from '../components/ui/LabelBadge';

interface TaskLabel {
  id: number;
  name: string;
  color: string;
}

interface TaskItem {
  id: number;
  itemNumber: number;
  title: string;
  type: string;
  itemType?: string;
  priority: string;
  statusId: number;
  status?: { id: number; name: string; category: string; color: string };
  storyPoints: number | null;
  assigneeId: number | null;
  assignee?: { id: number; displayName: string; avatarUrl?: string | null } | null;
  sprintId: number | null;
  parentId: number | null;
  labels?: TaskLabel[];
  subtaskCount?: number;
  subtaskDoneCount?: number;
  hasBlockers?: boolean;
  createdAt: string;
}

interface SprintOption { id: number; name: string; status: string }
interface StatusOption { id: number; name: string; category: string; color: string }
interface AssigneeOption { value: number; label: string }

type SortField = 'itemNumber' | 'title' | 'priority' | 'status' | 'assignee' | 'storyPoints';
type SortDir = 'asc' | 'desc' | null;

export function TasksPage() {
  const { id: projectId } = useParams();
  const { canEdit } = useRole();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [projectPrefix, setProjectPrefix] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterSprint, setFilterSprint] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Filter options
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [sprints, setSprints] = useState<SprintOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);

  // Load filter options
  useEffect(() => {
    if (!projectId) return;
    apiClient.get(`/projects/${projectId}`).then((r) => setProjectPrefix(r.data.data.prefix || '')).catch(() => {});
    apiClient.get(`/projects/${projectId}/filters/assignees`).then((r) => setAssignees(r.data.data.list || [])).catch(() => {});
    apiClient.get(`/projects/${projectId}/sprints?limit=100`).then((r) => setSprints(r.data.data.list || [])).catch(() => {});
    apiClient.get(`/projects/${projectId}/statuses`).then((r) => setStatuses(r.data.data.list || r.data.data || [])).catch(() => {});
  }, [projectId]);

  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterPriority) params.set('priority', filterPriority);
    if (filterAssignee) params.set('assigneeId', filterAssignee);
    if (filterType) params.set('itemType', filterType);
    if (filterSprint) params.set('sprintId', filterSprint);
    try {
      const { data } = await apiClient.get(`/projects/${projectId}/items?${params}`);
      setTasks(data.data.list || []);
      setTotal(data.data.total || 0);
    } catch {}
  }, [projectId, page, pageSize, search, filterStatus, filterPriority, filterAssignee, filterType, filterSprint]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterStatus, filterPriority, filterAssignee, filterType, filterSprint]);

  const handleCreated = () => {
    setShowCreate(false);
    loadTasks();
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortField(null); setSortDir(null); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Client-side sort (API doesn't support sort param, so we sort in-memory)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (!sortField || !sortDir) return 0;
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'itemNumber': return (a.itemNumber - b.itemNumber) * dir;
      case 'title': return a.title.localeCompare(b.title) * dir;
      case 'priority': {
        const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
        return ((order[a.priority as keyof typeof order] ?? 4) - (order[b.priority as keyof typeof order] ?? 4)) * dir;
      }
      case 'status': return (a.status?.name || '').localeCompare(b.status?.name || '') * dir;
      case 'assignee': return (a.assignee?.displayName || 'zzz').localeCompare(b.assignee?.displayName || 'zzz') * dir;
      case 'storyPoints': return ((a.storyPoints || 0) - (b.storyPoints || 0)) * dir;
      default: return 0;
    }
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedTasks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedTasks.map((t) => t.id)));
  };

  const sprintMap = new Map(sprints.map((s) => [s.id, s.name]));
  const totalPages = Math.ceil(total / pageSize);
  const openCount = tasks.filter((t) => t.status?.category !== 'done' && t.status?.category !== 'cancelled').length;
  const completedCount = tasks.filter((t) => t.status?.category === 'done').length;

  // Active filters for chips
  const activeFilters: { key: string; label: string; value: string; clear: () => void }[] = [];
  if (filterStatus) {
    const s = statuses.find((st) => String(st.id) === filterStatus);
    activeFilters.push({ key: 'status', label: 'Status', value: s?.name || filterStatus, clear: () => setFilterStatus('') });
  }
  if (filterPriority) activeFilters.push({ key: 'priority', label: 'Priority', value: filterPriority, clear: () => setFilterPriority('') });
  if (filterAssignee) {
    const a = assignees.find((x) => String(x.value) === filterAssignee);
    activeFilters.push({ key: 'assignee', label: 'Assignee', value: a?.label || filterAssignee, clear: () => setFilterAssignee('') });
  }
  if (filterType) activeFilters.push({ key: 'type', label: 'Type', value: filterType, clear: () => setFilterType('') });
  if (filterSprint) {
    activeFilters.push({ key: 'sprint', label: 'Sprint', value: sprintMap.get(Number(filterSprint)) || filterSprint, clear: () => setFilterSprint('') });
  }

  const clearAllFilters = () => {
    setFilterStatus(''); setFilterPriority(''); setFilterAssignee(''); setFilterType(''); setFilterSprint(''); setSearch('');
  };

  return (
    <div className="flex flex-col h-full">
      <ReadOnlyBanner />
      <div className="p-6 flex flex-col flex-1 min-h-0">
      {/* SECTION 1: Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-semibold text-neutral-700 dark:text-dneutral-700">Tasks</h1>
          <p className="text-[14px] text-neutral-400 dark:text-dneutral-400 mt-0.5">
            {total} tasks · {openCount} open · {completedCount} done
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCreate(true)}>+ Create task</Button>
        )}
      </div>

      {showCreate && projectId && (
        <CreateItemDialog
          projectId={parseInt(projectId)}
          defaultType="task"
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {/* SECTION 2: Filter and search bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-dneutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-3 py-1.5 text-[16px] rounded-lg border border-neutral-200 dark:border-dneutral-200 bg-white dark:bg-dneutral-100 text-neutral-700 dark:text-dneutral-700 placeholder-neutral-300 dark:placeholder-dneutral-300 focus:border-peri focus:outline-none focus:ring-2 focus:ring-peri/20"
          />
        </div>
        <Select value={filterStatus} onChange={setFilterStatus} placeholder="Status" options={[{ value: '', label: 'All statuses' }, ...statuses.map((s) => ({ value: String(s.id), label: s.name }))]} />
        <Select value={filterPriority} onChange={setFilterPriority} placeholder="Priority" options={[{ value: '', label: 'All priorities' }, { value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }, { value: 'none', label: 'None' }]} />
        <Select value={filterAssignee} onChange={setFilterAssignee} placeholder="Assignee" options={[{ value: '', label: 'All assignees' }, ...assignees.map((a) => ({ value: String(a.value), label: a.label }))]} />
        <Select value={filterType} onChange={setFilterType} placeholder="Type" options={[{ value: '', label: 'All types' }, { value: 'task', label: 'Task' }, { value: 'bug', label: 'Bug' }, { value: 'story', label: 'Story' }]} />
        <Select value={filterSprint} onChange={setFilterSprint} placeholder="Sprint" options={[{ value: '', label: 'All sprints' }, ...sprints.map((s) => ({ value: String(s.id), label: s.name }))]} />
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {activeFilters.map((f) => (
            <span key={f.key} className="bg-peri-light text-peri dark:bg-peri-dm/30 dark:text-peri-dm text-[14px] px-2 py-0.5 rounded-full flex items-center gap-1">
              {f.label}: {f.value}
              <button onClick={f.clear} className="hover:text-neutral-700 dark:hover:text-dneutral-700">×</button>
            </span>
          ))}
          <button onClick={clearAllFilters} className="text-[14px] text-neutral-400 hover:text-neutral-600 dark:hover:text-dneutral-600">Clear all</button>
        </div>
      )}

      {/* SECTION 3-4-6: Table */}
      {sortedTasks.length > 0 || tasks.length > 0 ? (
        <div className="flex-1 flex flex-col bg-white dark:bg-dneutral-100 rounded-xl shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-hidden">
          <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-[16px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-neutral-200 dark:bg-dneutral-300 border-b border-neutral-300 dark:border-dneutral-400">
                <th className="w-10 px-4 py-2 text-left">
                  <input type="checkbox" checked={selectedIds.size === sortedTasks.length && sortedTasks.length > 0} onChange={toggleSelectAll} className="w-3.5 h-3.5 rounded border-neutral-300" />
                </th>
                <th className="w-14 px-3 py-2"><SortHeader label="Type" field="itemNumber" sortField={sortField} sortDir={sortDir} onClick={() => toggleSort('itemNumber')} /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Task" field="title" sortField={sortField} sortDir={sortDir} onClick={() => toggleSort('title')} /></th>
                <th className="w-28 px-3 py-2"><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onClick={() => toggleSort('status')} /></th>
                <th className="w-24 px-3 py-2"><SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onClick={() => toggleSort('priority')} /></th>
                <th className="w-28 px-3 py-2"><SortHeader label="Assignee" field="assignee" sortField={sortField} sortDir={sortDir} onClick={() => toggleSort('assignee')} /></th>
                <th className="w-28 px-3 py-2 text-[14px] font-medium text-neutral-700 dark:text-dneutral-600 uppercase tracking-wider text-left">Sprint</th>
                <th className="w-16 px-3 py-2"><SortHeader label="Pts" field="storyPoints" sortField={sortField} sortDir={sortDir} onClick={() => toggleSort('storyPoints')} /></th>
              </tr>
            </thead>
            <tbody>
            {sortedTasks.map((task) => {
              const effectiveType = task.itemType || task.type || 'task';
              const typeIcon = TYPE_ICONS[effectiveType] || TYPE_ICONS.task;
              const typeColor = TYPE_ICON_COLORS[effectiveType] || TYPE_ICON_COLORS.task;
              const typeName = effectiveType.charAt(0).toUpperCase() + effectiveType.slice(1);
              const statusBadge = STATUS_BADGE_COLORS[task.status?.category || 'backlog'] || STATUS_BADGE_COLORS.backlog;
              const priorityBadge = PRIORITY_BADGE_COLORS[task.priority];
              const avatarColor = task.assignee ? AVATAR_COLORS[task.assignee.id % AVATAR_COLORS.length] : null;
              const taskKey = projectPrefix ? `${projectPrefix}-${task.itemNumber}` : `#${task.itemNumber}`;

              return (
                <tr
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`group border-b border-neutral-100 dark:border-dneutral-200/50 hover:bg-neutral-50/50 dark:hover:bg-dneutral-100/50 cursor-pointer transition-colors ${
                    selectedIds.has(task.id) ? 'bg-peri-light dark:bg-peri-dm/20' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(task.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(task.id); }} className="w-3.5 h-3.5 rounded border-neutral-300" />
                  </td>
                  <td className="px-3 py-3 text-center" title={typeName}>
                    <span style={{ color: typeColor }}>{typeIcon}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[14px] text-neutral-400 dark:text-dneutral-400 shrink-0">{taskKey}</span>
                      {task.hasBlockers && <span className="text-danger text-[14px] shrink-0">🔒</span>}
                      <span className="text-neutral-700 dark:text-dneutral-700 truncate">{task.title}</span>
                      <LabelList labels={task.labels || []} max={2} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 text-[14px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: statusBadge?.bg, color: statusBadge?.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusBadge?.dot }} />
                      {task.status?.name || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {task.priority !== 'none' && priorityBadge ? (
                      <span className="text-[14px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap" style={{ background: priorityBadge.bg, color: priorityBadge.color }}>
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                      </span>
                    ) : (
                      <span className="text-[14px] text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {task.assignee && avatarColor ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-medium shrink-0" style={{ background: avatarColor.bg, color: avatarColor.color }}>
                          {task.assignee.displayName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="text-neutral-500 dark:text-dneutral-500 truncate">{task.assignee.displayName.split(' ')[0]}</span>
                      </div>
                    ) : (
                      <span className="text-[14px] text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-neutral-500 dark:text-dneutral-500 truncate">
                    {task.sprintId ? (sprintMap.get(task.sprintId) || '—') : '—'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {task.storyPoints ? (
                      <span className="text-[14px] px-1.5 py-0.5 rounded font-medium" style={{ background: '#88A9D625', color: '#3F5E8E' }}>
                        {task.storyPoints}
                      </span>
                    ) : (
                      <span className="text-[14px] text-neutral-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
          </div>

          {/* SECTION 6: Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-dneutral-200">
            <span className="text-[16px] text-neutral-400 dark:text-dneutral-400">
              Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-2 py-1 text-[16px] rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500 disabled:opacity-30">←</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={p === page
                    ? 'px-2.5 py-1 text-[16px] rounded bg-peri dark:bg-peri-dm text-white'
                    : 'px-2.5 py-1 text-[16px] rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500'}
                >
                  {p}
                </button>
              ))}
              <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(page + 1)} className="px-2 py-1 text-[16px] rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-500 dark:text-dneutral-500 disabled:opacity-30">→</button>
            </div>
            <Select
              value={String(pageSize)}
              onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
              options={[{ value: '20', label: '20 / page' }, { value: '50', label: '50 / page' }, { value: '100', label: '100 / page' }]}
            />
          </div>
        </div>
      ) : (
        /* SECTION 7: Empty state */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-16">
            <svg className="w-12 h-12 text-neutral-300 dark:text-dneutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
            </svg>
            <h3 className="text-[16px] font-medium text-neutral-500 dark:text-dneutral-500 mb-1">No tasks yet</h3>
            <p className="text-[16px] text-neutral-400 dark:text-dneutral-400 mb-4">Create your first task to start tracking work</p>
            {canEdit && (
              <Button onClick={() => setShowCreate(true)}>+ Create task</Button>
            )}
          </div>
        </div>
      )}

      {/* SECTION 5: Bulk actions bar */}
      {canEdit && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-700 dark:bg-dneutral-200 text-white dark:text-dneutral-700 rounded-xl shadow-2xl dark:shadow-[0_16px_48px_rgba(0,0,0,0.7)] px-4 py-2.5 flex items-center gap-3">
          <span className="text-[16px] font-medium">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-neutral-500 dark:bg-dneutral-300" />
          <button onClick={() => { setSelectedIds(new Set()); }} className="text-[16px] text-neutral-400 dark:text-dneutral-500 hover:text-white dark:hover:text-dneutral-700">× Clear</button>
        </div>
      )}

      {/* Task detail panel */}
      {selectedTaskId && projectId && (
        <TaskDetailPanel
          projectId={parseInt(projectId)}
          taskId={selectedTaskId}
          projectPrefix={projectPrefix}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadTasks}
        />
      )}
      </div>
    </div>
  );
}

function SortHeader({ label, field, sortField, sortDir, onClick }: {
  label: string; field: SortField; sortField: SortField | null; sortDir: SortDir; onClick: () => void;
}) {
  const isActive = sortField === field;
  return (
    <button
      onClick={onClick}
      className={`text-[14px] font-medium uppercase tracking-wider text-left flex items-center gap-1 ${
        isActive ? 'text-[#252220] dark:text-dneutral-700 font-semibold' : 'text-neutral-700 dark:text-dneutral-600'
      }`}
    >
      {label}
      {isActive && sortDir === 'asc' && <span>↑</span>}
      {isActive && sortDir === 'desc' && <span>↓</span>}
    </button>
  );
}
