import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Booking } from '../requests/booking.entity';
import { RequestRecipient } from '../requests/request-recipient.entity';
import { RequestEntity } from '../requests/request.entity';
import { CreateWorkerSearchAlertDto } from './dto/create-worker-search-alert.dto';
import { CreateWorkerReviewDto } from './dto/create-worker-review.dto';
import { SaveWorkerDto } from './dto/save-worker.dto';
import { WorkerReview } from './worker-review.entity';
import { WorkerSearchAlert } from './worker-search-alert.entity';
import { SavedWorker } from './saved-worker.entity';
import { LabourGroup } from '../groups/labour-group.entity';
import { currentFarmDate, isSameDayAvailabilityOpen } from '../common/farm-time';

type WorkerSearchInput = {
  from?: string;
  to?: string;
  latitude?: string;
  longitude?: string;
  maxDistanceKm?: string;
  minRating?: string;
  skill?: string;
  query?: string;
  farmerId?: string;
  workedWithMe: boolean;
};

type Coordinates = { latitude: number; longitude: number };

function parseDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} must be a valid calendar date.`);
  }
  return date;
}

function eachDate(from: Date, to: Date): string[] {
  const dates: string[] = [];
  for (const day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

function dateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function distanceInKm(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseNumber(value: string | undefined, name: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(WorkerReview) private readonly reviews: Repository<WorkerReview>,
    @InjectRepository(WorkerSearchAlert) private readonly alerts: Repository<WorkerSearchAlert>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(SavedWorker) private readonly savedWorkers: Repository<SavedWorker>,
    @InjectRepository(RequestRecipient) private readonly recipients: Repository<RequestRecipient>,
    @InjectRepository(LabourGroup) private readonly labourGroups: Repository<LabourGroup>,
    private readonly dataSource: DataSource,
  ) {}

  async submitReview(input: CreateWorkerReviewDto) {
    await this.completePastBookings();
    const [farmer, worker, booking] = await Promise.all([
      this.users.findOne({ where: { id: input.farmerId } }),
      this.users.findOne({ where: { id: input.workerId } }),
      this.bookings.findOne({
        where: { requestId: input.requestId, workerId: input.workerId },
        relations: { request: true },
      }),
    ]);
    if (!farmer) throw new NotFoundException('Farmer profile not found.');
    if (!farmer.roles.includes('farmer')) throw new ForbiddenException('Only farmer profiles can review workers.');
    if (!worker || !worker.roles.includes('labour')) throw new NotFoundException('Worker profile not found.');
    if (!booking || booking.farmerId !== input.farmerId) {
      throw new ForbiddenException('This booking does not belong to this farmer.');
    }
    if (booking.status !== 'completed' || booking.request.endDate >= currentFarmDate()) {
      throw new BadRequestException('Workers can be rated after the booking has ended.');
    }
    if (input.peopleAttended > booking.peopleCount) {
      throw new BadRequestException('People who attended cannot exceed the number requested.');
    }
    if ((input.attendanceStatus === 'all_attended' || input.attendanceStatus === 'everything_fine')
      && input.peopleAttended !== booking.peopleCount) {
      throw new BadRequestException('Record the full requested group for this attendance option.');
    }
    if (input.attendanceStatus === 'fewer_attended'
      && (input.peopleAttended < 1 || input.peopleAttended >= booking.peopleCount)) {
      throw new BadRequestException('Choose a number below the requested group size.');
    }
    if (input.attendanceStatus === 'nobody_showed' && input.peopleAttended !== 0) {
      throw new BadRequestException('Set the number who attended to zero.');
    }
    return this.dataSource.transaction(async (manager) => {
      const lockedBooking = await manager.getRepository(Booking).findOne({
        where: { requestId: input.requestId, workerId: input.workerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedBooking || lockedBooking.farmerId !== input.farmerId || lockedBooking.status !== 'completed') {
        throw new BadRequestException('This booking is not available for rating.');
      }
      if (await manager.getRepository(WorkerReview).exist({
        where: { requestId: input.requestId, workerId: input.workerId },
      })) {
        throw new BadRequestException('This booking has already been rated.');
      }
      const review = manager.getRepository(WorkerReview).create({
        requestId: input.requestId,
        workerId: input.workerId,
        farmerId: input.farmerId,
        rating: input.rating,
        comment: input.comment?.trim() ?? '',
        attendanceStatus: input.attendanceStatus,
        peopleNeeded: booking.peopleCount,
        peopleAttended: input.peopleAttended,
        tags: [...new Set(input.tags)],
      });
      await manager.getRepository(WorkerReview).save(review);

      if (input.saveWorker) {
        const savedRepository = manager.getRepository(SavedWorker);
        const saved = await savedRepository.findOne({
          where: { farmerId: input.farmerId, workerId: input.workerId },
        });
        await savedRepository.save(savedRepository.create({
          farmerId: input.farmerId,
          workerId: input.workerId,
          notifyWhenAvailable: saved?.notifyWhenAvailable ?? false,
          ...(saved ? { createdAt: saved.createdAt } : {}),
        }));
      } else {
        await manager.getRepository(SavedWorker).delete({
          farmerId: input.farmerId,
          workerId: input.workerId,
        });
      }
      return { id: review.id, saved: Boolean(input.saveWorker) };
    });
  }

  async getBookingReview(requestId: string, workerId: string, farmerId: string) {
    await this.completePastBookings();
    const booking = await this.bookings.findOne({ where: { requestId, workerId } });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.farmerId !== farmerId) throw new ForbiddenException('This booking does not belong to this farmer.');
    const review = await this.reviews.findOne({ where: { requestId, workerId, farmerId } });
    return {
      canRate: booking.status === 'completed',
      review: review ? {
        id: review.id,
        rating: review.rating,
        attendanceStatus: review.attendanceStatus,
        peopleNeeded: review.peopleNeeded,
        peopleAttended: review.peopleAttended,
        tags: review.tags,
        createdAt: review.createdAt,
      } : null,
    };
  }

  async listSavedWorkers(farmerId: string, freeTodayOnly = false) {
    const farmer = await this.users.findOne({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException('Farmer profile not found.');
    if (!farmer.roles.includes('farmer')) throw new ForbiddenException('Only farmer profiles can view saved workers.');

    const [saved, bookings] = await Promise.all([
      this.savedWorkers.find({ where: { farmerId } }),
      this.bookings.find({
        where: { farmerId, status: In(['confirmed', 'completed']) },
        relations: { worker: true, request: true },
        order: { confirmedAt: 'DESC' },
      }),
    ]);
    const savedByWorker = new Map(saved.map((item) => [item.workerId, item]));
    const workersById = new Map<string, User>();
    const lastBookingByWorker = new Map<string, Booking>();
    for (const booking of bookings) {
      workersById.set(booking.workerId, booking.worker);
      if (!lastBookingByWorker.has(booking.workerId)) lastBookingByWorker.set(booking.workerId, booking);
    }
    const savedOnlyIds = saved.map((item) => item.workerId).filter((id) => !workersById.has(id));
    if (savedOnlyIds.length) {
      const savedOnlyWorkers = await this.users.find({ where: { id: In(savedOnlyIds) } });
      for (const worker of savedOnlyWorkers) workersById.set(worker.id, worker);
    }

    const ids = [...workersById.keys()];
    const today = currentFarmDate();
    const activeBookings = ids.length ? await this.bookings.find({
      where: { workerId: In(ids), status: 'confirmed' },
      relations: { request: true },
    }) : [];
    const activeByWorker = new Map<string, Booking[]>();
    for (const booking of activeBookings) {
      const list = activeByWorker.get(booking.workerId) ?? [];
      list.push(booking);
      activeByWorker.set(booking.workerId, list);
    }
    const stats = ids.length ? await this.reviews.createQueryBuilder('review')
      .select('review.workerId', 'workerId')
      .addSelect('AVG(review.rating)', 'averageRating')
      .addSelect('COUNT(review.id)', 'reviewCount')
      .where('review.workerId IN (:...ids)', { ids })
      .groupBy('review.workerId')
      .getRawMany<{ workerId: string; averageRating: string; reviewCount: string }>() : [];
    const statsByWorker = new Map(stats.map((row) => [row.workerId, {
      rating: Math.round(Number(row.averageRating) * 10) / 10,
      reviewCount: Number(row.reviewCount),
    }]));
    const myReviewRows = ids.length ? await this.reviews.createQueryBuilder('review')
      .select('review.workerId', 'workerId')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.farmerId = :farmerId', { farmerId })
      .andWhere('review.workerId IN (:...ids)', { ids })
      .groupBy('review.workerId')
      .getRawMany<{ workerId: string; count: string }>() : [];
    const myReviewCounts = new Map(myReviewRows.map((row) => [row.workerId, Number(row.count)]));
    const latestReviewRows = ids.length ? await this.reviews.createQueryBuilder('review')
      .innerJoin(User, 'farmer', 'farmer.id = review.farmerId')
      .select([
        'review.workerId AS "workerId"',
        'review.rating AS rating',
        'review.comment AS comment',
        'review.createdAt AS "createdAt"',
        'farmer.firstName AS "farmerFirstName"',
        'farmer.lastName AS "farmerLastName"',
      ])
      .where('review.workerId IN (:...ids)', { ids })
      .orderBy('review.createdAt', 'DESC')
      .getRawMany<{
        workerId: string;
        rating: number;
        comment: string;
        createdAt: Date;
        farmerFirstName: string;
        farmerLastName: string;
      }>() : [];
    const latestReviewByWorker = new Map<string, typeof latestReviewRows[number]>();
    for (const review of latestReviewRows) {
      if (!latestReviewByWorker.has(review.workerId)) latestReviewByWorker.set(review.workerId, review);
    }

    return [...workersById.values()]
      .filter((worker) => worker.roles.includes('labour'))
      .map((worker) => {
        const active = activeByWorker.get(worker.id) ?? [];
        const freeToday = isSameDayAvailabilityOpen() && worker.labourAvailable && !active.some((booking) =>
          booking.request.startDate <= today && booking.request.endDate >= today);
        const bookedThroughDates = active
          .map(({ request }) => request.endDate)
          .filter((endDate) => endDate >= today)
          .sort();
        const bookedThrough = bookedThroughDates[bookedThroughDates.length - 1] ?? null;
        const savedWorker = savedByWorker.get(worker.id);
        const statsForWorker = statsByWorker.get(worker.id);
        const latestBooking = lastBookingByWorker.get(worker.id);
        const latestReview = latestReviewByWorker.get(worker.id);
        return {
          id: worker.id,
          name: `${worker.firstName} ${worker.lastName}`.trim(),
          area: worker.labourArea,
          skills: worker.labourSkills,
          dailyRate: worker.labourDailyRate,
          travelRadius: worker.labourTravelRadius,
          available: freeToday,
          availableDates: worker.labourAvailableDates,
          labourShift: worker.labourShift,
          rating: statsForWorker?.rating ?? null,
          reviewCount: statsForWorker?.reviewCount ?? 0,
          myReviewCount: myReviewCounts.get(worker.id) ?? 0,
          distanceKm: null,
          latestReview: latestReview ? {
            rating: Number(latestReview.rating),
            comment: latestReview.comment,
            farmerName: `${latestReview.farmerFirstName} ${latestReview.farmerLastName}`.trim(),
            createdAt: latestReview.createdAt,
          } : null,
          profileImageUrl: worker.profileImageUrl,
          saved: Boolean(savedWorker),
          notifyWhenAvailable: savedWorker?.notifyWhenAvailable ?? false,
          bookedThrough,
          lastWorkedAt: latestBooking?.request.endDate ?? null,
        };
      })
      .filter((worker) => !freeTodayOnly || worker.available)
      .sort((left, right) => Number(right.available) - Number(left.available) || left.name.localeCompare(right.name));
  }

  async removeSavedWorker(farmerId: string, workerId: string) {
    const result = await this.savedWorkers.delete({ farmerId, workerId });
    if (!result.affected) throw new NotFoundException('Saved worker not found.');
    return { saved: false, workerId };
  }

  async updateSavedWorkerAlert(farmerId: string, workerId: string, input: SaveWorkerDto) {
    const saved = await this.savedWorkers.findOne({ where: { farmerId, workerId } });
    if (!saved) throw new NotFoundException('Save this worker before changing availability alerts.');
    saved.notifyWhenAvailable = input.notifyWhenAvailable;
    await this.savedWorkers.save(saved);
    return { workerId, notifyWhenAvailable: saved.notifyWhenAvailable };
  }

  private async completePastBookings(): Promise<void> {
    await this.bookings.createQueryBuilder()
      .update()
      .set({ status: 'completed' })
      .where(`"status" = 'confirmed'`)
      .andWhere(`"requestId" IN (SELECT "id" FROM "labour_requests" WHERE "endDate" < :today)`, {
        today: currentFarmDate(),
      })
      .execute();
  }

  async saveAlert(input: CreateWorkerSearchAlertDto): Promise<{ saved: true }> {
    const from = parseDate(input.from, 'from');
    const to = parseDate(input.to, 'to');
    if (!from || !to || to < from || eachDate(from, to).length > 31) {
      throw new BadRequestException('Choose a valid date range of 31 days or fewer.');
    }
    if ((input.latitude === undefined) !== (input.longitude === undefined)) {
      throw new BadRequestException('Provide both latitude and longitude.');
    }
    if (input.maxDistanceKm && input.latitude === undefined) {
      throw new BadRequestException('Enable location before saving a distance alert.');
    }
    if (!await this.users.exist({ where: { id: input.farmerId } })) {
      throw new BadRequestException('Farmer profile not found.');
    }
    await this.alerts.save(this.alerts.create({
      farmerId: input.farmerId,
      from: input.from,
      to: input.to,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      maxDistanceKm: input.maxDistanceKm ?? null,
      minRating: input.minRating ?? null,
      skill: input.skill?.trim() || null,
      query: input.query?.trim() || null,
      workedWithMe: input.workedWithMe ?? false,
    }));
    return { saved: true };
  }

  async listAlerts(farmerId: string) {
    const farmer = await this.users.findOne({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException('Farmer profile not found.');
    if (!farmer.roles.includes('farmer')) throw new ForbiddenException('Only farmer profiles can view alerts.');

    const [bookings, expiredRecipients, savedSearches] = await Promise.all([
      this.bookings.find({
        where: { farmerId },
        relations: { worker: true, request: true },
        order: { confirmedAt: 'DESC' },
        take: 30,
      }),
      this.recipients.find({
        where: { status: 'expired', request: { farmerId } },
        relations: { worker: true, request: true },
        order: { respondedAt: 'DESC' },
        take: 30,
      }),
      this.alerts.find({ where: { farmerId }, order: { createdAt: 'DESC' }, take: 10 }),
    ]);

    const events: Array<{
      id: string;
      type: 'accepted' | 'cancelled' | 'completed' | 'expired' | 'availability';
      title: string;
      message: string;
      createdAt: string;
      requestId?: string;
      workerId?: string;
      from?: string;
      to?: string;
    }> = bookings.map((booking) => {
      const workerName = `${booking.worker.firstName} ${booking.worker.lastName}`.trim();
      const status = booking.status === 'confirmed' && booking.request.endDate < currentFarmDate()
        ? 'completed'
        : booking.status;
      const title = status === 'confirmed' ? `${workerName} accepted`
        : status === 'cancelled' ? `${workerName} cancelled`
          : `${workerName} finished the job`;
      const dates = booking.request.startDate === booking.request.endDate
        ? booking.request.startDate
        : `${booking.request.startDate} – ${booking.request.endDate}`;
      return {
        id: `booking:${booking.requestId}:${booking.workerId}`,
        type: status === 'confirmed' ? 'accepted' : status,
        title,
        message: `${booking.request.workType} · ${dates}`,
        createdAt: (booking.cancelledAt ?? booking.confirmedAt).toISOString(),
        requestId: booking.requestId,
        workerId: booking.workerId,
      };
    });

    for (const recipient of expiredRecipients) {
      const workerName = `${recipient.worker.firstName} ${recipient.worker.lastName}`.trim();
      events.push({
        id: `expired:${recipient.requestId}:${recipient.workerId}`,
        type: 'expired',
        title: `${workerName} did not reply`,
        message: 'Request expired after 6 hours',
        createdAt: (recipient.respondedAt ?? new Date()).toISOString(),
        requestId: recipient.requestId,
        workerId: recipient.workerId,
      });
    }

    for (const alert of savedSearches) {
      if (alert.to < currentFarmDate()) continue;
      const result = await this.findAll({
        from: alert.from,
        to: alert.to,
        latitude: alert.latitude === null ? undefined : String(alert.latitude),
        longitude: alert.longitude === null ? undefined : String(alert.longitude),
        maxDistanceKm: alert.maxDistanceKm === null ? undefined : String(alert.maxDistanceKm),
        minRating: alert.minRating === null ? undefined : String(alert.minRating),
        skill: alert.skill ?? undefined,
        query: alert.query ?? undefined,
        farmerId,
        workedWithMe: alert.workedWithMe,
      });
      events.push({
        id: `availability:${alert.id}`,
        type: 'availability',
        title: result.availableCount
          ? `${result.availableCount} ${result.availableCount === 1 ? 'worker is' : 'workers are'} free`
          : 'Waiting for available workers',
        message: `Your alert for ${alert.from} – ${alert.to}`,
        createdAt: alert.createdAt.toISOString(),
        from: alert.from,
        to: alert.to,
      });
    }

    return events.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 50);
  }

  async saveWorker(farmerId: string, workerId: string, input: SaveWorkerDto) {
    const [farmer, worker] = await Promise.all([
      this.users.findOne({ where: { id: farmerId } }),
      this.users.findOne({ where: { id: workerId } }),
    ]);
    if (!farmer || !farmer.roles.includes('farmer')) throw new NotFoundException('Farmer profile not found.');
    if (!worker || !worker.roles.includes('labour')) throw new NotFoundException('Worker profile not found.');
    if (farmerId === workerId) throw new BadRequestException('You cannot save your own profile as a worker.');
    const saved = await this.savedWorkers.findOne({ where: { farmerId, workerId } });
    await this.savedWorkers.save(this.savedWorkers.create({
      farmerId,
      workerId,
      notifyWhenAvailable: input.notifyWhenAvailable,
      ...(saved ? { createdAt: saved.createdAt } : {}),
    }));
    return { saved: true, workerId, notifyWhenAvailable: input.notifyWhenAvailable };
  }

  async findAll(input: WorkerSearchInput) {
    const from = parseDate(input.from, 'from');
    const to = parseDate(input.to, 'to');
    if ((from && !to) || (!from && to) || (from && to && to < from)) {
      throw new BadRequestException('Provide a valid availability date range.');
    }

    const requestedDates = from && to ? eachDate(from, to) : [];
    if (requestedDates.length > 31) throw new BadRequestException('Search a maximum of 31 days at a time.');

    const latitude = parseNumber(input.latitude, 'latitude', -90, 90);
    const longitude = parseNumber(input.longitude, 'longitude', -180, 180);
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException('Provide both latitude and longitude.');
    }
    const center = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
    const maxDistanceKm = parseNumber(input.maxDistanceKm, 'maxDistanceKm', 1, 500);
    if (maxDistanceKm !== undefined && !center) {
      throw new BadRequestException('Enable location to filter workers by distance.');
    }
    const minRating = parseNumber(input.minRating, 'minRating', 0, 5);
    const farmerId = input.farmerId?.trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (farmerId && !uuidPattern.test(farmerId)) throw new BadRequestException('farmerId must be a valid user ID.');
    if (input.workedWithMe && !farmerId) {
      throw new BadRequestException('A valid farmerId is required for work-history filtering.');
    }
    if (input.query && input.query.trim().length > 120) throw new BadRequestException('Search text must be 120 characters or fewer.');
    if (input.skill && input.skill.trim().length > 40) throw new BadRequestException('Skill must be 40 characters or fewer.');

    const workers = await this.users.createQueryBuilder('user')
      .where(':role = ANY(user.roles)', { role: 'labour' })
      .andWhere("user.firstName <> ''")
      .orderBy('user.firstName', 'ASC')
      .addOrderBy('user.lastName', 'ASC')
      .getMany();
    const workerIds = workers.map((worker) => worker.id);
    const activeBookings = workerIds.length
      ? await this.bookings.createQueryBuilder('booking')
        .innerJoin('booking.request', 'request')
        .select(['booking.workerId AS "workerId"', 'request.startDate AS "startDate"', 'request.endDate AS "endDate"'])
        .where('booking.workerId IN (:...workerIds)', { workerIds })
        .andWhere('booking.status = :status', { status: 'confirmed' })
        .andWhere('request.endDate >= :today', { today: currentFarmDate() })
        .getRawMany<{ workerId: string; startDate: string | Date; endDate: string | Date }>()
      : [];
    const bookedDatesByWorker = new Map<string, Set<string>>();
    for (const booking of activeBookings) {
      const dates = bookedDatesByWorker.get(booking.workerId) ?? new Set<string>();
      const startKey = dateKey(booking.startDate);
      const endKey = dateKey(booking.endDate);
      const start = new Date(`${startKey}T00:00:00.000Z`);
      const end = new Date(`${endKey}T00:00:00.000Z`);
      for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.add(date.toISOString().slice(0, 10));
      }
      bookedDatesByWorker.set(booking.workerId, dates);
    }
    const reviewRows = workerIds.length
      ? await this.reviews.createQueryBuilder('review')
        .select('review.workerId', 'workerId')
        .addSelect('AVG(review.rating)', 'averageRating')
        .addSelect('COUNT(review.id)', 'reviewCount')
        .where('review.workerId IN (:...workerIds)', { workerIds })
        .groupBy('review.workerId')
        .getRawMany<{ workerId: string; averageRating: string; reviewCount: string }>()
      : [];
    const reviewStats = new Map(reviewRows.map((row) => [row.workerId, {
      averageRating: Number(row.averageRating),
      reviewCount: Number(row.reviewCount),
    }]));
    const latestReviews = workerIds.length
      ? await this.reviews.createQueryBuilder('review')
        .innerJoin(User, 'farmer', 'farmer.id = review.farmerId')
        .select(['review.workerId AS "workerId"', 'review.rating AS rating', 'review.comment AS comment', 'review.createdAt AS "createdAt"', 'farmer.firstName AS "farmerName"'])
        .where('review.workerId IN (:...workerIds)', { workerIds })
        .orderBy('review.createdAt', 'DESC')
        .getRawMany<{ workerId: string; rating: number; comment: string; createdAt: Date; farmerName: string }>()
      : [];
    const reviewByWorker = new Map<string, typeof latestReviews[number]>();
    for (const review of latestReviews) {
      if (!reviewByWorker.has(review.workerId)) reviewByWorker.set(review.workerId, review);
    }
    const workedWithIds = input.workedWithMe && farmerId
      ? new Set(await this.reviews.createQueryBuilder('review')
        .select('DISTINCT review.workerId', 'workerId')
        .where('review.farmerId = :farmerId', { farmerId })
        .getRawMany<{ workerId: string }>().then((rows) => rows.map((row) => row.workerId)))
      : null;
    const workedWithCounts = farmerId && workerIds.length
      ? await this.reviews.createQueryBuilder('review')
        .select('review.workerId', 'workerId')
        .addSelect('COUNT(review.id)', 'count')
        .where('review.farmerId = :farmerId', { farmerId })
        .andWhere('review.workerId IN (:...workerIds)', { workerIds })
        .groupBy('review.workerId')
        .getRawMany<{ workerId: string; count: string }>()
      : [];
    const workedWithCountMap = new Map(workedWithCounts.map((row) => [row.workerId, Number(row.count)]));
    const groups = workerIds.length
      ? await this.labourGroups.find({ where: { leaderId: In(workerIds) } })
      : [];
    const groupsByLeader = new Map(groups.map((group) => [group.leaderId, group]));
    const allMatching = workers.flatMap((worker) => {
      const stats = reviewStats.get(worker.id) ?? { averageRating: null, reviewCount: 0 };
      if (minRating !== undefined && (stats.averageRating === null || stats.averageRating < minRating)) return [];
      if (input.skill && !worker.labourSkills.some((value) => value.toLocaleLowerCase() === input.skill?.trim().toLocaleLowerCase())) return [];
      if (input.query) {
        const search = input.query.trim().toLocaleLowerCase();
        if (search && !`${worker.firstName} ${worker.lastName} ${worker.labourArea} ${worker.labourSkills.join(' ')}`.toLocaleLowerCase().includes(search)) return [];
      }
      if (workedWithIds && !workedWithIds.has(worker.id)) return [];

      const distanceKm = center && worker.labourLatitude !== null && worker.labourLongitude !== null
        ? distanceInKm(center, { latitude: worker.labourLatitude, longitude: worker.labourLongitude })
        : null;
      if (maxDistanceKm !== undefined && (distanceKm === null || distanceKm > maxDistanceKm || (worker.labourTravelRadius !== null && distanceKm > worker.labourTravelRadius))) return [];

      const bookedDates = bookedDatesByWorker.get(worker.id) ?? new Set<string>();
      const availableDates = new Set(worker.labourAvailableDates.filter((date) =>
        !bookedDates.has(date) && (date !== currentFarmDate() || isSameDayAvailabilityOpen())));
      const freeDates = requestedDates.length
        ? requestedDates.filter((date) => availableDates.has(date) && !bookedDates.has(date))
        : [...availableDates];
      const availableForRange = requestedDates.length > 0 && freeDates.length === requestedDates.length;
      return [{
        id: worker.id,
        name: `${worker.firstName} ${worker.lastName}`.trim(),
        area: worker.labourArea,
        skills: worker.labourSkills,
        dailyRate: worker.labourDailyRate,
        travelRadius: worker.labourTravelRadius,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        available: requestedDates.length
          ? availableForRange
          : isSameDayAvailabilityOpen() && worker.labourAvailable && !bookedDates.has(currentFarmDate()),
        availableDates: [...availableDates],
        labourShift: worker.labourShift,
        groupName: groupsByLeader.get(worker.id)?.name ?? null,
        groupSize: (groupsByLeader.get(worker.id)?.memberNames.length ?? 0) + 1,
        rating: stats.averageRating === null ? null : Math.round(stats.averageRating * 10) / 10,
        reviewCount: stats.reviewCount,
        myReviewCount: workedWithCountMap.get(worker.id) ?? 0,
        latestReview: reviewByWorker.get(worker.id) ? {
          rating: Number(reviewByWorker.get(worker.id)?.rating),
          comment: reviewByWorker.get(worker.id)?.comment ?? '',
          farmerName: reviewByWorker.get(worker.id)?.farmerName ?? '',
          createdAt: reviewByWorker.get(worker.id)?.createdAt,
        } : null,
      }];
    });
    const ordered = allMatching.sort((left, right) => {
      if (left.available !== right.available) return Number(right.available) - Number(left.available);
      if (left.distanceKm !== null && right.distanceKm !== null && left.distanceKm !== right.distanceKm) return left.distanceKm - right.distanceKm;
      if (left.rating !== null && right.rating !== null && left.rating !== right.rating) return right.rating - left.rating;
      if (left.rating === null && right.rating !== null) return 1;
      if (left.rating !== null && right.rating === null) return -1;
      return left.name.localeCompare(right.name);
    });

    const suggestions: Array<{ date: string; workerCount: number }> = [];
    if (requestedDates.length) {
      const firstSuggestion = new Date(to as Date);
      firstSuggestion.setUTCDate(firstSuggestion.getUTCDate() + 1);
      for (let offset = 0; offset < 60 && suggestions.length < 3; offset += 1) {
        const date = new Date(firstSuggestion);
        date.setUTCDate(date.getUTCDate() + offset);
        const key = date.toISOString().slice(0, 10);
        const workerCount = allMatching.filter((worker) => worker.availableDates.includes(key)).length;
        if (workerCount) suggestions.push({ date: key, workerCount });
      }
    }

    const skills = [...new Set(workers.flatMap((worker) => worker.labourSkills.map((value) => value.trim()).filter(Boolean)))]
      .sort((left, right) => left.localeCompare(right));
    const bookedWorkerIds = requestedDates.length
      ? workers
        .filter((worker) => requestedDates.some((date) => bookedDatesByWorker.get(worker.id)?.has(date)))
        .map((worker) => worker.id)
      : [];
    const bookedWorkerIdSet = new Set(bookedWorkerIds);
    return {
      workers: ordered.filter((worker) => !bookedWorkerIdSet.has(worker.id)).slice(0, 100),
      total: ordered.length,
      availableCount: ordered.filter((worker) => worker.available).length,
      bookedWorkerIds,
      suggestions,
      skills,
    };
  }
}
