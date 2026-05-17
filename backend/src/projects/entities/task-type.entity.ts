import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('task_types')
@Index('IDX_task_type_project', ['projectId'])
@Unique('UQ_task_type_name', ['projectId', 'name'])
export class TaskType {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 7, default: '#6B7280' })
  color: string;

  @Column({ length: 30, default: 'circle-dot' })
  icon: string;

  @Column({ name: 'is_builtin', type: 'boolean', default: false })
  isBuiltin: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
