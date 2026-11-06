import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestEntity } from './request.entity';
import { RequestRecipient, RequestRecipientStatus } from './request-recipient.entity';
import { RequestDeclineReason, RequestResponseAction } from './dto/respond-to-request.dto';
import { Booking, BookingCancellationReason, BookingStatus } from './booking.entity';
import { BookingCancellationReasonDto } from './dto/cancel-booking.dto';
import { User } from '../users/user.entity';
import { LabourGroup } from '../groups/labour-group.entity';
import { currentFarmDate, isSameDayAvailabilityOpen } from '../common/farm-time';

export type RequestStatus = RequestEntity['status'];
export type WorkerRequestBucket = 'new' | 'accepted' | 'past';
export const workerRequestBuckets: WorkerRequestBucket[] = ['new', 'accepted', 'past'];
export type BookingBucket = 'upcoming' | 'pending' | 'past';
export type BookingPartyRole = 'farmer' | 'labour';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requests: Repository<RequestEntity>,
    @InjectRepository(RequestRecipient)
    private readonly recipients: Repository<RequestRecipient>,
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(LabourGroup)
    private readonly labourGroups: Repository<LabourGroup>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(status?: RequestStatus): Promise<RequestEntity[]> {
    return this.requests.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  async getOptions(farmerId: string) {
    const farmer = await this.users.findOne({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException('Farmer profile not found.');
    const workers = await this.users.createQueryBuilder('user')
      .select(['user.labourSkills'])
      .where(':role = ANY(user.roles)', { role: 'labour' })
      .getMany();
    const workTypes = [...new Set(workers.flatMap((worker) => worker.labourSkills.map((value) => value.trim()).filter(Boolean)))]
      .sort((left, right) => left.localeCompare(right));
    const crops = [...new Set((farmer.farms ?? []).map((farm) => farm.crop.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    return {
      workTypes,
      crops,
      farms: (farmer.farms ?? []).map(({ id, name, address, crop }) => ({ id, name, address, crop })),
    };
  }

  async create(input: CreateRequestDto): Promise<RequestEntity> {
    const farmer = await this.users.findOne({ where: { id: input.farmerId } });
    if (!farmer) throw new NotFoundException('Farmer profile not found.');
    if (input.farmLocationId && !farmer.farms.some((farm) => farm.id === input.farmLocationId)) {
      throw new BadRequestException('The selected farm does not belong to this profile.');
    }
    const start = new Date(`${input.startDate}T00:00:00.000Z`);
    const end = new Date(`${input.endDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start
      || (end.getTime() - start.getTime()) / 86400000 >= 31) {
      throw new BadRequestException('Choose a valid date range of 31 days or fewer.');
    }
    if (input.startDate < currentFarmDate()) throw new BadRequestException('Requests must start today or later.');
    if (input.startDate === currentFarmDate() && !isSameDayAvailabilityOpen()) {
      throw new BadRequestException('Same-day requests must be sent before 7:00 a.m. India time.');
    }
    if (input.workerIds.length) {
      const selectedWorkers = await this.users.createQueryBuilder('user')
        .where('user.id IN (:...workerIds)', { workerIds: input.workerIds })
        .andWhere(':role = ANY(user.roles)', { role: 'labour' })
        .getMany();
      if (selectedWorkers.length !== input.workerIds.length) {
        throw new BadRequestException('One or more selected workers are not available profiles.');
      }
      const selectedGroups = await this.labourGroups.find({ where: { leaderId: In(input.workerIds) } });
      const groupByLeader = new Map(selectedGroups.map((group) => [group.leaderId, group]));
      const selectedPeople = selectedWorkers.reduce(
        (total, worker) => total + (groupByLeader.get(worker.id)?.memberNames.length ?? 0) + 1,
        0,
      );
      if (selectedPeople < input.peopleNeeded) {
        throw new BadRequestException('Select enough worker groups to cover the number of people needed.');
      }
      const dates: string[] = [];
      for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.push(date.toISOString().slice(0, 10));
      }
      const unavailable = selectedWorkers.some((worker) => dates.some((date) =>
        !worker.labourAvailableDates.includes(date)));
      if (unavailable) {
        throw new BadRequestException('One or more selected workers are no longer available for those dates.');
      }
      const conflictingBookings = await this.bookings.createQueryBuilder('booking')
        .innerJoin('booking.request', 'request')
        .select('booking.workerId', 'workerId')
        .where('booking.workerId IN (:...workerIds)', { workerIds: input.workerIds })
        .andWhere('booking.status = :status', { status: 'confirmed' })
        .andWhere('request.startDate <= :endDate', { endDate: input.endDate })
        .andWhere('request.endDate >= :startDate', { startDate: input.startDate })
        .getRawMany<{ workerId: string }>();
      if (conflictingBookings.length) {
        throw new BadRequestException('One or more selected workers already have a confirmed booking for those dates.');
      }
    }
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.getRepository(RequestEntity).save(
        manager.getRepository(RequestEntity).create({
          ...input,
          expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        }),
      );
      if (input.workerIds.length) {
        await manager.getRepository(RequestRecipient).insert(
          input.workerIds.map((workerId) => ({ requestId: request.id, workerId })),
        );
      }
      return request;
    });
  }

  async findForWorker(workerId: string, bucket: WorkerRequestBucket) {
    const worker = await this.users.findOne({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Worker profile not found.');
    if (!worker.roles.includes('labour')) throw new ForbiddenException('Only labour profiles can view worker requests.');

    await this.expirePendingRequests();
    await this.recipients.query(`
      INSERT INTO "request_recipients" ("requestId", "workerId")
      SELECT request."id", $1::uuid
      FROM "labour_requests" request
      WHERE request."workerIds" @> ARRAY[$1::uuid]
      ON CONFLICT ("requestId", "workerId") DO NOTHING
    `, [workerId]);
    const recipients = await this.recipients.find({
      where: { workerId },
      relations: { request: true },
      order: { respondedAt: 'DESC' },
    });
    const requestIds = [...new Set(recipients.map(({ requestId }) => requestId))];
    const bookings = requestIds.length ? await this.bookings.find({ where: { workerId } }) : [];
    const bookingByRequestId = new Map(bookings.map((booking) => [booking.requestId, booking]));
    const today = currentFarmDate();
    const visible = recipients.filter((recipient) => {
      const booking = bookingByRequestId.get(recipient.requestId);
      const isPast = recipient.status === 'declined' || recipient.status === 'expired' || recipient.status === 'cancelled'
        || recipient.request.endDate < today
        || recipient.request.status === 'closed'
        || recipient.request.status === 'expired'
        || (recipient.status === 'pending' && recipient.request.status === 'filled')
        || booking?.status === 'cancelled' || booking?.status === 'completed';
      if (bucket === 'past') return isPast;
      if (bucket === 'accepted') return recipient.status === 'accepted' && booking?.status === 'confirmed' && !isPast;
      return recipient.status === 'pending' && !isPast && recipient.request.status === 'open';
    });
    const farmerIds = [...new Set(visible.map(({ request }) => request.farmerId).filter((id): id is string => Boolean(id)))];
    const farmers = farmerIds.length ? await this.users.find({ where: { id: In(farmerIds) } }) : [];
    const farmerById = new Map(farmers.map((farmer) => [farmer.id, farmer]));

    return visible.map((recipient) => {
      const farmer = recipient.request.farmerId ? farmerById.get(recipient.request.farmerId) : undefined;
      return {
        request: {
          id: recipient.request.id,
          title: recipient.request.title,
          workType: recipient.request.workType,
          crop: recipient.request.crop,
          area: recipient.request.area,
          startDate: recipient.request.startDate,
          endDate: recipient.request.endDate,
          peopleNeeded: recipient.request.peopleNeeded,
          payPerDay: recipient.request.payPerDay,
          status: recipient.request.status,
        },
        responseStatus: recipient.status,
        declineReason: recipient.declineReason,
        respondedAt: recipient.respondedAt,
        bookingStatus: bookingByRequestId.get(recipient.requestId)?.status ?? null,
        expiresAt: recipient.request.expiresAt,
        farmer: farmer ? {
          id: farmer.id,
          name: `${farmer.firstName} ${farmer.lastName}`.trim(),
          profileImageUrl: farmer.profileImageUrl,
        } : null,
      };
    });
  }

  async respond(
    requestId: string,
    workerId: string,
    status: RequestResponseAction,
    declineReason?: RequestDeclineReason,
  ): Promise<{ requestId: string; workerId: string; status: RequestRecipientStatus }> {
    const worker = await this.users.findOne({ where: { id: workerId } });
    if (!worker) throw new NotFoundException('Worker profile not found.');
    if (!worker.roles.includes('labour')) throw new ForbiddenException('Only labour profiles can respond to requests.');

    await this.expirePendingRequests();
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.getRepository(RequestEntity).findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Request not found.');
      if (request.status !== 'open') throw new BadRequestException('This request is no longer accepting responses.');
      if (request.expiresAt <= new Date()) throw new BadRequestException('This request has expired.');
      if (request.endDate < currentFarmDate()) {
        throw new BadRequestException('This request has expired.');
      }

      const recipient = await manager.getRepository(RequestRecipient).findOne({
        where: { requestId, workerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!recipient) throw new ForbiddenException('This request was not sent to your worker profile.');
      if (recipient.status !== 'pending') throw new BadRequestException('You have already responded to this request.');
      if (request.farmerId === null) throw new BadRequestException('This request has no active farmer profile.');

      recipient.status = status;
      recipient.declineReason = status === RequestResponseAction.DECLINE ? declineReason ?? null : null;
      recipient.respondedAt = new Date();
      await manager.getRepository(RequestRecipient).save(recipient);

      if (status === RequestResponseAction.ACCEPT) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [workerId]);
        const conflictingBookingCount = await manager.getRepository(Booking).createQueryBuilder('booking')
          .innerJoin('booking.request', 'bookedRequest')
          .where('booking.workerId = :workerId', { workerId })
          .andWhere('booking.status = :status', { status: 'confirmed' })
          .andWhere('bookedRequest.startDate <= :endDate', { endDate: request.endDate })
          .andWhere('bookedRequest.endDate >= :startDate', { startDate: request.startDate })
          .getCount();
        if (conflictingBookingCount) {
          throw new BadRequestException('You already have a confirmed booking that overlaps these dates.');
        }
        const bookingRepository = manager.getRepository(Booking);
        const acceptedRow = await bookingRepository.createQueryBuilder('booking')
          .select('COALESCE(SUM(booking.peopleCount), 0)', 'count')
          .where('booking.requestId = :requestId', { requestId })
          .andWhere('booking.status = :status', { status: 'confirmed' })
          .getRawOne<{ count: string }>();
        const acceptedCount = Number(acceptedRow?.count ?? 0);
        if (acceptedCount >= request.peopleNeeded) {
          throw new BadRequestException('This request already has enough confirmed workers.');
        }
        const group = await manager.getRepository(LabourGroup).findOne({ where: { leaderId: workerId } });
        const peopleCount = Math.min(group?.memberNames.length ? group.memberNames.length + 1 : 1, request.peopleNeeded - acceptedCount);
        await bookingRepository.save(bookingRepository.create({
          requestId,
          workerId,
          farmerId: request.farmerId,
          peopleCount,
          status: 'confirmed',
          confirmedAt: new Date(),
        }));
        if (acceptedCount + peopleCount >= request.peopleNeeded) {
          request.status = 'filled';
          await manager.getRepository(RequestEntity).save(request);
        }
      }

      return { requestId, workerId, status };
    });
  }

  async cancelRequest(requestId: string, farmerId: string, reason?: BookingCancellationReasonDto) {
    return this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(RequestEntity);
      const request = await requestRepository.findOne({
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Request not found.');
      if (request.farmerId !== farmerId) throw new ForbiddenException('Only the farmer who created this request can cancel it.');
      if (request.status !== 'open') throw new BadRequestException('Only an open request can be cancelled.');
      const confirmedBookings = await manager.getRepository(Booking).count({
        where: { requestId, status: 'confirmed' },
      });
      if (confirmedBookings) throw new BadRequestException('Cancel confirmed bookings individually before closing this request.');
      request.status = 'closed';
      request.closeReason = reason ? reason as BookingCancellationReason : null;
      request.closedAt = new Date();
      await requestRepository.save(request);
      await manager.getRepository(RequestRecipient).update(
        { requestId, status: 'pending' },
        { status: 'cancelled', respondedAt: new Date() },
      );
      return { requestId, status: request.status };
    });
  }

  async repeatRequest(requestId: string, farmerId: string, workerId: string): Promise<RequestEntity> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found.');
    if (request.farmerId !== farmerId) throw new ForbiddenException('Only the farmer who created this request can send it again.');
    if (!['expired', 'closed'].includes(request.status)) {
      throw new BadRequestException('Only an expired or cancelled request can be sent again.');
    }
    const recipient = await this.recipients.findOne({ where: { requestId, workerId } });
    if (!recipient) throw new BadRequestException('This worker was not part of the original request.');
    const repeated = await this.create({
      title: request.title,
      workType: request.workType,
      crop: request.crop,
      farmLocationId: request.farmLocationId,
      area: request.area,
      startDate: request.startDate,
      endDate: request.endDate,
      peopleNeeded: 1,
      payPerDay: request.payPerDay,
      imageUrl: request.imageUrl,
      farmerId,
      workerIds: [workerId],
    });
    return repeated;
  }

  async listBookings(userId: string, role: BookingPartyRole, bucket: BookingBucket) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User profile not found.');
    if (!user.roles.includes(role)) throw new ForbiddenException('This profile cannot view these bookings.');
    await this.expirePendingRequests();
    await this.completePastBookings();

    if (bucket === 'pending' && role === 'farmer') {
      const recipients = await this.recipients.find({
        where: { status: 'pending', request: { farmerId: userId, status: 'open' } },
        relations: { request: true, worker: true },
        order: { request: { createdAt: 'DESC' } },
      });
      return recipients
        .filter((recipient) => recipient.request.expiresAt > new Date())
        .map((recipient) => ({
          type: 'request' as const,
          request: this.requestSummary(recipient.request),
          responseStatus: recipient.status,
          expiresAt: recipient.request.expiresAt,
          worker: this.userSummary(recipient.worker),
          farmer: this.userSummary(user),
        }));
    }

    const where = role === 'farmer' ? { farmerId: userId } : { workerId: userId };
    const bookings = await this.bookings.find({
      where,
      relations: { request: true, worker: true, farmer: true },
      order: { confirmedAt: 'DESC' },
    });
    const today = currentFarmDate();
    const bookingItems = bookings.filter((booking) => {
      const ended = booking.request.endDate < today || booking.status === 'completed' || booking.status === 'cancelled';
      if (bucket === 'past') return ended;
      if (bucket === 'upcoming') return booking.status === 'confirmed' && !ended;
      return false;
    }).map((booking) => ({
      type: 'booking' as const,
      request: this.requestSummary(booking.request),
      booking: {
        requestId: booking.requestId,
        workerId: booking.workerId,
        status: booking.status,
        peopleCount: booking.peopleCount,
        confirmedAt: booking.confirmedAt,
        cancellationReason: booking.cancellationReason,
        cancelledAt: booking.cancelledAt,
      },
      responseStatus: 'accepted' as const,
      worker: this.userSummary(booking.worker),
      farmer: this.userSummary(booking.farmer),
    }));
    if (bucket !== 'past') return bookingItems;

    const recipientWhere = role === 'farmer'
      ? { request: { farmerId: userId }, status: In(['declined', 'expired', 'cancelled'] as RequestRecipientStatus[]) }
      : { workerId: userId, status: In(['declined', 'expired', 'cancelled'] as RequestRecipientStatus[]) };
    const pastRecipients = await this.recipients.find({
      where: recipientWhere,
      relations: { request: true, worker: true },
      order: { respondedAt: 'DESC' },
    });
    const pastFarmerIds = [...new Set(pastRecipients
      .map(({ request }) => request.farmerId)
      .filter((id): id is string => Boolean(id)))];
    const pastFarmers = pastFarmerIds.length ? await this.users.find({ where: { id: In(pastFarmerIds) } }) : [];
    const pastFarmerById = new Map(pastFarmers.map((farmer) => [farmer.id, farmer]));
    const recipientKeysForBookings = new Set(bookings.map((booking) => `${booking.requestId}:${booking.workerId}`));
    const recipientItems = pastRecipients
      .filter((recipient) => !recipientKeysForBookings.has(`${recipient.requestId}:${recipient.workerId}`))
      .map((recipient) => ({
        type: recipient.status === 'expired' ? 'expired' as const : 'request' as const,
        request: this.requestSummary(recipient.request),
        responseStatus: recipient.status,
        expiresAt: recipient.request.expiresAt,
        worker: role === 'farmer' ? this.userSummary(recipient.worker) : this.userSummary(user),
        farmer: role === 'farmer'
          ? this.userSummary(user)
          : recipient.request.farmerId && pastFarmerById.has(recipient.request.farmerId)
            ? this.userSummary(pastFarmerById.get(recipient.request.farmerId)!)
            : null,
      }));
    return [...bookingItems, ...recipientItems];
  }

  async getBookingDetails(requestId: string, workerId: string, userId: string) {
    const booking = await this.bookings.findOne({
      where: { requestId, workerId },
      relations: { request: true, worker: true, farmer: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (userId !== booking.workerId && userId !== booking.farmerId) {
      throw new ForbiddenException('You are not part of this booking.');
    }
    const farm = booking.request.farmLocationId
      ? booking.farmer.farms.find((location) => location.id === booking.request.farmLocationId)
      : undefined;
    return {
      request: this.requestSummary(booking.request),
      booking: {
        requestId: booking.requestId,
        workerId: booking.workerId,
        status: booking.status,
        peopleCount: booking.peopleCount,
        confirmedAt: booking.confirmedAt,
        cancellationReason: booking.cancellationReason,
        cancelledAt: booking.cancelledAt,
      },
      worker: { ...this.userSummary(booking.worker), phone: booking.status === 'cancelled' ? null : booking.worker.phone },
      farmer: {
        ...this.userSummary(booking.farmer),
        phone: booking.status === 'cancelled' ? null : booking.farmer.phone,
        farmMapLink: farm?.mapLink ?? null,
      },
    };
  }

  async cancelBooking(requestId: string, workerId: string, userId: string, reason: BookingCancellationReasonDto) {
    return this.dataSource.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const booking = await bookingRepository.findOne({
        where: { requestId, workerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) throw new NotFoundException('Booking not found.');
      if (userId !== booking.workerId && userId !== booking.farmerId) {
        throw new ForbiddenException('You are not part of this booking.');
      }
      if (booking.status !== 'confirmed') throw new BadRequestException('Only a confirmed booking can be cancelled.');

      booking.status = 'cancelled';
      booking.cancellationReason = reason as BookingCancellationReason;
      booking.cancelledBy = userId;
      booking.cancelledAt = new Date();
      await bookingRepository.save(booking);
      await manager.getRepository(RequestRecipient).update(
        { requestId, workerId },
        { status: 'cancelled', respondedAt: booking.cancelledAt },
      );

      const requestRepository = manager.getRepository(RequestEntity);
      const request = await requestRepository.findOne({ where: { id: requestId }, lock: { mode: 'pessimistic_write' } });
      const confirmedRow = await bookingRepository.createQueryBuilder('booking')
        .select('COALESCE(SUM(booking.peopleCount), 0)', 'count')
        .where('booking.requestId = :requestId', { requestId })
        .andWhere('booking.status = :status', { status: 'confirmed' })
        .getRawOne<{ count: string }>();
      const confirmedCount = Number(confirmedRow?.count ?? 0);
      if (request?.status === 'filled' && confirmedCount < request.peopleNeeded
        && request.expiresAt > new Date() && request.endDate >= currentFarmDate()) {
        request.status = 'open';
        await requestRepository.save(request);
      }
      return { requestId, workerId, status: booking.status, cancellationReason: booking.cancellationReason };
    });
  }

  private async expirePendingRequests(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      await manager.getRepository(RequestRecipient).createQueryBuilder()
        .update()
        .set({ status: 'expired', respondedAt: now })
        .where(`"status" = 'pending'`)
        .andWhere(`"requestId" IN (SELECT "id" FROM "labour_requests" WHERE "expiresAt" <= :now AND "status" = 'open')`, { now })
        .execute();
      await manager.getRepository(RequestEntity).createQueryBuilder()
        .update()
        .set({ status: 'expired' })
        .where(`"status" = 'open'`)
        .andWhere(`"expiresAt" <= :now`, { now })
        .execute();
    });
  }

  private async completePastBookings(): Promise<void> {
    await this.bookings.createQueryBuilder()
      .update()
      .set({ status: 'completed' as BookingStatus })
      .where(`"status" = 'confirmed'`)
      .andWhere(`"requestId" IN (SELECT "id" FROM "labour_requests" WHERE "endDate" < :today)`, { today: currentFarmDate() })
      .execute();
  }

  private requestSummary(request: RequestEntity) {
    return {
      id: request.id,
      title: request.title,
      workType: request.workType,
      crop: request.crop,
      area: request.area,
      farmLocationId: request.farmLocationId,
      startDate: request.startDate,
      endDate: request.endDate,
      peopleNeeded: request.peopleNeeded,
      payPerDay: request.payPerDay,
      status: request.status,
      expiresAt: request.expiresAt,
    };
  }

  private userSummary(user: User) {
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      profileImageUrl: user.profileImageUrl,
      area: user.labourArea || user.homeAddress,
    };
  }
}
