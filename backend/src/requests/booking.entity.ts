import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { RequestEntity } from './request.entity';
import { User } from '../users/user.entity';

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';
export type BookingCancellationReason = 'plans_changed' | 'found_another_worker' | 'dates_changed' | 'other';

@Entity('bookings')
export class Booking {
  @PrimaryColumn({ type: 'uuid' })
  requestId!: string;

  @PrimaryColumn({ type: 'uuid' })
  workerId!: string;

  @Column({ type: 'uuid' })
  farmerId!: string;

  @Column({ type: 'varchar', length: 20, default: 'confirmed' })
  status!: BookingStatus;

  @Column({ type: 'integer', default: 1 })
  peopleCount!: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cancellationReason!: BookingCancellationReason | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'timestamptz' })
  confirmedAt!: Date;

  @ManyToOne(() => RequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request!: RequestEntity;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workerId' })
  worker!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmerId' })
  farmer!: User;
}
