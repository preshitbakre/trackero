import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
@Index('IDX_notif_user', ['userId'])
@Index('IDX_notif_read', ['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ name: 'reference_type', type: 'varchar', length: 20 })
  referenceType: 'work_item' | 'task' | 'sprint' | 'comment' | 'project';

  @Column({ name: 'reference_id', type: 'int' })
  referenceId: number;

  @Column({ name: 'project_id', type: 'int', nullable: true })
  projectId: number | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
