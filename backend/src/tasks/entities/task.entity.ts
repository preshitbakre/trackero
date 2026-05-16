import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { ProjectStatus } from '../../projects/entities/project-status.entity';

@Entity('tasks')
@Index('IDX_task_project', ['projectId'])
@Index('IDX_task_sprint', ['sprintId'])
@Index('IDX_task_status', ['statusId'])
@Index('IDX_task_project_number', ['projectId', 'taskNumber'], { unique: true })
export class Task {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ name: 'sprint_id', type: 'int', nullable: true })
  sprintId: number | null;

  @Column({ name: 'epic_id', type: 'int', nullable: true })
  epicId: number | null;

  @Column({ name: 'parent_id', type: 'int', nullable: true })
  parentId: number | null;

  @Column({ name: 'status_id', type: 'int' })
  statusId: number;

  @Column({ name: 'task_number', type: 'int' })
  taskNumber: number;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 10, default: 'task' })
  type: 'task' | 'bug' | 'story';

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';

  @Column({ name: 'story_points', type: 'int', nullable: true })
  storyPoints: number | null;

  @Column({ name: 'assignee_id', type: 'int', nullable: true })
  assigneeId: number | null;

  @Column({ name: 'reporter_id', type: 'int' })
  reporterId: number;

  @Column({ name: 'sort_order', type: 'varchar', length: 255, default: 'n' })
  sortOrder: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'added_mid_sprint', type: 'boolean', default: false })
  addedMidSprint: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => ProjectStatus, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'status_id' })
  status: ProjectStatus;
}
