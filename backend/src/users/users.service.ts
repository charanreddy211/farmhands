import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './user.entity';
import { currentFarmDate, isSameDayAvailabilityOpen } from '../common/farm-time';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async findProfile(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User profile not found');
    return user;
  }

  async updateProfile(id: string, input: UpdateProfileDto): Promise<User> {
    const user = await this.findProfile(id);
    if (!isSameDayAvailabilityOpen()) {
      const today = currentFarmDate();
      const addsToday = input.labourAvailableDates?.some((date) => date.slice(0, 10) === today)
        && !user.labourAvailableDates.some((date) => date.slice(0, 10) === today);
      if (input.labourAvailable === true || addsToday) {
        throw new BadRequestException('Same-day availability can only be set before 7:00 a.m. India time.');
      }
    }
    Object.assign(user, input);
    return this.users.save(user);
  }
}
