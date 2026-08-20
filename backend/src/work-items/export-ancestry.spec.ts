import { resolveAncestry, AncestryNode } from './export-ancestry';

describe('resolveAncestry', () => {
  // epic 1 → story 2 (belongs_to) → task 3 (belongs_to) → subtask 4 (parentId)
  const itemMap = new Map<number, AncestryNode>([
    [1, { id: 1, itemType: 'epic', parentId: null }],
    [2, { id: 2, itemType: 'story', parentId: null }],
    [3, { id: 3, itemType: 'task', parentId: null }],
    [4, { id: 4, itemType: 'subtask', parentId: 3 }],
    [9, { id: 9, itemType: 'task', parentId: null }],
  ]);
  const belongsToParent = new Map<number, number>([
    [2, 1],
    [3, 2],
  ]);

  it('walks a subtask all the way to the top epic', () => {
    expect(resolveAncestry(4, itemMap, belongsToParent)).toEqual([1, 2, 3]);
  });

  it('walks a cross-type belongs_to chain', () => {
    expect(resolveAncestry(3, itemMap, belongsToParent)).toEqual([1, 2]);
  });

  it('returns empty for a root item with no parent', () => {
    expect(resolveAncestry(1, itemMap, belongsToParent)).toEqual([]);
    expect(resolveAncestry(9, itemMap, belongsToParent)).toEqual([]);
  });

  it('guards against a belongs_to cycle', () => {
    const cyclic = new Map<number, number>([[1, 2], [2, 1]]);
    const map = new Map<number, AncestryNode>([
      [1, { id: 1, itemType: 'task', parentId: null }],
      [2, { id: 2, itemType: 'task', parentId: null }],
    ]);
    // Must terminate and not loop forever.
    expect(resolveAncestry(1, map, cyclic)).toEqual([2]);
  });
});
