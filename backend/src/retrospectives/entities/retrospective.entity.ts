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
