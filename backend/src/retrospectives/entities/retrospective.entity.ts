import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToOne, OneToMany, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { Project } from '../../projects/entities/project.entity';
import { RetroCard } from './retro-card.entity';

@Entity('retrospectives')
@Index('IDX_retro_sprint', ['sprintId'], { unique: true })
export class Retrospective {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'sprint_id', type: 'int' })
  sprintId: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  // Nullable + SET NULL FK so the audit row survives a user deletion
  // (T0.4, migration 027).
  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  // Phase 6 — lifecycle + facilitator. facilitatorId is the user
  // currently running the retro (defaults to createdBy on creation,
  // can be reassigned by admin/PM via PUT facilitator).
  @Column({ name: 'facilitator_id', type: 'int', nullable: true })
  facilitatorId: number | null;

  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'max_votes_per_user', type: 'int', default: 5 })
  maxVotesPerUser: number;

  @Column({ name: 'authors_revealed_at', type: 'timestamptz', nullable: true })
  authorsRevealedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Sprint)
  @JoinColumn({ name: 'sprint_id' })
  sprint: Sprint;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @OneToMany(() => RetroCard, (rc) => rc.retrospective)
  cards: RetroCard[];
}
