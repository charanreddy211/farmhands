import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsController } from './requests.controller';
import { RequestEntity } from './request.entity';
import { RequestRecipient } from './request-recipient.entity';
import { Booking } from './booking.entity';
import { RequestsService } from './requests.service';
import { User } from '../users/user.entity';
import { LabourGroup } from '../groups/labour-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity, RequestRecipient, Booking, User, LabourGroup])],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
