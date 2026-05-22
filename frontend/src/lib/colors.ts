/** Shared priority badge styles — inline styles for guaranteed color consistency */
export const PRIORITY_BADGE_COLORS: Record<string, { bg: string; color: string } | null> = {
  urgent: { bg: '#E05252', color: '#FFFFFF' },
  high: { bg: '#E88A48', color: '#FFFFFF' },
  medium: { bg: '#D6B588', color: '#FFFFFF' },
  low: { bg: '#88A9D650', color: '#3F5E8E' },
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

/** Status badge styles — inline styles for guaranteed color consistency */
export const STATUS_BADGE_COLORS: Record<string, { bg: string; color: string; dot: string }> = {
  backlog: { bg: '#D1CCC720', color: '#5C5650', dot: '#7E7770' },
  todo: { bg: '#88A9D620', color: '#3F5E8E', dot: '#88A9D6' },
  in_progress: { bg: '#D6B58820', color: '#8C6638', dot: '#D6B588' },
  in_review: { bg: '#D688D020', color: '#8E3E88', dot: '#D688D0' },
  done: { bg: '#88D68E20', color: '#3E8E44', dot: '#88D68E' },
  cancelled: { bg: '#E0525215', color: '#E05252', dot: '#E05252' },
};

/** Avatar rotation colors */
export const AVATAR_COLORS = [
  { bg: '#88A9D650', color: '#3F5E8E' },  // peri
  { bg: '#D688D050', color: '#8E3E88' },  // orchid
  { bg: '#88D68E50', color: '#3E8E44' },  // mint
  { bg: '#D6B58850', color: '#8C6638' },  // tan
];

/** Type icon styles */
export const TYPE_ICON_COLORS: Record<string, string> = {
  task: '#A8A19A',
  bug: '#E05252',
  story: '#D688D0',
};

export const TYPE_ICONS: Record<string, string> = {
  task: '\u25CB',
  bug: '\u25CF',
  story: '\u25C6',
};
