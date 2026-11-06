import { BookingCancellationReasonDto } from './cancel-booking.dto';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class RequestPartyDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsEnum(BookingCancellationReasonDto)
  reason?: BookingCancellationReasonDto;
}

export class RepeatRequestDto {
  @IsUUID()
  farmerId!: string;

  @IsUUID()
  workerId!: string;
}
