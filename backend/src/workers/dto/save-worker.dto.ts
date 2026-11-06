import { IsBoolean } from 'class-validator';

export class SaveWorkerDto {
  @IsBoolean()
  notifyWhenAvailable!: boolean;
}
