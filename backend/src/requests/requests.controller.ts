import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestStatus, RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll(@Query('status') status?: RequestStatus) {
    return this.requestsService.findAll(status);
  }

  @Post()
  create(@Body() input: CreateRequestDto) {
    return this.requestsService.create(input);
  }
}
