import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique, Index,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('project_statuses')
@Index('IDX_ps_project', ['projectId'])
@Unique('UQ_status_name_project', ['projectId', 'name'])
export class ProjectStatus {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  category: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';

  @Column({ length: 7, default: '#6B7280' })
  color: string;

  @Column({ name: 'sort_order', type: 'int' })
  sortOrder: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
