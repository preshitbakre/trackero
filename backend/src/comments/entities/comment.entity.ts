import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { WorkItem } from '../../work-items/entities/work-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('comments')
@Index('IDX_comment_work_item', ['workItemId'])
export class Comment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'work_item_id', type: 'int' })
  workItemId: number;

  @Column({ name: 'author_id', type: 'int' })
  authorId: number;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkItem, (wi) => wi.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: WorkItem;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;
}
