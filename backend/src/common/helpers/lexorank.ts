/**
 * Fractional indexing ("lexorank") helper.
 *
 * Produces short string "rank" keys used as a `sortOrder` column so work items
 * can be reordered (drag-and-drop) without renumbering siblings: to move an
 * item, you compute a key that sorts lexicographically strictly between its two
 * new neighbours and write only that one row.
 *
 * Invariants this module guarantees:
 *  - Every key is a non-empty string over the alphabet `a`..`z`.
 *  - No key ever ends in `'a'` (the alphabet's first/min char). This keeps the
 *    "strictly between" arithmetic well-defined: a trailing min char carries no
 *    information (it equals the implicit padding) and would create ambiguity.
 *  - For any two keys produced here with `a < b` (plain string compare),
 *    `calculateMidpoint(a, b)` returns a key `m` with `a < m < b`, ALWAYS —
 *    even when `a` and `b` are lexicographically adjacent. There is no numeric
 *    conversion anywhere, so there is no `Number.MAX_SAFE_INTEGER` overflow and
 *    no precision loss; the algorithm is purely per-character.
 *
 * Algorithm (generate a key strictly between `a` and `b`):
 *   Treat a missing lower bound as an infinitely-small string and a missing
 *   upper bound as an infinitely-large string. Walk both strings position by
 *   position. While the character at position `i` is equal in both, copy it to
 *   the result (shared prefix). At the first position where they differ:
 *     - If there is at least one character strictly between `a[i]` and `b[i]`,
 *       emit the midpoint character and stop — done.
 *     - Otherwise `b[i] === a[i] + 1` (adjacent): emit `a[i]`, then "descend"
 *       past the end of `a` — the upper bound is now effectively `+infinity`
 *       for the remaining positions, so we just need a key strictly greater
 *       than the rest of `a`. We append a character strictly above the
 *       remaining tail of `a` (the MID char if the tail is empty, or one above
 *       the tail's first char, recursively descending while that char is the
 *       alphabet max).
 *   This terminates because each descend step consumes one character of `a`,
 *   and once `a` is exhausted appending the MID char is always strictly
 *   greater than "nothing".
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const MIN_CHAR = ALPHABET[0]; // 'a'
const MAX_CHAR = ALPHABET[ALPHABET.length - 1]; // 'z'
/** Index of a comfortable middle character ('n'). */
const MID_INDEX = Math.floor(ALPHABET.length / 2);
const MID_CHAR = ALPHABET[MID_INDEX];

/** Numeric (0-based) value of a single alphabet character. */
function ord(ch: string): number {
  return ch.charCodeAt(0) - 97; // 'a' === 97
}

/** Character for a 0-based alphabet index. */
function chr(index: number): string {
  return ALPHABET[index];
}

/**
 * Returns a key strictly greater than `tail` whose own last character is not
 * the min char. `tail` is the remaining (un-consumed) suffix of the lower
 * bound; the upper bound is treated as +infinity here.
 *
 * If `tail` is empty, the MID char already beats "nothing".
 * Otherwise we look at `tail[0]`:
 *   - if it is below MAX_CHAR, emit one character above it (and we are done —
 *     that single char already exceeds the whole tail);
 *   - if it equals MAX_CHAR, we cannot go above it at this position, so emit
 *     MAX_CHAR and recurse on the rest of the tail.
 */
function keyAfterTail(tail: string): string {
  if (tail.length === 0) {
    return MID_CHAR;
  }
  const head = tail[0];
  if (head !== MAX_CHAR) {
    // A char strictly above `head` at this position already sorts after the
    // entire tail (since later positions can only lower the value). Pick the
    // midpoint between `head` and the alphabet's end so future inserts on
    // either side still have room.
    // `midIndex` is always >= ord(head)+1: the floored half-gap term is never
    // negative because `head < MAX_CHAR` guarantees ord(head)+1 <= ALPHABET.length-1.
    const midIndex = ord(head) + 1 + Math.floor((ALPHABET.length - 1 - (ord(head) + 1)) / 2);
    return chr(midIndex);
  }
  // head === MAX_CHAR: must keep it and descend.
  return MAX_CHAR + keyAfterTail(tail.slice(1));
}

/**
 * Core: a key strictly between `lower` and `upper`.
 * `lower === ''` means -infinity, `upper === ''` means +infinity.
 * Caller guarantees `lower < upper` (lexicographically) when both are non-empty.
 */
