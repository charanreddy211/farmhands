import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { BookingCancellationReason } from './booking.entity';

@Entity('labour_requests')
export class RequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ type: 'text', default: '' })
  workType!: string;

  @Column({ type: 'text', default: '' })
  crop!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  farmLocationId!: string | null;

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

  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'uuid', nullable: true })
  farmerId!: string | null;

  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  workerIds!: string[];

  @Column({ length: 20, default: 'open' })
  status!: 'open' | 'filled' | 'closed' | 'expired';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => "(now() + interval '6 hours')" })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 40, nullable: true })
  closeReason!: BookingCancellationReason | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
