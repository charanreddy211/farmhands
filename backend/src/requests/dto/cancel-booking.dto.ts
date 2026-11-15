import { IsEnum, IsUUID } from 'class-validator';

export enum BookingCancellationReasonDto {
  PLANS_CHANGED = 'plans_changed',
  FOUND_ANOTHER_WORKER = 'found_another_worker',
  DATES_CHANGED = 'dates_changed',
  OTHER = 'other',
}

export class CancelBookingDto {
  @IsUUID()
  userId!: string;

  @IsEnum(BookingCancellationReasonDto)
  reason!: BookingCancellationReasonDto;
}
