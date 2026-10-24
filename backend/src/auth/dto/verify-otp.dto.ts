import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  otp!: string;
}
