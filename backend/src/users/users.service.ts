import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './user.entity';
import { currentFarmDate, filterCurrentAvailabilityDates, isSameDayAvailabilityOpen } from '../common/farm-time';
import { LabourGroup } from '../groups/labour-group.entity';
import { labourGroupCapacity } from '../groups/group-capacity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(LabourGroup) private readonly labourGroups: Repository<LabourGroup>,
  ) {}

  async findProfile(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User profile not found');
    const now = new Date();
    const today = currentFarmDate(now);
    const availableDates = filterCurrentAvailabilityDates(user.labourAvailableDates, now);
    const labourAvailable = isSameDayAvailabilityOpen(now)
      && availableDates.includes(today)
      && user.labourAvailable;
    if (availableDates.length !== user.labourAvailableDates.length || labourAvailable !== user.labourAvailable) {
      user.labourAvailableDates = availableDates;
      user.labourAvailable = labourAvailable;
      await this.users.save(user);
    }
    return user;
  }

  async updateProfile(id: string, input: UpdateProfileDto): Promise<User> {
    const user = await this.findProfile(id);
    const now = new Date();
    const today = currentFarmDate(now);
    const sameDayOpen = isSameDayAvailabilityOpen(now);
    const previousDates = new Set(user.labourAvailableDates);
    const previousCapacities = user.labourAvailablePeopleByDate ?? {};
    if (!sameDayOpen) {
      const addsToday = input.labourAvailableDates?.some((date) => date.slice(0, 10) === today)
        && !user.labourAvailableDates.some((date) => date.slice(0, 10) === today);
      if (input.labourAvailable === true || addsToday) {
        throw new BadRequestException('Same-day availability can only be set before 7:00 a.m. India time.');
      }
    }
    Object.assign(user, input);
    user.labourAvailableDates = filterCurrentAvailabilityDates(user.labourAvailableDates, now);
    if (input.labourAvailableDates || input.labourAvailablePeopleByDate) {
      const submittedCapacities = input.labourAvailablePeopleByDate;
      if (submittedCapacities && Object.keys(submittedCapacities).some((date) => !user.labourAvailableDates.includes(date))) {
        throw new BadRequestException('Availability headcounts can only be set for available dates.');
      }
      const newDates = user.labourAvailableDates.filter((date) => !previousDates.has(date));
      const group = newDates.length ? await this.labourGroups.findOne({ where: { leaderId: user.id } }) : null;
      user.labourAvailablePeopleByDate = Object.fromEntries(user.labourAvailableDates.map((date) => [
        date,
        submittedCapacities?.[date]
          ?? (previousDates.has(date) ? previousCapacities[date] ?? 1 : labourGroupCapacity(group)),
      ]));
    }
    user.labourAvailable = sameDayOpen
      && user.labourAvailableDates.includes(today)
      && user.labourAvailable;
    return this.users.save(user);
  }
}
