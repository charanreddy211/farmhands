import { IsDateString, IsInt, IsNotEmpty, IsPositive, IsString, Min } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  area!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsInt()
  @Min(1)
  peopleNeeded!: number;

  @IsInt()
  @IsPositive()
  payPerDay!: number;
}
