export function clampLimit(limit: number | undefined, max = 300, defaultVal = 20): number {
  const val = limit ?? defaultVal;
  if (val <= 0) return defaultVal;
  return Math.min(val, max);
}
