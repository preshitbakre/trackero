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

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  private async verifyItemInProject(projectId: number, workItemId: number): Promise<void> {
    const [item] = await this.dataSource.query(
      'SELECT id FROM work_items WHERE id = $1 AND project_id = $2',
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

    this.eventEmitter.emit('comment.added', { workItemId, projectId, actorId: userId, commentId: saved.id });

    // Parse @mentions
    const mentionRegex = /@(\w+)/g;
    let match;
    const mentionedNames = new Set<string>();
    while ((match = mentionRegex.exec(body)) !== null) {
      mentionedNames.add(match[1]);
    }

    if (mentionedNames.size > 0) {
      for (const name of mentionedNames) {
        const [mentionedUser] = await this.dataSource.query(
          `SELECT id FROM users WHERE display_name ILIKE $1 AND is_active = true LIMIT 1`,
          [name],
        );
        if (mentionedUser && mentionedUser.id !== userId) {
          this.eventEmitter.emit('comment.mentioned', {
            userId: mentionedUser.id,
            actorId: userId,
            workItemId,
            projectId,
            commentId: saved.id,
          });
        }
      }
    }

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
}
