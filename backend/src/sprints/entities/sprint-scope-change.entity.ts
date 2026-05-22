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

  @Column({ name: 'work_item_id', type: 'int' })
  workItemId: number;

  @Column({ type: 'varchar', length: 10 })
  action: 'added' | 'removed';

  @Column({ name: 'story_points', type: 'int', nullable: true })
  storyPoints: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Sprint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprint_id' })
  sprint: Sprint;
}
