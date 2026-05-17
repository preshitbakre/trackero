import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProjectMember } from './project-member.entity';

@Entity('projects')
@Index('IDX_project_status', ['status'])
export class Project {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 5, unique: true })
  prefix: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'archived';

  @Column({ name: 'lead_id', type: 'int', nullable: true })
  leadId: number | null;

  @Column({ name: 'default_assignee_id', type: 'int', nullable: true })
  defaultAssigneeId: number | null;

  @Column({ name: 'task_counter', type: 'int', default: 0 })
  taskCounter: number;

  @Column({ name: 'default_sprint_duration', type: 'int', default: 14 })
  defaultSprintDuration: number;

  @Column({ name: 'estimation_scale', type: 'varchar', length: 10, default: 'free' })
  estimationScale: 'free' | 'fibonacci' | 'tshirt';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead: User | null;

  @OneToMany(() => ProjectMember, (pm) => pm.project)
  members: ProjectMember[];
}
