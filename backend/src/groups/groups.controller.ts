import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { SaveLabourGroupDto } from './dto/save-labour-group.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get(':leaderId')
  findForLeader(@Param('leaderId') leaderId: string) {
    return this.groupsService.findForLeader(leaderId);
  }

  @Put(':leaderId')
  save(@Param('leaderId') leaderId: string, @Body() input: SaveLabourGroupDto) {
    return this.groupsService.save(leaderId, input);
  }
}
