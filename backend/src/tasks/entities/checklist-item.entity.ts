import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Task } from './task.entity';

@Entity('checklist_items')
@Index('IDX_checklist_task', ['taskId'])
export class ChecklistItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

  @Column({ length: 500 })
  title: string;

  @Column({ name: 'is_completed', type: 'boolean', default: false })
  isCompleted: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;
}
