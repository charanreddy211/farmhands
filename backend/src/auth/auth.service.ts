import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  requestOtp(phone: string) {
    return { message: 'OTP sent', phone };
  }

  async verifyOtp(phone: string) {
    let user = await this.users.findOne({ where: { phone } });
    if (!user) {
      user = this.users.create({ phone, lastLoginAt: new Date() });
    } else {
      user.lastLoginAt = new Date();
    }
    await this.users.save(user);

    return {
      user: { id: user.id, phone: user.phone },
      token: `dev-${user.id}`,
    };
  }
}
