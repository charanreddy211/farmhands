import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { WorkerReview } from './worker-review.entity';
import { WorkerSearchAlert } from './worker-search-alert.entity';
import { Booking } from '../requests/booking.entity';
import { RequestRecipient } from '../requests/request-recipient.entity';
import { SavedWorker } from './saved-worker.entity';
import { LabourGroup } from '../groups/labour-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, WorkerReview, WorkerSearchAlert, Booking, SavedWorker, RequestRecipient, LabourGroup])],
  controllers: [WorkersController],
  providers: [WorkersService],
})
export class WorkersModule {}
