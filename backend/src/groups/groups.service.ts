import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { SaveLabourGroupDto } from './dto/save-labour-group.dto';
import { LabourGroup } from './labour-group.entity';
import { labourGroupCapacity } from './group-capacity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(LabourGroup) private readonly groups: Repository<LabourGroup>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async findForLeader(leaderId: string) {
    await this.requireLabourLeader(leaderId);
    const group = await this.groups.findOne({ where: { leaderId } });
    return group ? {
      ...group,
      availableMemberNames: group.availableMemberNames ?? group.memberNames,
      size: labourGroupCapacity(group),
    } : null;
  }

  async save(leaderId: string, input: SaveLabourGroupDto) {
    await this.requireLabourLeader(leaderId);
    if (!input.name.trim()) throw new BadRequestException('Enter a group name.');
    const memberNames = input.memberNames.map((name) => name.trim()).filter(Boolean);
    if (memberNames.length !== input.memberNames.length) {
      throw new BadRequestException('Remove blank names from the group roster before saving.');
    }
    if (new Set(memberNames.map((name) => name.toLocaleLowerCase())).size !== memberNames.length) {
      throw new BadRequestException('Each group member must have a unique name.');
    }
    const activeNames = input.availableMemberNames ?? memberNames;
    const memberNameSet = new Set(memberNames.map((memberName) => memberName.toLocaleLowerCase()));
    if (activeNames.some((memberName) => !memberNameSet.has(memberName.trim().toLocaleLowerCase()))) {
      throw new BadRequestException('Only names on your group roster can be marked ready to work.');
    }
    const availableMemberNames = memberNames.filter((memberName) =>
      activeNames.some((activeName) => activeName.trim().toLocaleLowerCase() === memberName.toLocaleLowerCase()));
    const group = await this.groups.save(this.groups.create({
      leaderId,
      name: input.name.trim(),
      memberNames,
      availableMemberNames,
      workAsGroup: true,
    }));
    return { ...group, size: labourGroupCapacity(group) };
  }

  private async requireLabourLeader(leaderId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: leaderId } });
    if (!user) throw new NotFoundException('Worker profile not found.');
    if (!user.roles.includes('labour')) throw new ForbiddenException('Only labour profiles can manage a work group.');
    return user;
  }
}
