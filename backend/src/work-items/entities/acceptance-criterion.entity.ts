import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { WorkItem } from './work-item.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Acceptance criteria for a story (or any work item).
 *
 * Polymorphic: a criterion is *structured* (Given / When / Then) when
 * `whenText` and `thenText` are both set, otherwise *plain* — `givenText`
 * then carries the whole single-line statement. The UI renders accordingly.
 */
@Entity('work_item_acceptance_criteria')
@Index('IDX_ac_work_item', ['workItemId'])
export class AcceptanceCriterion {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'work_item_id', type: 'int' })
  workItemId: number;

  // Given clause, OR the whole statement when this is a plain criterion.
  @Column({ name: 'given_text', type: 'text' })
  givenText: string;

  // null ⇒ plain (non-structured) criterion. Both when/then move together.
  @Column({ name: 'when_text', type: 'text', nullable: true })
  whenText: string | null;

  @Column({ name: 'then_text', type: 'text', nullable: true })
  thenText: string | null;

  @Column({ name: 'is_met', type: 'boolean', default: false })
  isMet: boolean;

  @Column({ name: 'verified_by', type: 'int', nullable: true })
  verifiedBy: number | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  // Optional link to the work item that satisfies / relates to this criterion.
  @Column({ name: 'linked_item_id', type: 'int', nullable: true })
  linkedItemId: number | null;

  @Column({ name: 'sort_order', type: 'varchar', length: 255, default: 'n' })
  sortOrder: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: WorkItem;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifier: User | null;

  @ManyToOne(() => WorkItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'linked_item_id' })
  linkedItem: WorkItem | null;
}
