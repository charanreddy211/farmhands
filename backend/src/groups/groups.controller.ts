import { Controller, Get, Query } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  findAll(@Query('available') available?: string) {
    return this.groupsService.findAll(available === 'true');
  }
}
