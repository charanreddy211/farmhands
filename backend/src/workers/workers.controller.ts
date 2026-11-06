import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CreateWorkerSearchAlertDto } from './dto/create-worker-search-alert.dto';
import { CreateWorkerReviewDto } from './dto/create-worker-review.dto';
import { SaveWorkerDto } from './dto/save-worker.dto';
import { WorkersService } from './workers.service';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Post('alerts')
  saveAlert(@Body() input: CreateWorkerSearchAlertDto) {
    return this.workersService.saveAlert(input);
  }

  @Get(':farmerId/alerts')
  listAlerts(@Param('farmerId', new ParseUUIDPipe()) farmerId: string) {
    return this.workersService.listAlerts(farmerId);
  }

  @Post('reviews')
  submitReview(@Body() input: CreateWorkerReviewDto) {
    return this.workersService.submitReview(input);
  }

  @Get('reviews/:requestId/:workerId')
  getBookingReview(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
    @Query('farmerId', new ParseUUIDPipe()) farmerId: string,
  ) {
    return this.workersService.getBookingReview(requestId, workerId, farmerId);
  }

  @Get(':farmerId/saved')
  listSavedWorkers(
    @Param('farmerId', new ParseUUIDPipe()) farmerId: string,
    @Query('freeToday') freeToday?: string,
  ) {
    if (freeToday !== undefined && freeToday !== 'true' && freeToday !== 'false') {
      throw new BadRequestException('freeToday must be true or false.');
    }
    return this.workersService.listSavedWorkers(farmerId, freeToday === 'true');
  }

  @Put(':farmerId/saved/:workerId')
  saveWorker(
    @Param('farmerId', new ParseUUIDPipe()) farmerId: string,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
    @Body() input: SaveWorkerDto,
  ) {
    return this.workersService.saveWorker(farmerId, workerId, input);
  }

  @Patch(':farmerId/saved/:workerId/alerts')
  updateSavedWorkerAlert(
    @Param('farmerId', new ParseUUIDPipe()) farmerId: string,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
    @Body() input: SaveWorkerDto,
  ) {
    return this.workersService.updateSavedWorkerAlert(farmerId, workerId, input);
  }

  @Delete(':farmerId/saved/:workerId')
  removeSavedWorker(
    @Param('farmerId', new ParseUUIDPipe()) farmerId: string,
    @Param('workerId', new ParseUUIDPipe()) workerId: string,
  ) {
    return this.workersService.removeSavedWorker(farmerId, workerId);
  }

  @Get()
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('maxDistanceKm') maxDistanceKm?: string,
    @Query('minRating') minRating?: string,
    @Query('skill') skill?: string,
    @Query('query') query?: string,
    @Query('farmerId') farmerId?: string,
    @Query('workedWithMe') workedWithMe?: string,
  ) {
    return this.workersService.findAll({
      from,
      to,
      latitude,
      longitude,
      maxDistanceKm,
      minRating,
      skill,
      query,
      farmerId,
      workedWithMe: workedWithMe === 'true',
    });
  }
}
