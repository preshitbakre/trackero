import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Retrospective } from './entities/retrospective.entity';
import { RetroCard, RetroCardColumn } from './entities/retro-card.entity';
import { RetroVote } from './entities/retro-vote.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { stripHtml } from '../common/helpers/sanitize.helper';

// Phase 6 — UI uses the new four-column vocabulary. Storage accepts both
// the historical labels and the new ones; this map normalises legacy
// values to new ones at read time so the FE can render uniformly.
const COLUMN_LEGACY_TO_NEW: Record<string, RetroCardColumn> = {
  went_well: 'kept',
  to_improve: 'dropped',
  action_items: 'next',
};

const VALID_NEW_COLUMNS: ReadonlyArray<RetroCardColumn> = [
  'kept',
  'dropped',
  'lucky_breaks',
  'next',
];

@Injectable()
export class RetrospectivesService {
  private readonly logger = new Logger(RetrospectivesService.name);

  constructor(
    @InjectRepository(Retrospective)
    private readonly retroRepo: Repository<Retrospective>,
    @InjectRepository(RetroCard)
    private readonly cardRepo: Repository<RetroCard>,
    @InjectRepository(RetroVote)
    private readonly voteRepo: Repository<RetroVote>,
    private readonly dataSource: DataSource,
  ) {}

  async create(projectId: number, sprintId: number, userId: number) {
    // §4.9: verify the sprint actually belongs to the project. The route
    // params (projectId, sprintId) are independent, so without this check a
    // caller could cross-link a retro in project A to a sprint in project B.
    const sprintRows = await this.dataSource.query(
      'SELECT 1 FROM sprints WHERE id = $1 AND project_id = $2',
      [sprintId, projectId],
    );
    if (sprintRows.length === 0) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const existing = await this.retroRepo.findOne({ where: { sprintId } });
    if (existing) {
      throw new AppLogicException('RETRO_EXISTS', HttpStatus.CONFLICT);
    }

    const now = new Date();
    const retro = this.retroRepo.create({
      projectId,
      sprintId,
      createdBy: userId,
      facilitatorId: userId,
      openedAt: now,
    });
    return this.retroRepo.save(retro);
  }

  /**
   * Phase 6 — auto-create the retro when a sprint completes (idempotent).
   * Triggered by SprintsService.complete via the event bus.
   */
  @OnEvent('sprint.completed')
  async onSprintCompleted(payload: { sprintId: number; projectId: number; actorId?: number; userId?: number }) {
    try {
      const existing = await this.retroRepo.findOne({ where: { sprintId: payload.sprintId } });
      if (existing) return;
      const now = new Date();
      const actor = payload.actorId ?? payload.userId ?? null;
      const retro = this.retroRepo.create({
        projectId: payload.projectId,
        sprintId: payload.sprintId,
        createdBy: actor,
        facilitatorId: actor,
        openedAt: now,
      });
      await this.retroRepo.save(retro);
      this.logger.log(`Auto-created retro ${retro.id} on sprint.completed for sprint ${payload.sprintId}`);
    } catch (err) {
      this.logger.error(
        `Auto-create retro failed for sprint ${payload.sprintId}: ${(err as Error).message}`,
      );
    }
  }

  private normaliseColumn(card: RetroCard): RetroCard & { column: RetroCardColumn } {
    const next = COLUMN_LEGACY_TO_NEW[card.column] ?? card.column;
    return { ...card, column: next as RetroCardColumn };
  }

  private assertOpen(retro: Retrospective) {
    if (retro.closedAt) {
      throw new AppLogicException('RETRO_CLOSED', HttpStatus.CONFLICT);
    }
  }

