import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { WorkerAttendanceStatus } from '../worker-review.entity';

const reviewTags = ['on_time', 'hard_working', 'careful', 'good_with_tools'] as const;

export class CreateWorkerReviewDto {
  @IsUUID()
  requestId!: string;

  @IsUUID()
  workerId!: string;

  @IsUUID()
  farmerId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsIn(['all_attended', 'fewer_attended', 'nobody_showed', 'came_late', 'everything_fine'])
  attendanceStatus!: WorkerAttendanceStatus;

  @IsInt()
  @Min(0)
  @Max(100)
  peopleAttended!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(reviewTags, { each: true })
  tags!: string[];

  @IsOptional()
  @IsBoolean()
  saveWorker?: boolean;
}
