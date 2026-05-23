/**
 * Single source of truth for every Socket.IO event the backend
 * broadcasts. The gateway imports these types so the emit shape can't
 * drift from the contract; the frontend should mirror this file (one
 * for one) and consume the same names + shapes.
 *
 * Naming: backend event names are kebab-case for the socket layer
 * ('comment:added', 'work-item:updated') even though the in-process
 * EventEmitter uses snake-case ('comment.added', 'work_item.updated').
 * The two are intentionally distinct so a future rename on one side
 * doesn't accidentally rename the other.
 */
export interface CommentAddedSocketPayload {
  workItemId: number;
  projectId: number;
  commentId: number;
  authorId: number;
  mentionedUserIds: number[];
}

export interface WorkItemSocketPayload {
  itemId: number;
}

export interface BoardMovedSocketPayload {
  itemId: number;
  statusId: number;
  sortOrder: string;
  completedAt: Date | null;
  actorId: number;
}

export interface SprintUpdatedSocketPayload {
  sprintId: number;
  status: 'active' | 'completed';
}

export const SOCKET_EVENTS = {
  WORK_ITEM_CREATED: 'work-item:created',
  WORK_ITEM_UPDATED: 'work-item:updated',
  WORK_ITEM_DELETED: 'work-item:deleted',
  BOARD_MOVED: 'board:moved',
  SPRINT_UPDATED: 'sprint:updated',
  COMMENT_ADDED: 'comment:added',
  NOTIFICATION_NEW: 'notification:new',
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
