import { Injectable } from '@nestjs/common';

export interface LabourGroup {
  id: string;
  name: string;
  area: string;
  members: number;
  skills: string[];
  available: boolean;
  nextDate: string;
}

@Injectable()
export class GroupsService {
  private readonly groups: LabourGroup[] = [
    {
      id: 'group-green-valley',
      name: 'Green Valley Crew',
      area: 'Sira, Tumakuru',
      members: 12,
      skills: ['Harvesting', 'Sorting'],
      available: true,
      nextDate: 'Available today',
    },
    {
      id: 'group-kaveri-field',
      name: 'Kaveri Field Team',
      area: 'Maddur, Mandya',
      members: 8,
      skills: ['Transplanting', 'Irrigation'],
      available: true,
      nextDate: 'From tomorrow',
    },
    {
      id: 'group-sunrise-women',
      name: 'Sunrise Women Farmers',
      area: 'Channapatna',
      members: 15,
      skills: ['Picking', 'Packing'],
      available: false,
      nextDate: 'Available 24 Sep',
    },
  ];

  findAll(availableOnly = false): LabourGroup[] {
    return availableOnly ? this.groups.filter((group) => group.available) : this.groups;
  }
}
