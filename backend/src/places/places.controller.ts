import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('autocomplete')
  autocomplete(@Query('input') input: string) {
    return this.placesService.autocomplete(input);
  }

  @Get(':placeId')
  getPlace(@Param('placeId') placeId: string) {
    return this.placesService.getPlace(placeId);
  }
}
