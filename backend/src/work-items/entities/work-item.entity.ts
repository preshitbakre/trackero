import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, ManyToMany, JoinColumn, JoinTable, Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { ProjectStatus } from '../../projects/entities/project-status.entity';
import { Label } from '../../projects/entities/label.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { User } from '../../users/entities/user.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { Attachment } from '../../attachments/entities/attachment.entity';

@Entity('work_items')
@Index('IDX_wi_project', ['projectId'])
@Index('IDX_wi_parent', ['parentId'])
@Index('IDX_wi_sprint', ['sprintId'])
@Index('IDX_wi_item_type', ['itemType'])
@Index('IDX_wi_assignee', ['assigneeId'])
@Index('IDX_wi_status', ['statusId'])
@Index('IDX_wi_project_number', ['projectId', 'itemNumber'], { unique: true })
@Index('IDX_wi_project_type', ['projectId', 'itemType'])
export class WorkItem {

  // =======================================
  // IDENTITY
  // =======================================

  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'project_id', type: 'int' })
  projectId: number;

  @Column({ name: 'item_number', type: 'int' })
  itemNumber: number;
  // Auto-incremented per project (shared counter across ALL item types).
  // Sourced from project.itemCounter.
  // Used to form the item key: "{project.prefix}-{itemNumber}" e.g., "PROJ-42"

  // =======================================
  // HIERARCHY
  // =======================================

  @Column({
    name: 'item_type',
    type: 'varchar',
    length: 10,
  })
  itemType: 'epic' | 'story' | 'task' | 'bug' | 'subtask';
  // IMMUTABLE after creation. Cannot be changed.

  @Column({ name: 'parent_id', type: 'int', nullable: true })
  parentId: number | null;
  // Canonical Trackero hierarchy model (Task 5.6 reconciliation):
  //   - subtask: REQUIRED. Points at a task / story / epic / bug.
  //   - epic / story / task / bug: ALWAYS null. Cross-type linkage
  //     (epic→story, story→task, epic→task, epic→bug, …) lives in
  //     `work_item_associations` with link_type = 'belongs_to'.
  //
  // FK is declared ON DELETE: SET NULL as a safety net. Subtask deletion
  // is gated upstream by validateDeletion (which rejects deleting any
  // epic/story/task that still has direct subtask children).

  // =======================================
  // CONTENT
  // =======================================

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Editorial user-story sentence (light markdown — `*…*` for emphasis).
  // Distinct from `description`; rendered as the detail-page statement.
  @Column({ name: 'user_story', type: 'text', nullable: true })
  userStory: string | null;

  // =======================================
  // STATUS & PRIORITY
  // =======================================

  @Column({ name: 'status_id', type: 'int' })
  statusId: number;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'medium',
  })
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';

  // =======================================
  // PLANNING
  // =======================================

  @Column({ name: 'sprint_id', type: 'int', nullable: true })
  sprintId: number | null;

  @Column({ name: 'story_points', type: 'int', nullable: true })
  storyPoints: number | null;

  // Stamped the first time storyPoints goes null→value — drives the
  // Settings-tab "Estimated" audit line.
  @Column({ name: 'estimated_at', type: 'timestamptz', nullable: true })
  estimatedAt: Date | null;

  // Story approval workflow — set by POST /items/:id/approve, cleared by reopen.
  @Column({ name: 'approved_by', type: 'int', nullable: true })
  approvedBy: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'assignee_id', type: 'int', nullable: true })
  assigneeId: number | null;

  @Column({ name: 'reporter_id', type: 'int' })
  reporterId: number;

  // Phase 7 — optional reviewer pointer. Today rail's "Reviewing for"
  // reads this; sprint-planning and the task detail right rail edit it.
  @Column({ name: 'reviewer_id', type: 'int', nullable: true })
  reviewerId: number | null;

  // Phase 10 — soft-delete column. NULL means active. Filtered out of
  // every list / read in the service layer; restore endpoint clears it.
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  // =======================================
  // ORDERING
  // =======================================

  @Column({ name: 'sort_order', type: 'varchar', length: 255, default: 'n' })
  sortOrder: string;

  // =======================================
  // DATES
  // =======================================

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  // =======================================
  // EPIC-ONLY FIELDS (meaningful only when item_type = 'epic')
  // =======================================

  // Lifecycle state shown as the epic's pill + edited in Settings.
  // `shipped` is reached only via the ship operation, never a raw update.
  // BLOCKED / AT RISK are DERIVED at read time (see EpicsService), not stored.
  @Column({ name: 'epic_state', type: 'varchar', length: 16, default: 'draft' })
  epicState: 'draft' | 'planning' | 'in_flight' | 'shipped';

  // User-chosen epic hex color (e.g. '#7C3AED'). When null the API resolves a
  // palette color by id. Children render this color visually.
  @Column({ name: 'color', type: 'varchar', length: 9, nullable: true })
  color: string | null;

  // Set when archived. Archived epics are excluded from default lists/filters
  // but kept in history (NOT a soft-delete — `deleted_at` is separate).
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  // =======================================
  // SPRINT TRACKING
  // =======================================

  @Column({ name: 'added_mid_sprint', type: 'boolean', default: false })
  addedMidSprint: boolean;

  // =======================================
  // TIMESTAMPS
  // =======================================

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // =======================================
  // RELATIONS
  // =======================================

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => WorkItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: WorkItem | null;

  @OneToMany(() => WorkItem, (wi) => wi.parent)
  children: WorkItem[];

  @ManyToOne(() => Sprint, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sprint_id' })
  sprint: Sprint | null;

  @ManyToOne(() => ProjectStatus, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'status_id' })
  status: ProjectStatus;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @ManyToMany(() => Label)
  @JoinTable({
    name: 'work_item_labels',
    joinColumn: { name: 'work_item_id' },
    inverseJoinColumn: { name: 'label_id' },
  })
  labels: Label[];

  @OneToMany(() => Comment, (c) => c.workItem)
  comments: Comment[];

  @OneToMany(() => Attachment, (a) => a.workItem)
  attachments: Attachment[];
}
