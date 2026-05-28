import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkItem } from '../../work-items/entities/work-item.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A curated, freeform milestone on an epic's Timeline feed.
 * `author_id` is nullable so author-less system/target rows can exist
 * (the trailing "Target ship date" entry has no avatar). `kind` drives the
 * marker color + optional chip in the UI.
 */
@Entity('epic_milestones')
@Index('IDX_epic_milestone_epic', ['epicId', 'occurredOn'])
export class EpicMilestone {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ name: 'epic_id', type: 'int' })
  epicId: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'epic_id' })
  epic: WorkItem;

  @Column({ name: 'author_id', type: 'int', nullable: true })
  authorId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User | null;

  @Column({ type: 'varchar', length: 16, default: 'note' })
  kind: 'note' | 'risk' | 'target' | 'shipped' | 'kickoff';

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'occurred_on', type: 'date' })
  occurredOn: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
