import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { LabourGroup } from './labour-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LabourGroup, User])],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [TypeOrmModule],
})
export class GroupsModule {}
