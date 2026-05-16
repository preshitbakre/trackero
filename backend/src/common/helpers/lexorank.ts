const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

export function calculateMidpoint(
  before: string | null,
  after: string | null,
): string {
  if (!before && !after) return 'n';

  if (!before) {
    return decrementString(after!);
  }

  if (!after) {
    return incrementString(before);
  }

  return midpointString(before, after);
}

function incrementString(s: string): string {
  const lastChar = s[s.length - 1];
  const lastIndex = ALPHABET.indexOf(lastChar);

  if (lastIndex < ALPHABET.length - 1) {
    return s.slice(0, -1) + ALPHABET[lastIndex + 1];
  }
  return s + 'n';
}

function decrementString(s: string): string {
  const lastChar = s[s.length - 1];
  const lastIndex = ALPHABET.indexOf(lastChar);

  if (lastIndex > 0) {
    return s.slice(0, -1) + ALPHABET[lastIndex - 1];
  }
  return s.slice(0, -1) + ALPHABET[0] + 'n';
}

function midpointString(a: string, b: string): string {
  const maxLen = Math.max(a.length, b.length);
  const paddedA = a.padEnd(maxLen, ALPHABET[0]);
  const paddedB = b.padEnd(maxLen, ALPHABET[0]);

  let numA = 0;
  let numB = 0;
  for (let i = 0; i < maxLen; i++) {
    numA = numA * 26 + ALPHABET.indexOf(paddedA[i]);
    numB = numB * 26 + ALPHABET.indexOf(paddedB[i]);
  }

  const mid = Math.floor((numA + numB) / 2);

  if (mid === numA || mid === numB) {
    return a + 'n';
  }

  let result = '';
  let remaining = mid;
  for (let i = 0; i < maxLen; i++) {
    const power = Math.pow(26, maxLen - 1 - i);
    const charIndex = Math.floor(remaining / power);
    result += ALPHABET[charIndex];
    remaining -= charIndex * power;
  }

  return result.replace(/a+$/, '') || 'a';
}

export function rebalanceSortOrders(count: number): string[] {
  const result: string[] = [];
  const step = Math.floor(ALPHABET.length / (count + 1));
  for (let i = 0; i < count; i++) {
    result.push(ALPHABET[(i + 1) * step] || ALPHABET[ALPHABET.length - 1]);
  }
  return result;
}
