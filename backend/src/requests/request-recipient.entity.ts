import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { RequestEntity } from './request.entity';
import { User } from '../users/user.entity';

export type RequestRecipientStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

@Entity('request_recipients')
export class RequestRecipient {
  @PrimaryColumn({ type: 'uuid' })
  requestId!: string;

  @PrimaryColumn({ type: 'uuid' })
  workerId!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: RequestRecipientStatus;

  @Column({ type: 'varchar', length: 40, nullable: true })
  declineReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @ManyToOne(() => RequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request!: RequestEntity;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workerId' })
  worker!: User;
}
