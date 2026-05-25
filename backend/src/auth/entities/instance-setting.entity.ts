import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('instance_settings')
export class InstanceSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
