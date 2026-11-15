import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateWorkerSearchAlertDto {
  @IsUUID()
  farmerId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([3, 5, 7, 10, 15, 20], { message: 'Choose 3, 5, 7, 10, 15 or 20 km.' })
  maxDistanceKm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  skill?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @IsBoolean()
  workedWithMe?: boolean;
}
