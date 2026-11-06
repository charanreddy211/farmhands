import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('labour_groups')
export class LabourGroup {
  @PrimaryColumn({ type: 'uuid' })
  leaderId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  memberNames!: string[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
