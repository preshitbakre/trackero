import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { MetricNumber } from '../../components/ui/MetricNumber';
import { TypeTag } from '../../components/ui/TypeTag';
import { LabelList } from '../../components/ui/LabelBadge';
import { Avatar } from '../../components/ui/Avatar';
import { BurndownChart } from '../../components/sprints/BurndownChart';
import { OverviewSidebar } from './OverviewSidebar';
import type { SprintDetail } from '../SprintDetailPage';

interface BurndownData {
  dataPoints: Array<{ date: string; actual: number; ideal: number; scope: number }>;
  totalPoints: number;
  completedPoints: number;
}

interface SprintItem {
  id: number;
  itemKey: string;
  title: string;
  itemType: 'task' | 'bug' | 'story' | 'epic' | 'subtask';
  storyPoints: number | null;
  status: { category: string; name: string; color?: string } | null;
  labels: Array<{ id: number; name: string; color: string }>;
  assignee: { id: number; displayName: string; avatarUrl: string | null } | null;
}

interface OverviewTabProps {
  sprint: SprintDetail;
  onAfterAction: () => void;
}

const STATUS_GROUP_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  open: '#88A9D6',        // peri
  in_progress: '#D6B588', // tan
  in_review: '#D688D0',   // orchid
  done: '#88D68E',        // mint
  blocked: '#E05252',     // danger
  cancelled: '#A8A1B5',   // neutral
};

const CATEGORY_ORDER = ['open', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'];

/**
 * Sprint Detail Overview tab. Shows status counters, burndown chart,
 * and a grouped list of items in the sprint. Sidebar on the right
 * renders dates, workload, type breakdown, and a recent-activity stub.
 */
export function OverviewTab({ sprint, onAfterAction: _onAfterAction }: OverviewTabProps) {
  const [burndown, setBurndown] = useState<BurndownData | null>(null);
  const [items, setItems] = useState<SprintItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get(`/projects/${sprint.projectId}/sprints/${sprint.id}/burndown`)
      .then((r) => setBurndown(r.data.data))
      .catch(() => setBurndown(null));

    setItemsLoading(true);
    apiClient
      .get(`/projects/${sprint.projectId}/items`, {
        params: { sprintId: sprint.id, limit: 300 },
      })
      .then((r) => setItems(r.data.data.list || []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [sprint.id, sprint.projectId]);

  const itemsByCategory = useMemo(() => {
    const groups: Record<string, SprintItem[]> = {};
    for (const item of items) {
      const rawCat = item.status?.category ?? 'open';
      const cat = rawCat === 'backlog' ? 'open' : rawCat;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return CATEGORY_ORDER.filter((k) => groups[k]?.length > 0).map((k) => ({
      category: k,
      label: STATUS_GROUP_LABELS[k] ?? k,
      items: groups[k],
      pts: groups[k].reduce((s, it) => s + (it.storyPoints ?? 0), 0),
    }));
  }, [items]);

  const counters: Array<{ key: string; label: string; n: number; color?: string }> = [
    { key: 'done', label: 'Done', n: sprint.statusCounts.done ?? 0, color: 'text-mint-dark' },
    { key: 'in_progress', label: 'In progress', n: sprint.statusCounts.in_progress ?? 0 },
    { key: 'open', label: 'Open', n: sprint.statusCounts.open ?? 0 },
    { key: 'blocked', label: 'Blocked', n: sprint.statusCounts.blocked ?? 0, color: 'text-lilac' },
    { key: 'committed', label: 'Committed', n: sprint.totalPoints },
  ];

  return (
    <div className="flex h-full min-h-0">
      <main className="flex-1 min-w-0 overflow-y-auto py-6">
        <div className="px-[28px]">
        {sprint.status === 'completed' && sprint.completedAt && (
          <p className="text-[13px] text-mute mb-4">
            Sprint shipped {formatDate(sprint.completedAt)} ·{' '}
            <span className="font-semibold text-text">{sprint.completedPoints} pts</span>{' '}
            delivered
          </p>
        )}

        <div className="flex border border-rule mb-6">
          {counters.map((c, i) => (
            <div
              key={c.key}
              className={`flex-1 px-4 py-3 ${i > 0 ? 'border-l border-rule' : ''} ${
                c.key === 'blocked' ? 'bg-lilac-tint' : ''
              }`}
            >
              <MetricNumber size="lg" className={c.color}>
                {c.n}
              </MetricNumber>
              <p className="text-[10px] tracking-[0.12em] uppercase text-mute mt-1">
                {c.label}
              </p>
            </div>
          ))}
        </div>

        {burndown && sprint.startDate && sprint.endDate && (
          <BurndownChart
            dataPoints={burndown.dataPoints}
            startDate={sprint.startDate}
            endDate={sprint.endDate}
            totalPoints={sprint.totalPoints}
            completedPoints={sprint.completedPoints}
          />
        )}
        </div>

        <div className="mt-8">
          <div className="px-[28px] flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-[20px] text-text">
              Items in this sprint{' '}
              <span className="font-mono text-[12px] text-mute">
                · {items.length} items · grouped by status
              </span>
            </h2>
            <Link
              to={`/projects/${sprint.projectId}/board`}
              className="btn-ghost text-[12px]"
            >
              Open board →
            </Link>
          </div>
          {itemsLoading ? (
            <p className="text-[13px] text-mute py-4 text-center">Loading items…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-mute py-4 text-center">
              No items in this sprint yet.
            </p>
          ) : (
            itemsByCategory.map((group) => (
              <section key={group.category} className="mb-4">
                <header className="flex items-center justify-between bg-[#F1ECF7] px-[28px] py-2 mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_DOT_COLORS[group.category] }}
                    />
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  <span>{group.pts} pts</span>
                </header>
                {group.items.map((it) => (
                  <ItemRow key={it.id} item={it} projectId={sprint.projectId} />
                ))}
              </section>
            ))
          )}
        </div>
      </main>

      <OverviewSidebar sprint={sprint} />
    </div>
  );
}

function ItemRow({ item, projectId }: { item: SprintItem; projectId: number }) {
  const detailPath =
    item.itemType === 'story'
      ? `/projects/${projectId}/stories/${item.id}`
      : item.itemType === 'epic'
        ? `/projects/${projectId}/epics/${item.id}`
        : `/projects/${projectId}/tasks/${item.id}`;
  return (
    <Link
      to={detailPath}
      className="flex items-center gap-3 px-[28px] py-1.5 border-b border-rule text-[13px] hover:bg-paper/50"
    >
      <TypeTag kind={item.itemType} size="sm" />
      <span className="font-mono text-[12px] text-faint w-[90px]">{item.itemKey}</span>
      <span className="flex-1 truncate">{item.title}</span>
      <LabelList labels={item.labels ?? []} max={2} size="sm" />
      <span className="w-[40px] font-mono text-[12px] text-right">
        {item.storyPoints ?? '—'}
      </span>
      <span className="w-[28px] flex justify-center">
        {item.assignee ? (
          <Avatar user={item.assignee} size="xs" />
        ) : (
          <span className="w-5 h-5 rounded-full border border-dashed border-rule-2" />
        )}
      </span>
    </Link>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
