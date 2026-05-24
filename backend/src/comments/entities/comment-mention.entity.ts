import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Phase 7 — first-class comment mention. UQ(comment_id, user_id)
 * stops dup inserts on edits; both FKs CASCADE.
 */
@Entity('comment_mentions')
@Index('UQ_comment_mentions', ['commentId', 'userId'], { unique: true })
@Index('IDX_comment_mentions_user', ['userId'])
export class CommentMention {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'comment_id', type: 'int' })
  commentId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: Comment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
