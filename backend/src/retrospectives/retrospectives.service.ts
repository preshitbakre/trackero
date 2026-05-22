import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Retrospective } from './entities/retrospective.entity';
import { RetroCard } from './entities/retro-card.entity';
import { RetroVote } from './entities/retro-vote.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { stripHtml } from '../common/helpers/sanitize.helper';

@Injectable()
export class RetrospectivesService {
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

    const retro = this.retroRepo.create({ projectId, sprintId, createdBy: userId });
    return this.retroRepo.save(retro);
  }

  async findBySprintId(projectId: number, sprintId: number) {
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
    return retro;
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
    await this.findRetroForProject(projectId, retroId);

    const maxOrder = await this.cardRepo
      .createQueryBuilder('c')
      .where('c.retrospectiveId = :retroId AND c.column = :column', { retroId, column })
      .select('MAX(c.sortOrder)', 'max')
      .getRawOne();

    const card = this.cardRepo.create({
      retrospectiveId: retroId,
      column: column as RetroCard['column'],
      content: stripHtml(content),
      authorId: userId,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    });
    return this.cardRepo.save(card);
  }

  async updateCard(projectId: number, retroId: number, cardId: number, content: string) {
    await this.findRetroForProject(projectId, retroId);
    const card = await this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
    if (!card) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    card.content = stripHtml(content);
    return this.cardRepo.save(card);
  }

  async deleteCard(projectId: number, retroId: number, cardId: number) {
    await this.findRetroForProject(projectId, retroId);
    const card = await this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
    if (!card) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    await this.cardRepo.remove(card);
  }

  async toggleVote(projectId: number, retroId: number, cardId: number, userId: number) {
    await this.findRetroForProject(projectId, retroId);
    const card = await this.cardRepo.findOne({ where: { id: cardId, retrospectiveId: retroId } });
    if (!card) throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const existingVote = await this.voteRepo.findOne({ where: { cardId, userId } });
    if (existingVote) {
      // Remove vote
      await this.voteRepo.remove(existingVote);
      card.votes = Math.max(0, card.votes - 1);
    } else {
      // Add vote
      await this.voteRepo.save(this.voteRepo.create({ cardId, userId }));
      card.votes += 1;
    }
    return this.cardRepo.save(card);
  }
}
