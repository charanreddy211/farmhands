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
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsLatitude,
  IsLongitude,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FarmLocationDto)
  farms?: FarmLocationDto[];
}
