import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

@Entity('sprints')
@Index('IDX_sprint_project', ['projectId'])
@Index('IDX_sprint_status', ['status'])
// Partial unique index: at most one active sprint per project. Enforced at the
// DB level so concurrent start() calls cannot create a second active sprint.
@Index('UQ_sprint_one_active_per_project', ['projectId'], {
  unique: true,
  where: "status = 'active'",
})
// sprint_number is auto-assigned (MAX+1) per project. This unique constraint is
// the DB backstop against two concurrent create() calls reading the same MAX
// and inserting duplicate sprint numbers.
@Unique('UQ_sprint_number_project', ['projectId', 'sprintNumber'])
export class Sprint {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({ type: 'varchar', length: 20, default: 'planning' })
  status: 'planning' | 'active' | 'completed' | 'cancelled';

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'sprint_number', type: 'int' })
  sprintNumber: number;

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
