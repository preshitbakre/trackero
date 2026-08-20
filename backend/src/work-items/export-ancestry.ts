// Ancestry resolution for the ticket export. A work item's parent is found via
// one of two mechanisms (Trackero's HIERARCHY-RULES): a subtask points at its
// parent through `parentId`; every other type links up through a `belongs_to`
// association (item_id belongs_to linked_item_id → linked_item_id is the parent).

export interface AncestryNode {
  id: number;
  itemType: string;
  parentId: number | null;
}

/**
 * Walk from `itemId` up to the top of its hierarchy and return the ancestor ids
 * ordered top-most first (excluding `itemId` itself). Subtasks hop via
 * `parentId`; all other items hop via their first `belongs_to` parent. A
 * visited-set guards against association cycles.
 *
 * ponytail: takes only the first belongs_to parent per level — an item linked to
 * multiple containers exports under one path. Add multi-path rows if needed.
 */
export function resolveAncestry(
  itemId: number,
  itemMap: Map<number, AncestryNode>,
  belongsToParent: Map<number, number>,
): number[] {
  const chain: number[] = [];
  const visited = new Set<number>([itemId]);
  let current = itemId;

  while (true) {
    const node = itemMap.get(current);
    let parent: number | undefined;
    if (node && node.itemType === 'subtask' && node.parentId != null) {
      parent = node.parentId;
    } else {
      parent = belongsToParent.get(current);
    }
    if (parent == null || visited.has(parent) || !itemMap.has(parent)) break;
    visited.add(parent);
    chain.push(parent);
    current = parent;
  }

  return chain.reverse();
}
