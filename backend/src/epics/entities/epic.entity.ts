import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

@Entity('epics')
@Index('IDX_epic_project', ['projectId'])
@Index('IDX_epic_status', ['status'])
export class Epic {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: 'open' | 'in_progress' | 'done';

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';

  @Column({ length: 7, default: '#6366F1' })
  color: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: string | null;

  @Column({ name: 'sort_order', type: 'varchar', length: 255, default: 'n' })
  sortOrder: string;

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
