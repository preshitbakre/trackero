import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { WorkItem } from './work-item.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Phase 7 — explicit watcher list per work item. Composite PK on
 * (workItemId, userId) gives natural uniqueness + a covering index.
 */
@Entity('work_item_watchers')
@Index('IDX_work_item_watchers_user', ['userId'])
export class WorkItemWatcher {
  @PrimaryColumn({ name: 'work_item_id', type: 'int' })
  workItemId: number;

  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: WorkItem;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
