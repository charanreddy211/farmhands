import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsController } from './requests.controller';
import { RequestEntity } from './request.entity';
import { RequestsService } from './requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([RequestEntity])],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
