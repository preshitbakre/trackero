import type { StoryListItem, StoryView, EpicHealth, EpicListItem } from './types';

export interface StoryGroup {
  key: string;
  // Header metadata — shape depends on the view.
  header: {
    kind: StoryView;
    title: string;
    epicKey?: string | null;
    epicId?: number | null;
    health?: EpicHealth | null;
    statusCategory?: string | null;
  };
  items: StoryListItem[];
  doneCount: number;
  totalCount: number;
  points: number;
}

const STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  in_progress: 1,
  in_review: 2,
  done: 3,
  cancelled: 4,
};

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Open',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** The epic health pill value is the Epics API's computed `displayState`. */
export function epicHealth(epic: EpicListItem | undefined): EpicHealth {
  return epic?.displayState ?? 'planning';
}

function tally(items: StoryListItem[]) {
  let done = 0;
  let points = 0;
  for (const s of items) {
    if (s.status?.category === 'done') done++;
    points += s.storyPoints ?? 0;
  }
  return { done, points, total: items.length };
}

/** Group stories for a given view. Returns ordered groups. */
export function groupStories(
  stories: StoryListItem[],
  view: StoryView,
  epicsById: Map<number, EpicListItem>,
): StoryGroup[] {
  if (view === 'status') {
    const buckets = new Map<string, StoryListItem[]>();
    for (const s of stories) {
      const cat = s.status?.category ?? 'backlog';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(s);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => (STATUS_ORDER[a[0]] ?? 9) - (STATUS_ORDER[b[0]] ?? 9))
      .map(([cat, items]) => {
        const t = tally(items);
        return {
          key: `status:${cat}`,
          header: { kind: 'status' as const, title: STATUS_LABEL[cat] ?? cat, statusCategory: cat },
          items,
          doneCount: t.done,
          totalCount: t.total,
          points: t.points,
        };
      });
  }

  if (view === 'sprint') {
    const buckets = new Map<string, StoryListItem[]>();
    for (const s of stories) {
      const key = s.sprint ? `sprint:${s.sprint.id}` : 'sprint:backlog';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(s);
    }
    // Backlog group last.
    return Array.from(buckets.entries())
      .sort((a, b) => {
        if (a[0] === 'sprint:backlog') return 1;
        if (b[0] === 'sprint:backlog') return -1;
        return 0;
      })
      .map(([key, items]) => {
        const t = tally(items);
        const sprint = items[0]?.sprint;
        return {
          key,
          header: { kind: 'sprint' as const, title: sprint ? sprint.name : 'Backlog' },
          items,
          doneCount: t.done,
          totalCount: t.total,
          points: t.points,
        };
      });
  }

  // view === 'epic'
  const buckets = new Map<string, StoryListItem[]>();
  for (const s of stories) {
    const key = s.epicId != null ? `epic:${s.epicId}` : 'epic:unsorted';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(s);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => {
      if (a[0] === 'epic:unsorted') return 1;
      if (b[0] === 'epic:unsorted') return -1;
      return 0;
    })
    .map(([key, items]) => {
      const t = tally(items);
      const first = items[0];
      const epicId = first?.epicId ?? null;
      const epic = epicId != null ? epicsById.get(epicId) : undefined;
      return {
        key,
        header: {
          kind: 'epic' as const,
          title: epicId != null ? first?.epicTitle ?? 'Epic' : 'Unsorted',
          epicKey: epicId != null ? first?.epicKey : null,
          epicId,
          health: epicId != null ? epicHealth(epic) : null,
        },
        items,
        doneCount: t.done,
        totalCount: t.total,
        points: t.points,
      };
    });
}

/** Client-side filter: text (title/key) + the Mine + More facets. */
export interface StoryFilters {
  search: string;
  mineUserId: number | null; // when set, only stories assigned to this user
  assigneeIds: number[];
  labelIds: number[];
  priorities: string[];
  sprintIds: (number | null)[];
}

export function filterStories(stories: StoryListItem[], f: StoryFilters): StoryListItem[] {
  const q = f.search.trim().toLowerCase();
  return stories.filter((s) => {
    if (q) {
      const hay = `${s.title} ${s.itemKey}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.mineUserId != null && s.assignee?.id !== f.mineUserId) return false;
    if (f.assigneeIds.length > 0 && (!s.assignee || !f.assigneeIds.includes(s.assignee.id))) return false;
    if (f.labelIds.length > 0 && !s.labels.some((l) => f.labelIds.includes(l.id))) return false;
    if (f.priorities.length > 0 && !f.priorities.includes(s.priority)) return false;
    if (f.sprintIds.length > 0) {
      const sid = s.sprint?.id ?? null;
      if (!f.sprintIds.includes(sid)) return false;
    }
    return true;
  });
}