  async setFacilitator(projectId: number, retroId: number, facilitatorUserId: number) {
    const retro = await this.findRetroForProject(projectId, retroId);
    this.assertOpen(retro);
    // Validate the new facilitator is a member of this project.
    const memberRows = await this.dataSource.query(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, facilitatorUserId],
    );
    if (memberRows.length === 0) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    retro.facilitatorId = facilitatorUserId;
    await this.retroRepo.save(retro);
    return retro;
  }

  async revealAuthors(projectId: number, retroId: number) {
    const retro = await this.findRetroForProject(projectId, retroId);
    this.assertOpen(retro);
    if (!retro.authorsRevealedAt) {
      retro.authorsRevealedAt = new Date();
      await this.retroRepo.save(retro);
    }
    return retro;
  }

  async closeRetro(projectId: number, retroId: number) {
    const retro = await this.findRetroForProject(projectId, retroId);
    if (!retro.closedAt) {
      retro.closedAt = new Date();
      await this.retroRepo.save(retro);
    }
    return retro;
  }

  async findBySprintId(projectId: number, sprintId: number, viewerUserId?: number) {
    const retro = await this.retroRepo
      .createQueryBuilder('retro')
      .leftJoinAndSelect('retro.cards', 'card')
      .where('retro.projectId = :projectId AND retro.sprintId = :sprintId', { projectId, sprintId })
      .orderBy('card.column', 'ASC')
      .addOrderBy('card.votes', 'DESC')
      .addOrderBy('card.createdAt', 'ASC')
      .getOne();

    if (!retro) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const cards = (retro.cards ?? []).map((c) => this.normaliseColumn(c));

    // Phase 6 — anonymity: until authors_revealed_at, hide authorId from
    // anyone except the author themselves and the facilitator. Once
    // revealed, every author is visible.
    const isRevealed = !!retro.authorsRevealedAt;
    const isFacilitator = viewerUserId != null && viewerUserId === retro.facilitatorId;
    const sanitisedCards = cards.map((c) => {
      if (isRevealed || isFacilitator || (viewerUserId != null && c.authorId === viewerUserId)) {
        return c;
      }
      return { ...c, authorId: null as unknown as number };
    });

    return { ...retro, cards: sanitisedCards };
  }

  private async findRetroForProject(projectId: number, retroId: number): Promise<Retrospective> {
    const retro = await this.retroRepo.findOne({ where: { id: retroId } });
    if (!retro) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    if (retro.projectId !== projectId) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return retro;
  }

  async addCard(projectId: number, retroId: number, column: string, content: string, userId: number) {
    const retro = await this.findRetroForProject(projectId, retroId);
    this.assertOpen(retro);

    // Accept either historical (`went_well`, `to_improve`, `action_items`)
    // or new (`kept`, `dropped`, `lucky_breaks`, `next`) values.
    const valid = VALID_NEW_COLUMNS as readonly string[];
    const isLegacy = ['went_well', 'to_improve', 'action_items'].includes(column);
    if (!valid.includes(column) && !isLegacy) {
      throw new AppLogicException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST);
    }

    const maxOrder = await this.cardRepo
      .createQueryBuilder('c')
      .where('c.retrospectiveId = :retroId AND c.column = :column', { retroId, column })
      .select('MAX(c.sortOrder)', 'max')
      .getRawOne();

    const card = this.cardRepo.create({
      retrospectiveId: retroId,
      column: column as RetroCardColumn,
      content: stripHtml(content),
      authorId: userId,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    });
    const saved = await this.cardRepo.save(card);
    return this.normaliseColumn(saved);
  }

  async updateCard(projectId: number, retroId: number, cardId: number, content: string) {
    const retro = await this.findRetroForProject(projectId, retroId);
    this.assertOpen(retro);
    const card = await this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
    if (!card) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    card.content = stripHtml(content);
    const saved = await this.cardRepo.save(card);
    return this.normaliseColumn(saved);
  }

  async deleteCard(projectId: number, retroId: number, cardId: number) {
    const retro = await this.findRetroForProject(projectId, retroId);
    this.assertOpen(retro);
    const card = await this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
    if (!card) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    await this.cardRepo.remove(card);
  }

  async toggleVote(projectId: number, retroId: number, cardId: number, userId: number) {
    const retro = await this.findRetroForProject(projectId, retroId);
    this.assertOpen(retro);
    const card = await this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
    if (!card) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const existingVote = await this.voteRepo.findOne({ where: { cardId, userId } });
    if (existingVote) {
      // Remove vote — no uniqueness concern on delete.
      await this.voteRepo.remove(existingVote);
    } else {
      // Add vote. Two concurrent toggles from the SAME user can both miss the
      // findOne above and both try to insert — the second hits the
      // UQ_retro_vote unique constraint. That is a benign concurrent
      // double-vote: the net effect is one vote, which is correct toggle
      // semantics, so swallow the 23505 and fall through to the recompute.
      try {
        await this.voteRepo.save(this.voteRepo.create({ cardId, userId }));
      } catch (error: any) {
        const isUniqueViolation =
          error?.code === '23505' &&
          ((typeof error?.constraint === 'string' && error.constraint.includes('UQ_retro_vote')) ||
            (typeof error?.detail === 'string' && error.detail.includes('UQ_retro_vote')) ||
            // Some drivers omit the constraint name; fall back to the column pair.
            (typeof error?.detail === 'string' &&
              error.detail.includes('card_id') &&
              error.detail.includes('user_id')));
        if (!isUniqueViolation) throw error;
      }
    }

    // Derive the count atomically from the actual retro_votes rows. This
    // makes `votes` exactly equal to the real row count regardless of
    // concurrency / lost updates — no read-modify-write on card.votes.
    await this.dataSource.query(
      'UPDATE retro_cards SET votes = (SELECT COUNT(*) FROM retro_votes WHERE card_id = $1) WHERE id = $1',
      [cardId],
    );

    return this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
  }
}
