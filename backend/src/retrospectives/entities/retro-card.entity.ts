import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Retrospective } from './retrospective.entity';
import { User } from '../../users/entities/user.entity';

// Phase 6 — `kept | dropped | lucky_breaks | next` join the historical
// `went_well | to_improve | action_items` values at the storage layer.
// API + UI map old → new for one release.
export type RetroCardColumn =
  | 'went_well' | 'to_improve' | 'action_items'
  | 'kept' | 'dropped' | 'lucky_breaks' | 'next';

@Entity('retro_cards')
@Index('IDX_retro_card_retro', ['retrospectiveId'])
export class RetroCard {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'retrospective_id', type: 'int' })
  retrospectiveId: number;

  @Column({ type: 'varchar', length: 20 })
  column: RetroCardColumn;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'author_id', type: 'int' })
  authorId: number;

  @Column({ type: 'int', default: 0 })
  votes: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Retrospective, (r) => r.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'retrospective_id' })
  retrospective: Retrospective;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;
}
