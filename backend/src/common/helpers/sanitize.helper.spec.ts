import { escapeHtml, stripHtml } from './sanitize.helper';

/**
 * Sanitize-helper correctness tests (Task 5.3).
 *
 * `escapeHtml` must render user-controlled values inert inside HTML markup
 * (emails) WITHOUT discarding their text — unlike `stripHtml` which removes
 * tags entirely. The ampersand MUST be escaped first, otherwise the `&` in the
 * subsequent entities (`&lt;` etc.) would itself be double-escaped.
 */
describe('escapeHtml', () => {
  it('escapes <script> tags into inert entities', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes a bare ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes double and single quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    expect(escapeHtml("it's mine")).toBe('it&#39;s mine');
  });

  it('escapes the ampersand FIRST (no double-escaping of generated entities)', () => {
    // If `<` were escaped before `&`, the `&` in `&lt;` would become `&amp;lt;`.
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('<')).not.toBe('&amp;lt;');
    // A literal entity-looking input must be escaped exactly once.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves a plain string unchanged', () => {
    expect(escapeHtml('Just a normal title 123')).toBe('Just a normal title 123');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes an HTML-injection payload fully', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });
});

describe('stripHtml', () => {
  it('still removes tags entirely (unchanged behaviour)', () => {
    expect(stripHtml('<b>hello</b>')).toBe('hello');
  });
});
