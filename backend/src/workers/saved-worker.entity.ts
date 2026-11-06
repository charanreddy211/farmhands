import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('saved_workers')
export class SavedWorker {
  @PrimaryColumn({ type: 'uuid' })
  farmerId!: string;

  @PrimaryColumn({ type: 'uuid' })
  workerId!: string;

  @Column({ type: 'boolean', default: false })
  notifyWhenAvailable!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmerId', referencedColumnName: 'id' })
  farmer!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workerId', referencedColumnName: 'id' })
  worker!: User;
}
