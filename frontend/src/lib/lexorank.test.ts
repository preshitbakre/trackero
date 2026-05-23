import { describe, it, expect } from 'vitest';
import { calculateMidpoint, rebalanceSortOrders } from './lexorank';

/**
 * Lexorank / fractional-indexing correctness tests.
 *
 * Ported 1:1 from backend/src/common/helpers/lexorank.spec.ts (Task 5.2). The
 * single invariant: every key the helper produces must be comparable with
 * plain JS string `<` and the ordering must be correct & stable. There must be
 * NO collisions, no matter how many inserts happen — including the pathological
 * "always insert between the same two neighbours" case.
 */
describe('lexorank', () => {
  describe('calculateMidpoint', () => {
    it('returns a non-empty first key for (null, null)', () => {
      const key = calculateMidpoint(null, null);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('(null, X) sorts strictly before X', () => {
      const x = calculateMidpoint(null, null);
      const before = calculateMidpoint(null, x);
      expect(before < x).toBe(true);
    });

    it('(X, null) sorts strictly after X', () => {
      const x = calculateMidpoint(null, null);
      const after = calculateMidpoint(x, null);
      expect(after > x).toBe(true);
    });

    it('(A, B) with A < B yields a key strictly between them', () => {
      const a = calculateMidpoint(null, null);
      const b = calculateMidpoint(a, null);
      const mid = calculateMidpoint(a, b);
      expect(a < mid).toBe(true);
      expect(mid < b).toBe(true);
    });

    it('repeatedly prepending before the smallest key always stays smaller', () => {
      let smallest = calculateMidpoint(null, null);
      for (let i = 0; i < 200; i++) {
        const next = calculateMidpoint(null, smallest);
        expect(next < smallest).toBe(true);
        smallest = next;
      }
    });

    it('repeatedly appending after the largest key always stays larger', () => {
      let largest = calculateMidpoint(null, null);
      for (let i = 0; i < 200; i++) {
        const next = calculateMidpoint(largest, null);
        expect(next > largest).toBe(true);
        largest = next;
      }
    });

    it('no collision after 1000 sequential appends + ordering preserved', () => {
      const keys: string[] = [calculateMidpoint(null, null)];
      for (let i = 0; i < 1000; i++) {
        const next = calculateMidpoint(keys[keys.length - 1], null);
        keys.push(next);
      }
      // strictly increasing
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
      // all distinct
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('no collision after 1000 inserts between the LAST two keys', () => {
      // Start with two bounding keys, then keep inserting between the last two
      // (i.e. between the running 2nd-last and last). This stresses the
      // descend path repeatedly near the high end.
      const first = calculateMidpoint(null, null);
      const last = calculateMidpoint(first, null);
      const keys: string[] = [first, last];
      for (let i = 0; i < 1000; i++) {
        const lower = keys[keys.length - 2];
        const upper = keys[keys.length - 1];
        const mid = calculateMidpoint(lower, upper);
        expect(lower < mid).toBe(true);
        expect(mid < upper).toBe(true);
        keys.splice(keys.length - 1, 0, mid);
      }
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('no collision after 1000 inserts between the SAME two adjacent neighbours', () => {
      // The classic collision case: A and B are fixed, and we keep producing
      // a new key strictly between A and the *current* lower bound's neighbour.
      // We always insert immediately after A (between A and whatever is now
      // directly after A). Every generated key must be distinct, strictly
      // between the surrounding pair, and the set must stay correctly ordered.
      const a = calculateMidpoint(null, null);
      const b = calculateMidpoint(a, null);
      // ordered list between a and b (exclusive); we always insert right after a.
      const between: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const upper = between.length > 0 ? between[0] : b;
        const mid = calculateMidpoint(a, upper);
        expect(a < mid).toBe(true);
        expect(mid < upper).toBe(true);
        between.unshift(mid);
      }
      const full = [a, ...between, b];
      for (let i = 1; i < full.length; i++) {
        expect(full[i - 1] < full[i]).toBe(true);
      }
      expect(new Set(full).size).toBe(full.length);
    });

    it('throws a clear error when `after` ends in the min char', () => {
      // `after` ending in 'a' past the shared prefix leaves no room strictly
      // below it — an invalid bound, like `before >= after`. It must throw a
      // clear Error, not crash with an opaque TypeError.
      expect(() => calculateMidpoint('n', 'naa')).toThrow(
        /must not end in the min char/,
      );
      expect(() => calculateMidpoint('mz', 'mza')).toThrow(
        /must not end in the min char/,
      );
    });

    it('inserting always in the MIDDLE of the list 1000 times stays ordered & distinct', () => {
      const keys: string[] = [calculateMidpoint(null, null)];
      keys.push(calculateMidpoint(keys[0], null));
      for (let i = 0; i < 1000; i++) {
        const idx = Math.floor(keys.length / 2);
        const lower = keys[idx - 1];
        const upper = keys[idx];
        const mid = calculateMidpoint(lower, upper);
        expect(lower < mid).toBe(true);
        expect(mid < upper).toBe(true);
        keys.splice(idx, 0, mid);
      }
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('rebalanceSortOrders', () => {
    it('returns 0 keys for count 0', () => {
      expect(rebalanceSortOrders(0)).toEqual([]);
    });

    it('returns exactly 1 key for count 1', () => {
      const keys = rebalanceSortOrders(1);
      expect(keys).toHaveLength(1);
      expect(typeof keys[0]).toBe('string');
      expect(keys[0].length).toBeGreaterThan(0);
    });

    it('returns 100 strictly-increasing distinct keys', () => {
      const keys = rebalanceSortOrders(100);
      expect(keys).toHaveLength(100);
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
      expect(new Set(keys).size).toBe(100);
    });

    it('returns 1000 strictly-increasing distinct keys', () => {
      const keys = rebalanceSortOrders(1000);
      expect(keys).toHaveLength(1000);
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
      expect(new Set(keys).size).toBe(1000);
    });

    it('rebalanced keys interleave cleanly with fresh inserts', () => {
      const keys = rebalanceSortOrders(50);
      // insert between every adjacent pair
      for (let i = 0; i < keys.length - 1; i++) {
        const mid = calculateMidpoint(keys[i], keys[i + 1]);
        expect(keys[i] < mid).toBe(true);
        expect(mid < keys[i + 1]).toBe(true);
      }
    });
  });
});
