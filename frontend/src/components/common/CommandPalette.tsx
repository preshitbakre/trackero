import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiClient } from '../../api/client';
import { KbdKey, TypeTag } from '../ui';
import type { TypeTagKind } from '../ui';

/**
 * Phase 4 — sectioned command palette per frame 5.
 *
 * Sections: Work items / Projects / Sprints / People / Quick actions / Go to
 * Footer: ↑↓ navigate · ↵ open · Tab filter type · N of M results
 * Scope chip flips between "in <currentProject>" and "in entire instance".
 * Open-by-ID: typing PROJ4-12 + Enter navigates straight to that item.
 */

interface WorkItem {
  id: number;
  itemType: string;
  itemKey: string;
  title: string;
  projectId: number;
  projectName: string;
  status: { name: string; color: string };
  assignee: { id: number; displayName: string; avatarUrl?: string | null } | null;
  storyPoints?: number | null;
}
interface ProjectHit {
  id: number;
  name: string;
  prefix: string;
}
interface SprintHit {
  id: number;
  name: string;
  sprintNumber: number;
  projectId: number;
  projectName: string;
  status: string;
}
interface PersonHit {
  id: number;
  displayName: string;
  email: string;
}
interface QuickAction {
  id: string;
  kind: 'new_bug' | 'new_task' | 'new_story' | 'new_epic';
  label: string;
  payload: { itemType: string; title: string };
}
interface GoToEntry {
  id: string;
  label: string;
  path: string;
}
interface Sectioned {
  workItems: WorkItem[];
  projects: ProjectHit[];
  sprints: SprintHit[];
  people: PersonHit[];
  quickActions: QuickAction[];
  goTo: GoToEntry[];
  total: number;
}

type SectionKey = 'all' | 'workItems' | 'projects' | 'sprints' | 'people';

const SECTION_ORDER: SectionKey[] = ['all', 'workItems', 'projects', 'sprints', 'people'];
const SECTION_LABEL: Record<SectionKey, string> = {
  all: 'All',
  workItems: 'Work items',
  projects: 'Projects',
  sprints: 'Sprints',
  people: 'People',
};

interface FlatRow {
  key: string;
  section: 'workItems' | 'projects' | 'sprints' | 'people' | 'quickActions' | 'goTo';
  onActivate: () => void;
  render: () => React.ReactElement;
}


