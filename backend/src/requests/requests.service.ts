import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestEntity } from './request.entity';

export type RequestStatus = RequestEntity['status'];

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requests: Repository<RequestEntity>,
  ) {}

  findAll(status?: RequestStatus): Promise<RequestEntity[]> {
    return this.requests.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  async create(input: CreateRequestDto): Promise<RequestEntity> {
    const request = this.requests.create(input);
    return this.requests.save(request);
  }
}
