/**
 * Trackero design tokens — single source of truth for visual values.
 *
 * The BRAND block carries the editorial direction (lilac + ink + paper).
 * The semantic blocks (PRIORITY / STATUS / TYPE / AVATAR) preserve meaning-bearing
 * colour assignments used by the rest of the UI.
 */

/** Brand & surface colours — used by layout, hero, and primary action. */
export const BRAND = {
  paper: '#FAF8FD',       // page background — lilac-tinted off-white
  card: '#FFFFFF',        // card / panel surface
  cream: '#FAF7F2',       // sidebar background — warm cream
  ink: '#1A1424',         // hero background, primary text on light
  lilac: '#7C3AED',       // primary action colour, brand accent
  lilacDark: '#6326D6',   // active state
  lilacTint: '#EFE7FD',   // hover / selected-row background
  text: '#1A1424',        // body text
  mute: '#6B6377',        // secondary text
  faint: '#A8A1B5',       // tertiary text / placeholder
  rule: '#E8E3F0',        // dividers, faint borders
} as const;

/** Shared priority badge styles — inline styles for guaranteed color consistency */
export const PRIORITY_BADGE_COLORS: Record<string, { bg: string; color: string } | null> = {
  urgent: { bg: '#E05252', color: '#FFFFFF' },
  high: { bg: '#E88A48', color: '#FFFFFF' },
  medium: { bg: '#D6B588', color: '#FFFFFF' },
  low: { bg: '#EFE7FD', color: '#6326D6' },
  none: null,
};

/** Priority left-border colors */
export const PRIORITY_BORDER_COLORS: Record<string, string> = {
  urgent: '#E05252',
  high: '#E88A48',
  medium: '#D6B588',
  low: '#88A9D6',
  none: '#D1CCC7',
};

/** Priority dot colours (used in inline lists, table rows) */
export const PRIORITY_DOT_COLORS: Record<string, string> = {
  urgent: '#E05252',
  high: '#E88A48',
  medium: '#D6B588',
  low: '#88A9D6',
  none: '#C9C2D6',
};

/** Status badge styles — inline styles for guaranteed color consistency */
export const STATUS_BADGE_COLORS: Record<string, { bg: string; color: string; dot: string }> = {
  backlog: { bg: '#E8E3F015', color: '#6B6377', dot: '#A8A1B5' },
  todo: { bg: '#88A9D618', color: '#3F5E8E', dot: '#88A9D6' },
  in_progress: { bg: '#D6B58818', color: '#8C6638', dot: '#D6B588' },
  in_review: { bg: '#D688D018', color: '#8E3E88', dot: '#D688D0' },
  done: { bg: '#88D68E18', color: '#3E8E44', dot: '#88D68E' },
  cancelled: { bg: '#E0525215', color: '#E05252', dot: '#E05252' },
};

/** Avatar rotation colors — lilac first to lead the brand */
export const AVATAR_COLORS = [
  { bg: '#7C3AED', color: '#FFFFFF' },  // lilac
  { bg: '#8E3E88', color: '#FFFFFF' },  // orchid
  { bg: '#3F5E8E', color: '#FFFFFF' },  // peri
  { bg: '#3E8E44', color: '#FFFFFF' },  // mint
  { bg: '#8C6638', color: '#FFFFFF' },  // tan
];

/** Type icon styles — single-letter tag colours
 *  T task (slate) · B bug (red) · S story (orchid) · E epic (lilac) */
export const TYPE_ICON_COLORS: Record<string, string> = {
  task: '#6B6377',
  bug: '#E05252',
  story: '#D688D0',
  epic: '#7C3AED',
  subtask: '#A8A1B5',
};

/** Type tag colours (for the small T / B / S / E squares) — solid bg, white text.
 *  Matches the CSS `.tmark` classes (--c-sky, --c-forest, --c-plum, --accent, --ink-3). */
export const TYPE_TAG_BG: Record<string, { bg: string; color: string }> = {
  task: { bg: '#1F5A8A', color: '#FFFFFF' },
  bug: { bg: '#7C3AED', color: '#FFFFFF' },
  story: { bg: '#1F5236', color: '#FFFFFF' },
  epic: { bg: '#5A1A6E', color: '#FFFFFF' },
  subtask: { bg: '#7A6F88', color: '#FFFFFF' },
};

export const TYPE_ICONS: Record<string, string> = {
  task: '○',
  bug: '●',
  story: '◆',
  epic: '■',
  subtask: '○',
};

/** Project dot rotation (under the sidebar projects header) */
export const PROJECT_DOT_COLORS = ['#7C3AED', '#88A9D6', '#88D68E', '#D6B588', '#D688D0'];

/**
 * Project / epic-lifecycle status palette. Covers directory + Today + epic
 * surfaces (`on_track`, `planning`, `in_flight`, `blocked`, …) — work-item
 * statuses (backlog/todo/in_progress/…) live in STATUS_BADGE_COLORS above.
 * `epic_at_risk` is an epic-only amber so the shared red `at_risk` stays
 * available for Today/directory.
 */
export const PROJECT_STATUS_PALETTE: Record<string, { bg: string; color: string }> = {
  on_track: { bg: '#88D68E20', color: '#3E8E44' },
  planning: { bg: '#88A9D620', color: '#3F5E8E' },
  ends_today: { bg: '#D6B58830', color: '#8C6638' },
  at_risk: { bg: '#E0525215', color: '#E05252' },
  idle: { bg: '#E8E3F0', color: '#6B6377' },
  no_sprint: { bg: '#E8E3F0', color: '#A8A1B5' },
  archived: { bg: '#E8E3F0', color: '#A8A1B5' },
  active: { bg: '#7C3AED15', color: '#7C3AED' },
  shipped: { bg: '#88D68E20', color: '#3E8E44' },
  ends_in_days: { bg: '#7C3AED15', color: '#6326D6' },
  in_flight: { bg: '#7C3AED15', color: '#6326D6' },
  blocked: { bg: '#E0525215', color: '#E05252' },
  draft: { bg: '#E8E3F0', color: '#A8A1B5' },
  epic_at_risk: { bg: '#E88A4818', color: '#B5631F' },
};
