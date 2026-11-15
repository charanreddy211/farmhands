import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, IsUrl, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  workType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  crop!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  farmLocationId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  area!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  peopleNeeded!: number;

  @IsInt()
  @Min(1)
  @Max(100000)
  @IsPositive()
  payPerDay!: number;

  @IsUUID()
  farmerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  workerIds!: string[];

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  @MaxLength(2048)
  imageUrl?: string | null;
}
