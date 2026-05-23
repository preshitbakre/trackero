import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { WorkItem } from './work-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('work_item_associations')
@Unique('UQ_association', ['itemId', 'linkedItemId', 'linkType'])
@Index('IDX_assoc_item', ['itemId'])
@Index('IDX_assoc_linked', ['linkedItemId'])
@Index('IDX_assoc_type', ['linkType'])
@Index('IDX_assoc_created_by', ['createdBy'])
export class WorkItemAssociation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'item_id', type: 'int' })
  itemId: number;

  @Column({ name: 'linked_item_id', type: 'int' })
  linkedItemId: number;

  @Column({ name: 'link_type', type: 'varchar', length: 20 })
  linkType: 'belongs_to' | 'relates_to' | 'blocks' | 'caused_by';

  @Column({ name: 'created_by', type: 'int' })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: WorkItem;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'linked_item_id' })
  linkedItem: WorkItem;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;
}
