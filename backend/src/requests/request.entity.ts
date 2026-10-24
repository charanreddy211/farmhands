import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('labour_requests')
export class RequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ length: 160 })
  area!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column({ type: 'integer' })
  peopleNeeded!: number;

  @Column({ type: 'integer' })
  payPerDay!: number;

  @Column({ length: 20, default: 'open' })
  status!: 'open' | 'filled' | 'closed';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
