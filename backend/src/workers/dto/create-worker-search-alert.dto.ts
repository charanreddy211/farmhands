import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
  @Min(1)
  @Max(500)
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
