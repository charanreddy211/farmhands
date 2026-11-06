import { Controller, Get, Param, ParseFloatPipe, Query } from '@nestjs/common';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('autocomplete')
  autocomplete(@Query('input') input: string) {
    return this.placesService.autocomplete(input);
  }

  @Get('reverse-geocode')
  reverseGeocode(
    @Query('latitude', ParseFloatPipe) latitude: number,
    @Query('longitude', ParseFloatPipe) longitude: number,
  ) {
    return this.placesService.reverseGeocode(latitude, longitude);
  }

  @Get(':placeId')
  getPlace(@Param('placeId') placeId: string) {
    return this.placesService.getPlace(placeId);
  }
}
