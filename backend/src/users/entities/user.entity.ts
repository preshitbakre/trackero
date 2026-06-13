import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index('IDX_user_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255, select: false })
  passwordHash: string;

  @Column({ name: 'display_name', length: 255 })
  displayName: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'member',
  })
  role: 'admin' | 'project_manager' | 'member' | 'viewer';

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ name: 'password_reset_token', type: 'varchar', length: 255, nullable: true, select: false })
  passwordResetToken: string | null;

  @Column({ name: 'password_reset_expires', type: 'timestamptz', nullable: true, select: false })
  passwordResetExpires: Date | null;

  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
