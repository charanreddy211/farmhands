import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

export type FarmLocation = {
  id: string;
  name: string;
  acres: number;
  crop: string;
  address: string;
  mapLink: string | null;
};

const dateArrayTransformer: ValueTransformer = {
  to: (value: string[] | null) => value,
  from: (value: Array<string | Date> | null): string[] => (value ?? []).map((date) => {
    if (typeof date === 'string') return date.slice(0, 10);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
};

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 30 })
  phone!: string;

  @Column({ length: 80, default: '' })
  firstName!: string;

  @Column({ length: 80, default: '' })
  lastName!: string;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email!: string | null;

  @Column({ type: 'text', default: '' })
  homeAddress!: string;

  @Column({ type: 'text', nullable: true })
  homeAddressMapLink!: string | null;

  @Column({ type: 'text', nullable: true })
  profileImageUrl!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  roles!: Array<'farmer' | 'labour'>;

  @Column({ type: 'varchar', length: 5, default: 'en' })
  preferredLanguage!: 'en' | 'te';

  @Column({ type: 'boolean', default: false })
  onboardingComplete!: boolean;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  labourSkills!: string[];

  @Column({ type: 'text', default: '' })
  labourArea!: string;

  @Column({ type: 'integer', nullable: true })
  labourDailyRate!: number | null;

  @Column({ type: 'integer', nullable: true })
  labourTravelRadius!: number | null;

  @Column({ type: 'double precision', nullable: true })
  labourLatitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  labourLongitude!: number | null;

  @Column({ type: 'boolean', default: false })
  labourAvailable!: boolean;

  @Column({ type: 'date', array: true, default: () => "'{}'", transformer: dateArrayTransformer })
  labourAvailableDates!: string[];

  @Column({ type: 'varchar', length: 10, default: 'full_day' })
  labourShift!: 'morning' | 'full_day';

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  farms!: FarmLocation[];

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
