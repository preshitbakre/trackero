/**
 * Split a flat task list into top-level rows + a parent→subtasks map.
 * A subtask nests under its parent only when the parent is present in the
 * same list; otherwise it promotes to a top-level row (e.g. when a type
 * filter hides the parent but keeps the subtask).
 */
export function groupByParent<T extends { id: number; parentId: number | null }>(
  tasks: T[],
): { parentTasks: T[]; subtaskMap: Map<number, T[]> } {
  const ids = new Set(tasks.map((t) => t.id));
  const subtaskMap = new Map<number, T[]>();
  const parentTasks: T[] = [];
  for (const t of tasks) {
    if (t.parentId != null && ids.has(t.parentId)) {
      const list = subtaskMap.get(t.parentId) || [];
      list.push(t);
      subtaskMap.set(t.parentId, list);
    } else {
      parentTasks.push(t);
    }
  }
  return { parentTasks, subtaskMap };
}
