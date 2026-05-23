/**
 * Single source of truth for Trackero's keyboard shortcuts.
 *
 * The `ShortcutsHelp` modal renders these sections verbatim; the
 * `useKeyboardShortcuts` hook reads from the same list so the help
 * dialog never advertises a shortcut that isn't wired (and vice
 * versa). When you add a shortcut, append a row to one of the
 * sections AND wire its handler in the hook — both edits in the same
 * PR.
 *
 * Cross-platform key rendering: Mac users see ⌘, others see Ctrl.
 * `formatModifierKey` picks the right glyph at render time.
 */
export interface ShortcutEntry {
  /** What the user reads on the chip. e.g. "⌘K", "G then B", "Esc". */
  key: string;
  /** Plain-English description of what the shortcut does. */
  label: string;
}

export interface KeymapSection {
  title: string;
  entries: ShortcutEntry[];
}

const isApple =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Renders ⌘ on Apple, Ctrl elsewhere. */
export const MOD_KEY = isApple ? '⌘' : 'Ctrl';

export const KEYMAP: KeymapSection[] = [
  {
    title: 'Navigation',
    entries: [
      { key: `${MOD_KEY}K`, label: 'Open command palette' },
      { key: '?', label: 'Show this help' },
      { key: 'Esc', label: 'Close any modal, drawer, or palette' },
    ],
  },
  {
    title: 'Global',
    entries: [
      { key: 'C', label: 'Create item (in current project)' },
      { key: 'M', label: 'Assign focused item to me' },
      { key: 'B', label: 'Go to Board (in current project)' },
      { key: 'L', label: 'Go to Backlog (in current project)' },
      { key: 'S', label: 'Go to Sprints (in current project)' },
      { key: 'T', label: 'Go to Today' },
      { key: 'G then E', label: 'Go to Epics (in current project)' },
    ],
  },
];

/**
 * Flat list of every shortcut key used anywhere in the app. Useful for
 * tests asserting there are no duplicates.
 */
export const ALL_SHORTCUT_KEYS: string[] = KEYMAP.flatMap((section) =>
  section.entries.map((e) => e.key),
);
