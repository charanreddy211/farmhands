import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('worker_search_alerts')
export class WorkerSearchAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  farmerId!: string;

  @Column({ type: 'date' })
  from!: string;

  @Column({ type: 'date' })
  to!: string;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'integer', nullable: true })
  maxDistanceKm!: number | null;

  @Column({ type: 'double precision', nullable: true })
  minRating!: number | null;

  @Column({ type: 'text', nullable: true })
  skill!: string | null;

  @Column({ type: 'text', nullable: true })
  query!: string | null;

  @Column({ type: 'boolean', default: false })
  workedWithMe!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
