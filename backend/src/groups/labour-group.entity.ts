import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('labour_groups')
export class LabourGroup {
  @PrimaryColumn({ type: 'uuid' })
  leaderId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  memberNames!: string[];

  @Column({ type: 'text', array: true, nullable: true })
  availableMemberNames!: string[] | null;

  @Column({ type: 'boolean', default: true })
  workAsGroup!: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
