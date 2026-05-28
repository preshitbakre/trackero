import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { WorkItem } from './work-item.entity';

/**
 * Release notes for a story — 1:1 with a work item. Surfaced on a "done"
 * story via the "View release notes" header action.
 */
@Entity('story_release_notes')
@Index('UQ_release_note_work_item', ['workItemId'], { unique: true })
export class ReleaseNote {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'work_item_id', type: 'int' })
  workItemId: number;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: WorkItem;
}
