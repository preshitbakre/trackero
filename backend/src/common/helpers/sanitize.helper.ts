export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * HTML-escapes a string so it renders as inert text inside HTML markup
 * (including inside attribute values). Unlike `stripHtml`, the original text
 * is preserved — tags are neutralised, not removed. Used by email templates
 * to prevent HTML/script injection via user-controlled values.
 *
 * The `&` MUST be escaped first; otherwise the `&` in the entities produced
 * for `<`, `>`, `"`, `'` would themselves be double-escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
