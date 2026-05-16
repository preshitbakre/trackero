import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('invitations')
@Index('IDX_invite_token', ['token'], { unique: true })
@Index('IDX_invite_email', ['email'])
export class Invitation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 500 })
  token: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'member',
  })
  role: 'admin' | 'project_manager' | 'member' | 'viewer';

  @Column({ name: 'project_id', type: 'int', nullable: true })
  projectId: number | null;

  @Column({ name: 'invited_by', type: 'int' })
  invitedBy: number;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'pending',
  })
  status: 'pending' | 'accepted' | 'expired';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by' })
  inviter: User;
}