function between(lower: string, upper: string): string {
  let prefix = '';
  let i = 0;

  for (;;) {
    const loChar = i < lower.length ? lower[i] : null;
    const hiChar = i < upper.length ? upper[i] : null;

    if (loChar !== null && hiChar !== null && loChar === hiChar) {
      // Shared prefix — copy and advance.
      prefix += loChar;
      i++;
      continue;
    }

    if (loChar !== null) {
      // Lower bound is still active at this position.
      const loIndex = ord(loChar);
      // Upper value at position i (one-past-MAX if upper is exhausted).
      const hiIndex = hiChar !== null ? ord(hiChar) : ALPHABET.length;

      if (hiIndex - loIndex > 1) {
        // Room for a character strictly between them at this position.
        const midIndex = loIndex + Math.floor((hiIndex - loIndex) / 2);
        return prefix + chr(midIndex);
      }

      // Adjacent (hiIndex === loIndex + 1, possibly with upper exhausted at
      // lower's MAX char). Emit the lower bound's char, then descend: the upper
      // bound no longer constrains the remaining positions, so we just need a
      // tail that beats the rest of `lower`.
      prefix += loChar;
      return prefix + keyAfterTail(lower.slice(i + 1));
    }

    // Lower bound is exhausted (treated as -infinity from here on). We need a
    // key strictly between `prefix` and `upper`, where `upper` has more
    // characters than `prefix`. We must NOT emit a key that ends in the min
    // char (it would pin against the prefix and leave no room below it), so we
    // copy `upper`'s remaining min chars and stop at its first char above min,
    // then halve that gap.
    if (hiChar === null) {
      // `upper` is exhausted too, which can only happen when every character of
      // `upper` past the shared prefix was the min char (each one copied via
      // the `upper[i] === 'a'` branch below). That means `after` ends in the
      // min char, which leaves no room strictly below it — an invalid bound,
      // just like `before >= after`. Reject it with a clear error.
      throw new Error(
        `calculateMidpoint: 'after' must not end in the min char ('${MIN_CHAR}'); ` +
          `a trailing min char carries no information and leaves no room below it`,
      );
    }
    const hiIndex2 = ord(hiChar);
    if (hiIndex2 > 0) {
      // upper[i] is above 'a'. Take the midpoint between index 0 and hiIndex2.
      // If that midpoint is > 0 it is a valid single char strictly below
      // upper[i] (and above the empty lower bound), so emit it and stop.
      const midIndex = Math.floor(hiIndex2 / 2);
      if (midIndex > 0) {
        return prefix + chr(midIndex);
      }
      // midIndex === 0: hiIndex2 === 1 (upper[i] === 'b'). No char strictly
      // between '' and 'b' at one position, so emit 'a' and descend with an
      // open upper bound — keyAfterTail guarantees a non-'a'-terminated tail.
      prefix += MIN_CHAR;
      return prefix + keyAfterTail('');
    }

    // upper[i] === 'a': copy it and keep walking; a later position of `upper`
    // must hold a char above 'a' (a valid key never ends in 'a').
    prefix += MIN_CHAR;
    i++;
  }
}

/**
 * Returns a string key that sorts strictly between `before` and `after`.
 *
 * - `(null, null)`        → a valid first key.
 * - `(null, after)`       → a key strictly BEFORE `after`.
 * - `(before, null)`      → a key strictly AFTER `before`.
 * - `(before, after)`     → a key strictly between them (requires before < after).
 *
 * The returned key is always non-empty and never ends in the min char.
 *
 * Preconditions (throws a clear `Error` if violated):
 *  - When both bounds are non-empty, `before` must sort strictly before `after`.
 *  - `after` must not end in the min char (`'a'`). A trailing min char carries
 *    no information and leaves no room strictly below it. Keys produced by this
 *    module never end in the min char, so this only matters for hand-crafted
 *    input.
 */
export function calculateMidpoint(
  before: string | null,
  after: string | null,
): string {
  const lower = before ?? '';
  const upper = after ?? '';

  if (lower !== '' && upper !== '' && lower >= upper) {
    throw new Error(
      `calculateMidpoint: 'before' (${before}) must sort before 'after' (${after})`,
    );
  }

  if (lower === '' && upper === '') {
    return MID_CHAR;
  }

  return between(lower, upper);
}

/**
 * Returns `count` keys that are strictly increasing and all distinct — for any
 * `count`. Use this to assign fresh `sortOrder` values to an entire list (e.g.
 * after a migration or when re-balancing a list whose keys have grown long).
 */
export function rebalanceSortOrders(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  const result: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < count; i++) {
    // Always append after the previous key with an open upper bound. This
    // yields evenly progressing, strictly increasing, distinct keys regardless
    // of how large `count` is.
    const key = calculateMidpoint(previous, null);
    result.push(key);
    previous = key;
  }
  return result;
}
