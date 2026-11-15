import { ArrayMaxSize, ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveLabourGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(29)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  memberNames!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(29)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  availableMemberNames?: string[];
}
