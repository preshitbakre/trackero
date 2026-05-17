export function clampLimit(limit: number | undefined, max = 100, defaultVal = 20): number {
  const val = limit ?? defaultVal;
  if (val <= 0 || val > max) return defaultVal;
  return val;
}
