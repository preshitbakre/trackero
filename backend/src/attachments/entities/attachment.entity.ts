import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';

@Entity('attachments')
@Index('IDX_attachment_task', ['taskId'])
export class Attachment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

  @Column({ name: 'uploaded_by', type: 'int' })
  uploadedBy: number;

  @Column({ name: 'original_filename', length: 500 })
  originalFilename: string;

  @Column({ name: 'storage_key', length: 1000 })
  storageKey: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}
