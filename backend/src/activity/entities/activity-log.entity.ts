import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

@Entity('activity_logs')
@Index('IDX_activity_task', ['taskId'])
@Index('IDX_activity_project', ['projectId'])
@Index('IDX_activity_created', ['createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ name: 'task_id', type: 'int', nullable: true })
  taskId: number | null;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ length: 50 })
  action: string;

  @Column({ name: 'field_changed', type: 'varchar', length: 50, nullable: true })
  fieldChanged: string | null;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
