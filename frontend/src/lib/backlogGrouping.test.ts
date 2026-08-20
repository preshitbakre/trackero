import { describe, it, expect } from 'vitest';
import { groupByParent } from './backlogGrouping';

const t = (id: number, parentId: number | null = null) => ({ id, parentId });

describe('groupByParent', () => {
  it('nests subtasks under a present parent', () => {
    const { parentTasks, subtaskMap } = groupByParent([t(1), t(2, 1), t(3, 1)]);
    expect(parentTasks.map((p) => p.id)).toEqual([1]);
    expect(subtaskMap.get(1)?.map((s) => s.id)).toEqual([2, 3]);
  });

  it('promotes a subtask to top-level when its parent is filtered out', () => {
    // Parent (id 1) not in list — its subtask should become a top-level row.
    const { parentTasks, subtaskMap } = groupByParent([t(2, 1), t(3, 1)]);
    expect(parentTasks.map((p) => p.id)).toEqual([2, 3]);
    expect(subtaskMap.size).toBe(0);
  });
});
