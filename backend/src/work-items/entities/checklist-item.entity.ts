import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { WorkItem } from './work-item.entity';

@Entity('checklist_items')
@Index('IDX_checklist_work_item', ['workItemId'])
export class ChecklistItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'work_item_id', type: 'int' })
  workItemId: number;

  @Column({ length: 500 })
  title: string;

  @Column({ name: 'is_completed', type: 'boolean', default: false })
  isCompleted: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: WorkItem;
}
