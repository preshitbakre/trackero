export interface DetailUser {
  id: number;
  displayName: string;
  avatarUrl?: string | null;
  handle?: string | null;
}

export interface DetailStatus {
  id: number;
  name: string;
  category: 'backlog' | 'in_progress' | 'in_review' | 'done' | string;
  color: string;
}

export interface DetailLabel {
  id: number;
  name: string;
  color: string;
}

export interface AcceptanceCriterion {
  id: number;
  givenText: string;
  whenText: string | null;
  thenText: string | null;
  structured: boolean;
  isMet: boolean;
  verifiedAt: string | null;
  verifier: DetailUser | null;
  linkedItem: {
    id: number;
    itemKey: string;
    itemType: string;
    title: string;
    statusName: string | null;
    statusCategory: string | null;
  } | null;
  sortOrder: string;
}

export interface AcceptanceCriteriaResult {
  list: AcceptanceCriterion[];
  total: number;
  met: number;
}

export interface DetailChild {
  id: number;
  itemKey: string;
  itemNumber: number;
  itemType: string;
  title: string;
  status: DetailStatus | null;
  priority: string;
  assignee: DetailUser | null;
  storyPoints: number | null;
  completedAt: string | null;
}

export interface AssocItem {
  id: number;
  item: {
    id: number;
    itemKey: string;
    itemType: string;
    title: string;
    status: DetailStatus | null;
    storyPoints: number | null;
    assignee: DetailUser | null;
  };
}

/** A normalized row used by the Tasks tab (top-level item or nested subtask). */
export interface TaskRow {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  status: { id: number; name: string; category: string } | null;
  storyPoints: number | null;
  assignee: DetailUser | null;
  isSubtask: boolean;
}

export interface StoryAssociations {
  belongsTo: AssocItem[];
  contains: AssocItem[];
  relatesTo: AssocItem[];
  blocks: AssocItem[];
  blockedBy: AssocItem[];
  causedBy: AssocItem[];
  causes: AssocItem[];
}

export interface BreadcrumbNode {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
}

export interface StoryProgress {
  totalItems: number;
  completedItems: number;
  totalPoints: number;
  completedPoints: number;
  progressPercent: number;
}

export interface StoryDetail {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  description: string | null;
  userStory: string | null;
  priority: string;
  status: DetailStatus | null;
  assignee: DetailUser | null;
  reporter: DetailUser | null;
  sprint: { id: number; name: string } | null;
  sprintId: number | null;
  storyPoints: number | null;
  estimatedAt: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  approver: DetailUser | null;
  labels: DetailLabel[];
  children: DetailChild[];
  breadcrumb: BreadcrumbNode[];
  associations: StoryAssociations;
  progress: StoryProgress | null;
  bugCount: number;
  childStatusBreakdown: { done: number; wip: number; open: number };
  epic: { id: number; itemKey: string; title: string } | null;
  acceptanceCriteria: AcceptanceCriteriaResult;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}
