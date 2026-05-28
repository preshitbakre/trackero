export interface StoryAssignee {
  id: number;
  displayName: string;
  avatarUrl?: string | null;
  handle?: string | null;
}

export interface StoryLabel {
  id: number;
  name: string;
  color: string;
}

export interface StoryStatus {
  id: number;
  name: string;
  category: 'backlog' | 'in_progress' | 'in_review' | 'done' | string;
  color: string;
}

export interface StoryProgress {
  totalItems: number;
  completedItems: number;
  totalPoints: number;
  completedPoints: number;
  progressPercent: number;
}

export interface StoryListItem {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  priority: string;
  status: StoryStatus | null;
  assignee: StoryAssignee | null;
  sprint: { id: number; name: string } | null;
  storyPoints: number | null;
  progress: StoryProgress;
  childBreakdown: { stories: number; tasks: number; subtasks: number; bugs: number };
  bugCount: number;
  epicId: number | null;
  epicKey: string | null;
  epicTitle: string | null;
  labels: StoryLabel[];
  createdAt: string;
}

export interface StoryStats {
  total: number;
  open: number;
  inFlight: number;
  done: number;
  totalPoints: number;
  completedPoints: number;
}

// Matches the `displayState` the Epics API computes (archived → blocked →
// at_risk → epic_state).
export type EpicHealth =
  | 'draft'
  | 'planning'
  | 'in_flight'
  | 'at_risk'
  | 'blocked'
  | 'shipped'
  | 'archived';

export interface EpicListItem {
  id: number;
  itemKey: string;
  title: string;
  endDate: string | null;
  displayState: EpicHealth;
  progress: StoryProgress;
}

export type StoryView = 'epic' | 'status' | 'sprint';