export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive the current project context from the URL.
  const currentProjectId = useMemo(() => {
    const m = location.pathname.match(/\/projects\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }, [location.pathname]);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'current' | 'instance'>(currentProjectId ? 'current' : 'instance');
  const [filter, setFilter] = useState<SectionKey>('all');
  const [data, setData] = useState<Sectioned | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentProject, setCurrentProject] = useState<{ name: string; prefix: string } | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Resolve current project name once for the scope chip.
  useEffect(() => {
    if (!currentProjectId) {
      setCurrentProject(null);
      return;
    }
    apiClient
      .get(`/projects/${currentProjectId}`)
      .then((res) => {
        const item = res.data?.data?.item ?? res.data?.data;
        if (item?.name) setCurrentProject({ name: item.name, prefix: item.prefix });
      })
      .catch(() => setCurrentProject(null));
  }, [currentProjectId]);

  // Debounced fetch.
  useEffect(() => {
    if (query.trim().length < 2) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams();
        qs.set('q', query.trim());
        if (currentProjectId && scope === 'current') qs.set('projectId', String(currentProjectId));
        qs.set('scope', scope);
        const res = await apiClient.get(`/search?${qs.toString()}`, { signal: ctrl.signal });
        const body = res.data?.data as Sectioned;
        setData(body);
        setSelectedIndex(0);
      } catch (err: any) {
        if (err?.name !== 'CanceledError') {
          setError('Search is having trouble. Try again.');
          setData(null);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(id);
    };
  }, [query, scope, currentProjectId]);

  // Build a flat list of rows in display order, honouring the type filter.
  const rows: FlatRow[] = useMemo(() => {
    if (!data) return [];
    const acc: FlatRow[] = [];

    if (filter === 'all' || filter === 'workItems') {
      for (const w of data.workItems) {
        acc.push({
          key: `wi-${w.id}`,
          section: 'workItems',
          onActivate: () => {
            navigate(navPathForItem(w));
            onClose();
          },
          render: () => <WorkItemRow item={w} />,
        });
      }
    }
    if (filter === 'all' || filter === 'projects') {
      for (const p of data.projects) {
        acc.push({
          key: `p-${p.id}`,
          section: 'projects',
          onActivate: () => {
            navigate(`/projects/${p.id}/board`);
            onClose();
          },
          render: () => <ProjectRow p={p} />,
        });
      }
    }
    if (filter === 'all' || filter === 'sprints') {
      for (const s of data.sprints) {
        acc.push({
          key: `s-${s.id}`,
          section: 'sprints',
          onActivate: () => {
            navigate(`/projects/${s.projectId}/sprints`);
            onClose();
          },
          render: () => <SprintRow s={s} />,
        });
      }
    }
    if (filter === 'all' || filter === 'people') {
      for (const u of data.people) {
        acc.push({
          key: `u-${u.id}`,
          section: 'people',
          onActivate: () => {
            navigate(`/profile?user=${u.id}`);
            onClose();
          },
          render: () => <PersonRow u={u} />,
        });
      }
    }
    if (filter === 'all') {
      for (const qa of data.quickActions) {
        acc.push({
          key: `qa-${qa.id}`,
          section: 'quickActions',
          onActivate: () => {
            document.dispatchEvent(
              new CustomEvent('shortcut-create-item', { detail: qa.payload }),
            );
            onClose();
          },
          render: () => <QuickActionRow qa={qa} />,
        });
      }
      for (const g of data.goTo) {
        acc.push({
          key: `g-${g.id}`,
          section: 'goTo',
          onActivate: () => {
            navigate(g.path);
            onClose();
          },
          render: () => <GoToRow g={g} />,
        });
      }
    }
    return acc;
  }, [data, filter, navigate, onClose]);

  // Keep selectedIndex in bounds when rows change.
  useEffect(() => {
    if (selectedIndex >= rows.length) setSelectedIndex(Math.max(0, rows.length - 1));
  }, [rows.length, selectedIndex]);

  // Item-key shortcut: PROJ4-12 + Enter navigates directly even before debounce
  // surfaces a row. Recognises any uppercase prefix + digits.
  const itemKeyMatch = query.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]+)-(\d+)$/);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const next = SECTION_ORDER[(SECTION_ORDER.indexOf(filter) + (e.shiftKey ? -1 + SECTION_ORDER.length : 1)) % SECTION_ORDER.length];
      setFilter(next);
      setSelectedIndex(0);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, rows.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (itemKeyMatch && rows.length === 0) {
        // Open-by-ID even before a row exists. Look up item by prefix+number
        // via the search results above (we'll also have the row matching).
        // Direct API resolution:
        const prefix = itemKeyMatch[1];
        const num = itemKeyMatch[2];
        apiClient
          .get(`/search?q=${encodeURIComponent(`${prefix}-${num}`)}&scope=instance`)
          .then((res) => {
            const items = (res.data?.data?.workItems ?? []) as WorkItem[];
            const hit = items.find((w) => w.itemKey.toUpperCase() === `${prefix}-${num}`);
            if (hit) {
              navigate(navPathForItem(hit));
              onClose();
            }
          })
          .catch(() => {});
        return;
      }
      const row = rows[selectedIndex];
      if (row) row.onActivate();
    }
  };

  // Group rendered rows by section to draw section headers.
  const groupedForRender = useMemo(() => {
    const groups: Array<{ section: FlatRow['section']; rows: FlatRow[] }> = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (last && last.section === r.section) {
        last.rows.push(r);
      } else {
        groups.push({ section: r.section, rows: [r] });
      }
    }
    return groups;
  }, [rows]);

  const scopeLabel =
    scope === 'current' && currentProject
      ? `in ${currentProject.name}`
      : 'in entire instance';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed top-[12%] left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl bg-card dark:bg-dneutral-100 rounded-xl shadow-2xl overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center px-4 border-b border-rule">
          <Search size={16} className="text-faint mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search items, projects, people…"
            className="flex-1 py-3 text-[16px] bg-transparent outline-none text-text placeholder-faint"
          />
          {currentProjectId && (
            <button
              type="button"
              onClick={() => setScope((s) => (s === 'current' ? 'instance' : 'current'))}
              className={`ml-2 px-2 py-1 rounded-full text-[11px] uppercase tracking-[0.14em] font-semibold ${
                scope === 'current' ? 'bg-lilac-tint text-lilac-dark' : 'bg-paper text-mute hover:bg-rule'
              }`}
              title="Toggle search scope"
            >
              {scopeLabel}
            </button>
          )}
        </div>

        {/* Filter chips */}
        {data && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-rule bg-paper/50">
            {SECTION_ORDER.map((k) => {
              const count =
                k === 'all'
                  ? data.workItems.length + data.projects.length + data.sprints.length + data.people.length
                  : (data[k as keyof Sectioned] as unknown as unknown[])?.length ?? 0;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setFilter(k); setSelectedIndex(0); }}
                  className={`px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.14em] font-semibold ${
                    filter === k ? 'bg-card text-ink shadow-sm' : 'text-mute hover:text-text'
                  }`}
                >
                  {SECTION_LABEL[k]}
                  {count > 0 && <span className="ml-1 text-faint">·{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {loading && <div className="px-4 py-6 text-[13px] text-mute">Searching…</div>}
          {error && <div className="px-4 py-6 text-[13px] text-amber-dark">{error}</div>}

          {!loading && !error && query.length >= 2 && data && rows.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-mute">
              {itemKeyMatch ? `Press Enter to open ${itemKeyMatch[1]}-${itemKeyMatch[2]}` : `No matches for "${query}".`}
            </div>
          )}

          {!loading && !error && query.length < 2 && (
            <div className="px-4 py-6 text-center text-[14px] text-mute italic">
              Type at least 2 characters to search. <span className="text-faint">Try a name, a key like PROJ-12, or a command.</span>
            </div>
          )}

          {groupedForRender.map((grp, gi) => (
            <div key={`grp-${gi}-${grp.section}`} className="py-1">
              <div className="px-4 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-faint">
                {sectionTitle(grp.section)}
              </div>
              {grp.rows.map((row) => {
                const idx = rows.indexOf(row);
                const active = idx === selectedIndex;
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={row.onActivate}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
                      active ? 'bg-lilac-tint text-lilac-dark' : 'text-text hover:bg-paper'
                    }`}
                  >
                    {row.render()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-rule bg-paper/40 text-[11px] text-mute">
          <div className="flex items-center gap-3">
            <span><KbdKey>↑</KbdKey><KbdKey>↓</KbdKey> navigate</span>
            <span><KbdKey>↵</KbdKey> open</span>
            <span><KbdKey>Tab</KbdKey> filter type</span>
            <span><KbdKey>Esc</KbdKey> close</span>
          </div>
          <div>
            {rows.length > 0 ? `${selectedIndex + 1} of ${rows.length}` : null}
          </div>
        </div>
      </div>
    </>
  );
}

function sectionTitle(s: FlatRow['section']): string {
  switch (s) {
    case 'workItems': return 'Work items';
    case 'projects': return 'Projects';
    case 'sprints': return 'Sprints';
    case 'people': return 'People';
    case 'quickActions': return 'Quick actions';
    case 'goTo': return 'Go to';
  }
}

function navPathForItem(w: WorkItem): string {
  const t = w.itemType;
  if (t === 'epic') return `/projects/${w.projectId}/epics/${w.id}`;
  if (t === 'story') return `/projects/${w.projectId}/stories/${w.id}`;
  return `/projects/${w.projectId}/tasks/${w.id}`;
}

function WorkItemRow({ item }: { item: WorkItem }) {
  const assigneeLabel = item.assignee
    ? `@${item.assignee.displayName.split(' ')[0].toLowerCase()}`
    : 'unassigned';
  return (
    <>
      <TypeTag kind={(item.itemType || 'task') as TypeTagKind} size="sm" />
      <span className="text-[12px] font-mono text-faint flex-shrink-0">{item.itemKey}</span>
      <span className="text-[14px] flex-1 truncate">{item.title}</span>
      {/* Right column per frame 5: status pill · assignee · points.
          Mirrors the design's per-row metadata band so a result is
          actionable without opening it. */}
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] flex-shrink-0"
        style={{ backgroundColor: `${item.status.color}1A`, color: item.status.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.status.color }} />
        {item.status.name}
      </span>
      <span className="text-[11px] text-mute flex-shrink-0">{assigneeLabel}</span>
      {item.storyPoints != null && item.storyPoints > 0 && (
        <span className="text-[11px] text-mute tabular-nums flex-shrink-0">{item.storyPoints} pts</span>
      )}
    </>
  );
}

function ProjectRow({ p }: { p: ProjectHit }) {
  return (
    <>
      <span className="w-5 h-5 rounded-md bg-lilac/20 text-lilac-dark text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
        {p.name[0]?.toUpperCase()}
      </span>
      <span className="text-[14px] flex-1 truncate">{p.name}</span>
      <span className="text-[11px] tracking-wider uppercase text-faint flex-shrink-0">{p.prefix}</span>
    </>
  );
}

function SprintRow({ s }: { s: SprintHit }) {
  return (
    <>
      <span className="text-[10px] uppercase tracking-[0.14em] text-faint flex-shrink-0">Sprint {s.sprintNumber}</span>
      <span className="text-[14px] flex-1 truncate">{s.name}</span>
      <span className="text-[11px] text-mute flex-shrink-0">{s.projectName}</span>
      <span className="text-[10px] uppercase tracking-wider text-faint flex-shrink-0">{s.status}</span>
    </>
  );
}

function PersonRow({ u }: { u: PersonHit }) {
  return (
    <>
      <span className="w-5 h-5 rounded-full bg-lilac/20 text-lilac-dark text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
        {u.displayName[0]?.toUpperCase()}
      </span>
      <span className="text-[14px] flex-1 truncate">{u.displayName}</span>
      <span className="text-[11px] text-mute flex-shrink-0">{u.email}</span>
    </>
  );
}

function QuickActionRow({ qa }: { qa: QuickAction }) {
  return (
    <>
      <span className="w-5 h-5 rounded-md bg-mint-light text-mint-dark text-[12px] font-semibold flex items-center justify-center flex-shrink-0">+</span>
      <span className="text-[14px] flex-1 truncate">{qa.label}</span>
    </>
  );
}

function GoToRow({ g }: { g: GoToEntry }) {
  return (
    <>
      <span className="w-5 h-5 rounded-md bg-paper text-mute text-[12px] flex items-center justify-center flex-shrink-0">→</span>
      <span className="text-[14px] flex-1 truncate">{g.label}</span>
      <span className="text-[11px] text-faint font-mono flex-shrink-0">{g.path}</span>
    </>
  );
}
