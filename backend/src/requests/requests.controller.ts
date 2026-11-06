import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { getImageExtension } from '../image-upload';
import { CreateRequestDto } from './dto/create-request.dto';
import { BookingBucket, BookingPartyRole, RequestsService, RequestStatus, workerRequestBuckets, WorkerRequestBucket } from './requests.service';
import { RespondToRequestDto } from './dto/respond-to-request.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RepeatRequestDto, RequestPartyDto } from './dto/request-party.dto';

function isWorkerRequestBucket(value: string): value is WorkerRequestBucket {
  return workerRequestBuckets.some((bucket) => bucket === value);
}

function isBookingBucket(value: string): value is BookingBucket {
  return value === 'upcoming' || value === 'pending' || value === 'past';
}

function isBookingPartyRole(value: string): value is BookingPartyRole {
  return value === 'farmer' || value === 'labour';
}

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll(@Query('status') status?: RequestStatus) {
    return this.requestsService.findAll(status);
  }

  @Get('options')
  getOptions(@Query('farmerId', new ParseUUIDPipe()) farmerId: string) {
    return this.requestsService.getOptions(farmerId);
  }

  @Get('bookings/:userId')
  listBookings(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query('role') role?: string,
    @Query('bucket') bucket?: string,
  ) {
    if (!role || !isBookingPartyRole(role)) throw new BadRequestException('Choose farmer or labour as the booking role.');
    const selectedBucket = bucket ?? 'upcoming';
    if (!isBookingBucket(selectedBucket)) throw new BadRequestException('Choose upcoming, pending, or past bookings.');
    return this.requestsService.listBookings(userId, role, selectedBucket);
  }

  @Get('bookings/:requestId/:workerId')
  bookingDetails(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
    @Query('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.requestsService.getBookingDetails(requestId, workerId, userId);
  }

  @Post('bookings/:requestId/:workerId/cancel')
  cancelBooking(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
    @Body() input: CancelBookingDto,
  ) {
    return this.requestsService.cancelBooking(requestId, workerId, input.userId, input.reason);
  }

  @Get('worker/:workerId')
  findForWorker(
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
    @Query('bucket') bucket?: string,
  ) {
    const selectedBucket = bucket ?? 'new';
    if (!isWorkerRequestBucket(selectedBucket)) {
      throw new BadRequestException('Choose new, accepted, or past requests.');
    }
    return this.requestsService.findForWorker(workerId, selectedBucket);
  }

  @Post()
  create(@Body() input: CreateRequestDto) {
    return this.requestsService.create(input);
  }

  @Post(':requestId/cancel')
  cancelRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() input: RequestPartyDto,
  ) {
    return this.requestsService.cancelRequest(requestId, input.userId, input.reason);
  }

  @Post(':requestId/repeat')
  repeatRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() input: RepeatRequestDto,
  ) {
    return this.requestsService.repeatRequest(requestId, input.farmerId, input.workerId);
  }

  @Post(':requestId/respond')
  respond(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() input: RespondToRequestDto,
  ) {
    return this.requestsService.respond(requestId, input.workerId, input.status, input.declineReason);
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    dest: join(__dirname, '..', '..', 'uploads', 'request-images'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      if (!getImageExtension(file.mimetype)) {
        callback(new BadRequestException('Upload a JPEG, PNG, WebP, or HEIC image.'), false);
        return;
      }
      callback(null, true);
    },
  }))
  async uploadRequestImage(@UploadedFile() file: { path: string; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Choose an image to upload.');
    const extension = getImageExtension(file.mimetype);
    if (!extension) throw new BadRequestException('Upload a JPEG, PNG, WebP, or HEIC image.');
    const fileName = `${randomUUID()}${extension}`;
    await rename(file.path, join(__dirname, '..', '..', 'uploads', 'request-images', fileName));
    return { url: `/uploads/request-images/${fileName}` };
  }
}
