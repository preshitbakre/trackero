import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Comment } from './entities/comment.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { clampLimit } from '../common/helpers/pagination.helper';
import { stripHtml } from '../common/helpers/sanitize.helper';
import {
  COMMENT_ADDED,
  COMMENT_MENTIONED,
  type CommentAddedPayload,
  type CommentMentionedPayload,
} from './events/comment-added.event';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  // Phase 10 — exclude soft-deleted work items so comments on a freshly
  // deleted item 404 from the user perspective (the rows persist for the
  // retention grace window in case of restore).
  private async verifyItemInProject(projectId: number, workItemId: number): Promise<void> {
    const [item] = await this.dataSource.query(
      'SELECT id FROM work_items WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
      [workItemId, projectId],
    );
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  async create(projectId: number, workItemId: number, body: string, userId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    body = stripHtml(body);
    const comment = this.commentRepo.create({
      workItemId,
      authorId: userId,
      body,
    });
    const saved = await this.commentRepo.save(comment);

    // Phase 7 — mentions become first-class. Parse @tokens, resolve them
    // against active project members (display_name OR email prefix),
    // persist into comment_mentions, and emit one COMMENT_MENTIONED per
    // resolved user. Self-mentions are filtered out.
    const mentionTokens = new Set<string>();
    const mentionRe = /@\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = mentionRe.exec(body)) !== null) {
      mentionTokens.add(m[1]);
    }

    const mentionedUserIds: number[] = [];
    if (mentionTokens.size > 0) {
      // Resolve all tokens in one query — scoped to active project members
      // so a stray @typo doesn't pull in a random user from another org.
      const tokens = Array.from(mentionTokens);
      const resolved: Array<{ id: number; token: string }> = await this.dataSource.query(
        `
        SELECT DISTINCT ON (u.id) u.id, t.token
        FROM users u
        JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $1
        CROSS JOIN UNNEST($2::text[]) AS t(token)
        WHERE u.is_active = TRUE
          AND (
            LOWER(TRIM(u.display_name)) = LOWER(TRIM(t.token))
            OR LOWER(SPLIT_PART(u.email, '@', 1)) = LOWER(TRIM(t.token))
          )
          AND u.id <> $3
        `,
        [projectId, tokens, userId],
      );

      for (const row of resolved) {
        try {
          await this.dataSource.query(
            `INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [saved.id, row.id],
          );
        } catch {
          // ignore — UQ violation means we already inserted this pair.
        }
        if (!mentionedUserIds.includes(row.id)) {
          mentionedUserIds.push(row.id);
          const mentionPayload: CommentMentionedPayload = {
            userId: row.id,
            actorId: userId,
            workItemId,
            projectId,
            commentId: saved.id,
          };
          this.eventEmitter.emit(COMMENT_MENTIONED, mentionPayload);
        }
      }
    }

    const addedPayload: CommentAddedPayload = {
      workItemId,
      projectId,
      actorId: userId,
      commentId: saved.id,
      mentionedUserIds,
    };
    this.eventEmitter.emit(COMMENT_ADDED, addedPayload);

    const list = await this.listComments(projectId, workItemId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listComments(projectId: number, workItemId: number, page: number = 1, limit: number = 20) {
    await this.verifyItemInProject(projectId, workItemId);
    limit = clampLimit(limit);
    const qb = this.commentRepo.createQueryBuilder('c')
      .leftJoin('c.author', 'author')
      .addSelect(['author.id', 'author.displayName', 'author.avatarUrl'])
      .where('c.workItemId = :workItemId', { workItemId })
      .orderBy('c.createdAt', 'ASC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  async update(projectId: number, workItemId: number, commentId: number, body: string, userId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    body = stripHtml(body);
    const comment = await this.commentRepo.findOne({ where: { id: commentId, workItemId } });
    if (!comment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (comment.authorId !== userId) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    comment.body = body;
    comment.editedAt = new Date();
    return this.commentRepo.save(comment);
  }

  async remove(
    projectId: number,
    workItemId: number,
    commentId: number,
    userId: number,
    effectiveRole: string | undefined,
  ) {
    await this.verifyItemInProject(projectId, workItemId);
    const comment = await this.commentRepo.findOne({ where: { id: commentId, workItemId } });
    if (!comment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    // `effectiveRole` is the caller's PROJECT-scoped role ('admin' for global
    // admins). Only project_managers and admins may delete others' comments;
    // a project member may delete only their own.
    const canDeleteOthers = effectiveRole === 'admin' || effectiveRole === 'project_manager';
    if (!canDeleteOthers && comment.authorId !== userId) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    await this.commentRepo.remove(comment);
  }

  /**
   * Phase 7 — extend the listed comments with reactions and mentions.
   * Returns the same paginated shape but each comment carries `reactions:
   * [{ emoji, count, byMe }]` and `mentions: [{ userId, displayName }]`.
   *
   * Aggregates are a single grouped query so we don't N+1 on the list
   * size (which is tiny today but trending up as discussion gets active).
   */
  async listWithEngagement(projectId: number, workItemId: number, viewerUserId: number, page = 1, limit = 20) {
    const base = await this.listComments(projectId, workItemId, page, limit);
    // PaginatedResponse stores rows on `.data`; the response interceptor
    // unwraps it into the envelope's `list` field. We need to mutate
    // `.data` here so the envelope sees the enriched rows.
    const items: any[] = (base as any).data ?? [];
    if (items.length === 0) return base;

    const ids = items.map((c) => c.id);
    const reactionRows: Array<{ comment_id: number; emoji: string; count: number; by_me: boolean }> =
      await this.dataSource.query(
        `
        SELECT
          comment_id,
          emoji,
          COUNT(*)::int AS count,
          BOOL_OR(user_id = $2) AS by_me
        FROM comment_reactions
        WHERE comment_id = ANY($1::int[])
        GROUP BY comment_id, emoji
        ORDER BY count DESC
        `,
        [ids, viewerUserId],
      );
    const mentionRows: Array<{ comment_id: number; user_id: number; display_name: string }> =
      await this.dataSource.query(
        `
        SELECT cm.comment_id, cm.user_id, u.display_name
        FROM comment_mentions cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.comment_id = ANY($1::int[])
        `,
        [ids],
      );

    const reactionsByComment = new Map<number, Array<{ emoji: string; count: number; byMe: boolean }>>();
    for (const r of reactionRows) {
      const arr = reactionsByComment.get(r.comment_id) ?? [];
      arr.push({ emoji: r.emoji, count: r.count, byMe: r.by_me });
      reactionsByComment.set(r.comment_id, arr);
    }
    const mentionsByComment = new Map<number, Array<{ userId: number; displayName: string }>>();
    for (const m of mentionRows) {
      const arr = mentionsByComment.get(m.comment_id) ?? [];
      arr.push({ userId: m.user_id, displayName: m.display_name });
      mentionsByComment.set(m.comment_id, arr);
    }

    const enriched = items.map((c) => ({
      ...c,
      reactions: reactionsByComment.get(c.id) ?? [],
      mentions: mentionsByComment.get(c.id) ?? [],
    }));
    (base as any).data = enriched;
    return base;
  }

  async toggleReaction(projectId: number, workItemId: number, commentId: number, emoji: string, userId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    const comment = await this.commentRepo.findOne({ where: { id: commentId, workItemId } });
    if (!comment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const normalised = (emoji ?? '').trim();
    if (!normalised || normalised.length > 8) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }
    // Upsert / delete on toggle. Use a transaction so concurrent toggles
    // from the same user can't both insert past the UQ.
    return this.dataSource.transaction(async (tx) => {
      const existing = await tx.query(
        `SELECT id FROM comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3`,
        [commentId, userId, normalised],
      );
      if (existing.length > 0) {
        await tx.query(`DELETE FROM comment_reactions WHERE id = $1`, [existing[0].id]);
      } else {
        try {
          await tx.query(
            `INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES ($1, $2, $3)`,
            [commentId, userId, normalised],
          );
        } catch (err: any) {
          if (err?.code !== '23505') throw err;
        }
      }
      const rows = await tx.query(
        `SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = $2) AS by_me
         FROM comment_reactions WHERE comment_id = $1 GROUP BY emoji ORDER BY count DESC`,
        [commentId, userId],
      );
      return rows.map((r: any) => ({ emoji: r.emoji, count: r.count, byMe: r.by_me }));
    });
  }
}
