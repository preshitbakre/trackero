/**
 * Single source of truth for the `comment.added` and `comment.mentioned`
 * domain-event payloads. Both emitter (`CommentsService.create`) and
 * listeners (NotificationsService, gateway broadcast in T0.8) import
 * from here, so a future rename is a one-line change.
 *
 * The audit caught a silent regression where listeners were reading
 * `payload.taskId` but the emitter sent `payload.workItemId`. Centralising
 * the type guarantees the field name stays in sync.
 *
 * `mentionedUserIds` rides on the main `comment.added` event so
 * downstream consumers (Phase 7 watchers, integrations fan-out) can
 * react without re-parsing the comment body. The list is whatever the
 * emitter already resolved against the active users table; an empty
 * array means no mentions.
 */
export interface CommentAddedPayload {
  workItemId: number;
  projectId: number;
  actorId: number;
  commentId: number;
  mentionedUserIds: number[];
}

export interface CommentMentionedPayload {
  userId: number;
  actorId: number;
  workItemId: number;
  projectId: number;
  commentId: number;
}

export const COMMENT_ADDED = 'comment.added';
export const COMMENT_MENTIONED = 'comment.mentioned';
