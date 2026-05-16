import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Unique, Index,
} from 'typeorm';
import { Task } from './task.entity';

@Entity('task_dependencies')
@Unique('UQ_dependency', ['taskId', 'dependsOnTaskId'])
@Index('IDX_dep_task', ['taskId'])
@Index('IDX_dep_depends_on', ['dependsOnTaskId'])
export class TaskDependency {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

  @Column({ name: 'depends_on_task_id', type: 'int' })
  dependsOnTaskId: number;

  @Column({ name: 'dependency_type', type: 'varchar', length: 20, default: 'blocks' })
  dependencyType: 'blocks' | 'relates_to';

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depends_on_task_id' })
  dependsOnTask: Task;
}
