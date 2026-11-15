import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { LabourGroup } from '../groups/labour-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, LabourGroup])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
