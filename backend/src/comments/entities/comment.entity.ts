import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';

@Entity('comments')
@Index('IDX_comment_task', ['taskId'])
export class Comment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

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

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;
}
