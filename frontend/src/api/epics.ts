import { apiClient } from './client';

export type EpicDisplayState =
  | 'draft'
  | 'planning'
  | 'in_flight'
  | 'shipped'
  | 'blocked'
  | 'at_risk'
  | 'archived';

export interface EpicUser {
  id: number;
  displayName: string;
  avatarUrl?: string | null;
  handle?: string;
}

export interface EpicLabel {
  id: number;
  name: string;
  color: string;
}

export interface EpicListItem {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  description: string | null;
  priority: string;
  status: { id: number; name: string; category: string; color: string } | null;
  assignee: EpicUser | null;
  sprint: { id: number; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  storyPoints: number | null;
  progress: {
    totalItems: number;
    completedItems: number;
    totalPoints: number;
    completedPoints: number;
    progressPercent: number;
  };
  childBreakdown: { stories: number; tasks: number; subtasks: number; bugs: number };
  labels: EpicLabel[];
  createdAt: string;
  epicState: 'draft' | 'planning' | 'in_flight' | 'shipped';
  displayState: EpicDisplayState;
  lead: EpicUser | null;
  blockedBy: { key: string; title: string; since: string } | null;
  archived: boolean;
}

export interface EpicsSummary {
  totalEpics: number;
  inFlight: number;
  needsAttention: number;
  blocked: number;
  atRisk: number;
  childrenDone: { completed: number; total: number };
  nextTarget: { date: string; epicKey: string } | null;
}

export interface EpicForecastData {
  ptsDone: number;
  ptsWip: number;
  ptsTotal: number;
  velocity: number;
  finishSprint: string;
  targetSprint: string;
  target: string;
  verdict: 'on_track' | 'ahead' | 'at_risk' | 'behind';
}

export interface AcrossSprints {
  fromKey: string | null;
  toKey: string | null;
  count: number;
  target: string | null;
  sprints: {
    id: number;
    key: string;
    name: string;
    startDate: string | null;
    status: string;
    rollup: { done: number; inProg: number; review: number; open: number };
  }[];
  stories: {
    id: number;
    itemKey: string;
    title: string;
    sprintIndex: number;
    status: 'done' | 'inProg' | 'review' | 'open';
  }[];
  todayIndex: number;
}

export interface EpicDetail {
  id: number;
  itemKey: string;
  title: string;
  description: string | null;
  priority: string;
  epicState: 'draft' | 'planning' | 'in_flight' | 'shipped';
  displayState: EpicDisplayState;
  startDate: string | null;
  endDate: string | null;
  status: { id: number; name: string; category: string; color: string } | null;
  stats: { itemsDone: number; inProgress: number; open: number; completedPoints: number; totalPoints: number };
  lead: EpicUser | null;
  contributors: { count: number; users: EpicUser[] };
  byType: { type: string; count: number }[];
  labels: EpicLabel[];
  blockedBy: { key: string; title: string; since: string; note: string; owner: string | null } | null;
  acrossSprints: AcrossSprints;
  forecast: EpicForecastData | null;
  audit: { createdOn: string; createdBy: { displayName: string; handle: string } | null; lastEditedAt: string };
}

export interface EpicChildItem {
  id: number;
  itemKey: string;
  itemType: string;
  title: string;
  priority: string;
  storyPoints: number | null;
  sprintId: number | null;
  parentId: number | null;
  status: { id: number; name: string; category: string; color: string };
  assignee: EpicUser | null;
  labels: EpicLabel[];
  depth: number;
}

export interface EpicChildrenGroups {
  totalItems: number;
  totalPoints: number;
  groups: { key: string; label: string; count: number; points: number; items: EpicChildItem[] }[];
}

const base = (projectId: number | string) => `/projects/${projectId}/epics`;

export async function getEpics(
  projectId: number | string,
  params: { state?: string; status?: string; includeArchived?: boolean } = {},
): Promise<EpicListItem[]> {
  const { data } = await apiClient.get(base(projectId), { params });
  return data.data.list ?? [];
}

export async function getEpicsSummary(projectId: number | string): Promise<EpicsSummary> {
  const { data } = await apiClient.get(`${base(projectId)}/summary`);
  return data.data;
}

export async function getEpic(projectId: number | string, epicId: number | string): Promise<EpicDetail> {
  const { data } = await apiClient.get(`${base(projectId)}/${epicId}`);
  return data.data;
}

export async function getEpicChildren(
  projectId: number | string,
  epicId: number | string,
  groupBy: 'status' | 'sprint' | 'none' = 'status',
): Promise<EpicChildrenGroups> {
  const { data } = await apiClient.get(`${base(projectId)}/${epicId}/children`, { params: { groupBy } });
  return data.data;
}

export interface EpicRecentRow {
  id: number;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  itemKey: string | null;
  isEpic: boolean;
  user: EpicUser | null;
}

export async function getEpicRecent(
  projectId: number | string,
  epicId: number | string,
  limit = 8,
): Promise<EpicRecentRow[]> {
  const { data } = await apiClient.get(`${base(projectId)}/${epicId}/recent`, { params: { limit } });
  return data.data ?? [];
}


export interface UpdateEpicBody {
  title?: string;
  description?: string | null;
  epicState?: 'draft' | 'planning' | 'in_flight';
  startDate?: string | null;
  endDate?: string | null;
}

export async function updateEpic(projectId: number | string, epicId: number | string, body: UpdateEpicBody) {
  const { data } = await apiClient.patch(`${base(projectId)}/${epicId}`, body);
  return data.data;
}

export async function shipEpic(projectId: number | string, epicId: number | string) {
  const { data } = await apiClient.post(`${base(projectId)}/${epicId}/ship`);
  return data.data;
}
export async function reopenEpic(projectId: number | string, epicId: number | string) {
  const { data } = await apiClient.post(`${base(projectId)}/${epicId}/reopen`);
  return data.data;
}
export async function archiveEpic(projectId: number | string, epicId: number | string) {
  const { data } = await apiClient.post(`${base(projectId)}/${epicId}/archive`);
  return data.data;
}
export async function unarchiveEpic(projectId: number | string, epicId: number | string) {
  const { data } = await apiClient.post(`${base(projectId)}/${epicId}/unarchive`);
  return data.data;
}
export async function detachEpicChildren(projectId: number | string, epicId: number | string) {
  const { data } = await apiClient.post(`${base(projectId)}/${epicId}/detach-children`);
  return data.data;
}

/** Map an epic displayState to a StatusPill key. */
export function epicStateToPill(state: EpicDisplayState): string {
  return state === 'at_risk' ? 'epic_at_risk' : state;
}
