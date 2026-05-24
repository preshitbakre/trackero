import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Phase 7 — emoji reaction on a comment. UQ(comment_id, user_id, emoji)
 * lets a user react with multiple emojis but not the same one twice.
 */
@Entity('comment_reactions')
@Index('UQ_comment_reactions', ['commentId', 'userId', 'emoji'], { unique: true })
@Index('IDX_comment_reactions_comment', ['commentId'])
export class CommentReaction {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'comment_id', type: 'int' })
  commentId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'emoji', type: 'varchar', length: 8 })
  emoji: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: Comment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
