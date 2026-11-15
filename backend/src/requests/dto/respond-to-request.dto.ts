import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

export enum RequestResponseAction {
  ACCEPT = 'accepted',
  DECLINE = 'declined',
}

export enum RequestDeclineReason {
  ALREADY_BOOKED = 'already_booked',
  TOO_FAR = 'too_far',
  PAY_TOO_LOW = 'pay_too_low',
  NOT_AVAILABLE = 'not_available',
}

export class RespondToRequestDto {
  @IsUUID()
  workerId!: string;

  @IsEnum(RequestResponseAction)
  status!: RequestResponseAction;

  @ValidateIf((input: RespondToRequestDto) => input.status === RequestResponseAction.DECLINE)
  @IsEnum(RequestDeclineReason)
  declineReason?: RequestDeclineReason;
}
