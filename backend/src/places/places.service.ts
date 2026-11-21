import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type PlacePrediction = {
  placeId: string;
  text: string;
};

type PlaceDetails = {
  address: string;
  area?: string;
  mapLink: string;
  latitude: number;
  longitude: number;
};

type ReverseGeocodeResult = PlaceDetails;
export type Coordinates = { latitude: number; longitude: number };

type RouteMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  condition?: 'ROUTE_EXISTS' | 'ROUTE_NOT_FOUND';
  status?: { code?: number; message?: string };
};

@Injectable()
export class PlacesService {
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY;
  private readonly routeMatrixUrl = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
  private readonly drivingDistanceCache = new Map<string, { distanceKm: number | null; expiresAt: number }>();

  async autocomplete(input: string): Promise<PlacePrediction[]> {
    if (!input?.trim()) return [];
    if (input.length > 200) throw new BadGatewayException('Search text is too long.');
    const response = await this.googleRequest('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' },
      body: JSON.stringify({ input: input.trim() }),
    });
    const result = await response.json() as {
      suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
    };
    return (result.suggestions ?? []).flatMap(({ placePrediction }) => {
      const placeId = placePrediction?.placeId;
      const text = placePrediction?.text?.text;
      return placeId && text ? [{ placeId, text }] : [];
    });
  }

  async getPlace(placeId: string): Promise<PlaceDetails> {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(placeId)) throw new BadGatewayException('Invalid place selection.');
    const response = await this.googleRequest(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      method: 'GET',
      headers: { 'X-Goog-FieldMask': 'formattedAddress,googleMapsUri,location' },
    });
    const result = await response.json() as {
      formattedAddress?: string;
      googleMapsUri?: string;
      location?: { latitude?: number; longitude?: number };
    };
    if (!result.formattedAddress || !result.googleMapsUri
      || result.location?.latitude === undefined || result.location.longitude === undefined) {
      throw new BadGatewayException('Google Places did not return an address, map link, and coordinates.');
    }
    return {
      address: result.formattedAddress,
      mapLink: result.googleMapsUri,
      latitude: result.location.latitude,
      longitude: result.location.longitude,
    };
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('A valid latitude and longitude are required.');
    }
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Google Geocoding is not configured. Set GOOGLE_MAPS_API_KEY on the backend.');
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${latitude},${longitude}`);
    url.searchParams.set('key', this.apiKey);
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException(`Google Geocoding request failed (${response.status}).`);
    }

    const result = await response.json() as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        place_id?: string;
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    };
    const match = result.results?.[0];
    if (result.status !== 'OK' || !match?.formatted_address) {
      throw new BadGatewayException('Google Geocoding could not find an area name for this location.');
    }

    const query = match.place_id ? `place_id:${match.place_id}` : `${latitude},${longitude}`;
    const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    const areaTypes = ['locality', 'sublocality_level_1', 'administrative_area_level_3', 'administrative_area_level_2'];
    const area = areaTypes
      .map((type) => match.address_components?.find((component) => component.types?.includes(type))?.long_name)
      .find((value): value is string => Boolean(value?.trim()));
    return { address: match.formatted_address, area: area ?? match.formatted_address.split(',')[0].trim(), mapLink, latitude, longitude };
  }

  async drivingDistances(origin: Coordinates, destinations: Coordinates[]): Promise<Array<number | null>> {
    if (!destinations.length) return [];
    for (const point of [origin, ...destinations]) {
      if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
        || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
        throw new BadRequestException('Valid coordinates are required for road distance calculations.');
      }
    }
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Google Routes is not configured. Set GOOGLE_MAPS_API_KEY on the backend.');
    }

    const distances: Array<number | null> = Array(destinations.length).fill(null);
    const pendingByKey = new Map<string, { indexes: number[]; destination: Coordinates }>();
    destinations.forEach((destination, index) => {
      const key = `${origin.latitude},${origin.longitude}>${destination.latitude},${destination.longitude}`;
      const cached = this.drivingDistanceCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        distances[index] = cached.distanceKm;
        return;
      }
      if (cached) this.drivingDistanceCache.delete(key);
      const pending = pendingByKey.get(key);
      if (pending) pending.indexes.push(index);
      else pendingByKey.set(key, { indexes: [index], destination });
    });
    const uncached = [...pendingByKey.entries()].map(([key, value]) => ({ key, ...value }));
    const batchSize = 625;
    for (let start = 0; start < uncached.length; start += batchSize) {
      const batch = uncached.slice(start, start + batchSize);
      const response = await fetch(this.routeMatrixUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,condition,status',
        },
        body: JSON.stringify({
          origins: [{ waypoint: { location: { latLng: origin } } }],
          destinations: batch.map(({ destination }) => ({ waypoint: { location: { latLng: destination } } })),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new BadGatewayException(`Google Routes request failed (${response.status}): ${body}`);
      }

      const elements = await response.json() as RouteMatrixElement[];
      if (!Array.isArray(elements) || elements.length !== batch.length) {
        throw new BadGatewayException('Google Routes returned an incomplete distance matrix.');
      }
      const batchDistances: Array<number | null> = Array(batch.length).fill(null);
      const seenIndexes = new Set<number>();
      for (const element of elements) {
        const index = element.destinationIndex;
        if (element.originIndex !== 0 || typeof index !== 'number'
          || !Number.isInteger(index) || index < 0 || index >= batch.length) {
          throw new BadGatewayException('Google Routes returned an invalid distance matrix.');
        }
        if (seenIndexes.has(index)) throw new BadGatewayException('Google Routes returned a duplicate distance result.');
        seenIndexes.add(index);
        if (element.condition === 'ROUTE_NOT_FOUND') continue;
        if (element.status?.code && element.status.code !== 0) {
          throw new BadGatewayException(`Google Routes could not calculate a distance: ${element.status.message ?? 'unknown route error'}`);
        }
        if (element.condition === 'ROUTE_EXISTS' && typeof element.distanceMeters === 'number'
          && Number.isFinite(element.distanceMeters) && element.distanceMeters >= 0) {
          batchDistances[index] = element.distanceMeters / 1000;
        } else {
          throw new BadGatewayException('Google Routes returned an invalid route result.');
        }
      }
      if (seenIndexes.size !== batch.length) {
        throw new BadGatewayException('Google Routes returned an incomplete distance matrix.');
      }
      for (let index = 0; index < batch.length; index += 1) {
        const { indexes, key } = batch[index];
        const distanceKm = batchDistances[index];
        for (const destinationIndex of indexes) distances[destinationIndex] = distanceKm;
        this.drivingDistanceCache.set(key, { distanceKm, expiresAt: Date.now() + 60 * 60 * 1000 });
      }
      while (this.drivingDistanceCache.size > 10000) {
        const oldestKey = this.drivingDistanceCache.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        this.drivingDistanceCache.delete(oldestKey);
      }
    }
    return distances;
  }

  private async googleRequest(url: string, init: RequestInit): Promise<Response> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Google Places is not configured. Set GOOGLE_MAPS_API_KEY on the backend.');
    }
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, 'X-Goog-Api-Key': this.apiKey },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new BadGatewayException(`Google Places request failed (${response.status}): ${body}`);
    }
    return response;
  }
}
