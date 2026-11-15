import { Type } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export class FarmLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  acres!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  crop!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  mapLink!: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;
}

@ValidatorConstraint({ name: 'availabilityPeopleByDate', async: false })
class AvailabilityPeopleByDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length <= 366 && entries.every(([date, peopleCount]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const parsedDate = new Date(`${date}T00:00:00.000Z`);
      return !Number.isNaN(parsedDate.getTime())
        && parsedDate.toISOString().slice(0, 10) === date
        && typeof peopleCount === 'number'
        && Number.isInteger(peopleCount)
        && peopleCount >= 1
        && peopleCount <= 30;
    });
  }

  defaultMessage(): string {
    return 'Availability headcounts must be whole numbers from 1 to 30 keyed by valid dates.';
  }
}

export class UpdateProfileDto {
  @IsOptional()
  @IsIn(['en', 'te'])
  preferredLanguage?: 'en' | 'te';

  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  homeAddress?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  homeAddressMapLink?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  @MaxLength(2048)
  profileImageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsIn(['farmer', 'labour'], { each: true })
  roles?: Array<'farmer' | 'labour'>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  labourSkills?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labourArea?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  labourDailyRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  labourTravelRadius?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  labourLatitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  labourLongitude?: number | null;

  @IsOptional()
  @IsBoolean()
  labourAvailable?: boolean;

  @IsOptional()
  @IsIn(['morning', 'full_day'])
  labourShift?: 'morning' | 'full_day';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @ArrayUnique()
  @IsDateString({}, { each: true })
  labourAvailableDates?: string[];

  @IsOptional()
  @IsObject()
  @Validate(AvailabilityPeopleByDateConstraint)
  labourAvailablePeopleByDate?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FarmLocationDto)
  farms?: FarmLocationDto[];
}
