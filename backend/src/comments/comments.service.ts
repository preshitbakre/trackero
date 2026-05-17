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

  private async verifyTaskInProject(projectId: number, taskId: number): Promise<void> {
    const [task] = await this.dataSource.query(
      'SELECT id FROM tasks WHERE id = $1 AND project_id = $2',
      [taskId, projectId],
    );
    if (!task) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  async create(projectId: number, taskId: number, body: string, userId: number) {
    await this.verifyTaskInProject(projectId, taskId);
    body = stripHtml(body);
    const comment = this.commentRepo.create({
      taskId,
      authorId: userId,
      body,
    });
    const saved = await this.commentRepo.save(comment);

    this.eventEmitter.emit('comment.added', { taskId, projectId, actorId: userId, commentId: saved.id });

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
            taskId,
            projectId,
            commentId: saved.id,
          });
        }
      }
    }

    const list = await this.listComments(projectId, taskId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listComments(projectId: number, taskId: number, page: number = 1, limit: number = 20) {
    await this.verifyTaskInProject(projectId, taskId);
    limit = clampLimit(limit);
    const qb = this.commentRepo.createQueryBuilder('c')
      .leftJoin('c.author', 'author')
      .addSelect(['author.id', 'author.displayName', 'author.avatarUrl'])
      .where('c.taskId = :taskId', { taskId })
      .orderBy('c.createdAt', 'ASC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();
    return new PaginatedResponse(data, total, page, limit);
  }

  async update(projectId: number, taskId: number, commentId: number, body: string, userId: number) {
    await this.verifyTaskInProject(projectId, taskId);
    body = stripHtml(body);
    const comment = await this.commentRepo.findOne({ where: { id: commentId, taskId } });
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

  async remove(projectId: number, taskId: number, commentId: number, userId: number, userRole: string) {
    await this.verifyTaskInProject(projectId, taskId);
    const comment = await this.commentRepo.findOne({ where: { id: commentId, taskId } });
    if (!comment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    // Admin/PM can delete any, member only their own
    if (userRole === 'member' && comment.authorId !== userId) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    await this.commentRepo.remove(comment);
  }
}
