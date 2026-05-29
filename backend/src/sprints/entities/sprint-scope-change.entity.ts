import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Sprint } from './sprint.entity';

@Entity('sprint_scope_changes')
@Index('IDX_scope_sprint', ['sprintId'])
export class SprintScopeChange {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'sprint_id', type: 'int' })
  sprintId: number;

  // Nullable: 'goal' entries are sprint-scoped and have no work item.
  @Column({ name: 'work_item_id', type: 'int', nullable: true })
  workItemId: number | null;

  @Column({ type: 'varchar', length: 10 })
  action: 'added' | 'removed' | 'goal';

  @Column({ name: 'story_points', type: 'int', nullable: true })
  storyPoints: number | null;

  // Who performed the change. Lets the timeline show the real actor instead of
  // proxying via the work item's assignee. Null on legacy rows.
  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  // Free-text detail — used by 'goal' entries to carry the new sprint goal.
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Sprint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprint_id' })
  sprint: Sprint;
}
