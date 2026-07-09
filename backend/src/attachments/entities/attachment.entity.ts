import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { WorkItem } from '../../work-items/entities/work-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('attachments')
@Index('IDX_attachment_work_item', ['workItemId'])
export class Attachment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'work_item_id', type: 'int' })
  workItemId: number;

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

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => WorkItem, (wi) => wi.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem: WorkItem;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}
