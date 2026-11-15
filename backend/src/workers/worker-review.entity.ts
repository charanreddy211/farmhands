import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type WorkerAttendanceStatus = 'all_attended' | 'fewer_attended' | 'nobody_showed' | 'came_late' | 'everything_fine';

@Entity('worker_reviews')
@Index(['workerId', 'createdAt'])
@Index('IDX_worker_reviews_booking', ['requestId', 'workerId'], { unique: true, where: '"requestId" IS NOT NULL' })
@Check('CHK_worker_reviews_attendance', '"attendanceStatus" IS NULL OR "attendanceStatus" IN (\'all_attended\', \'fewer_attended\', \'nobody_showed\', \'came_late\', \'everything_fine\')')
@Check('CHK_worker_reviews_attendance_count', '(("attendanceStatus" IS NULL AND "peopleNeeded" IS NULL AND "peopleAttended" IS NULL) OR ("attendanceStatus" IS NOT NULL AND "peopleNeeded" IS NOT NULL AND "peopleAttended" IS NOT NULL AND "peopleNeeded" > 0 AND "peopleAttended" >= 0 AND "peopleAttended" <= "peopleNeeded"))')
export class WorkerReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  workerId!: string;

  @Column({ type: 'uuid' })
  farmerId!: string;

  @Column({ type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ type: 'integer' })
  rating!: number;

  @Column({ type: 'text', default: '' })
  comment!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  attendanceStatus!: WorkerAttendanceStatus | null;

  @Column({ type: 'integer', nullable: true })
  peopleNeeded!: number | null;

  @Column({ type: 'integer', nullable: true })
  peopleAttended!: number | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
