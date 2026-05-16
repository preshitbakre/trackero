import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { RetroCard } from './retro-card.entity';
import { User } from '../../users/entities/user.entity';

@Entity('retro_votes')
@Unique('UQ_retro_vote', ['cardId', 'userId'])
export class RetroVote {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'card_id', type: 'int' })
  cardId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => RetroCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card: RetroCard;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
