import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type PlacePrediction = {
  placeId: string;
  text: string;
};

type PlaceDetails = {
  address: string;
  mapLink: string;
};

type ReverseGeocodeResult = PlaceDetails;

@Injectable()
export class PlacesService {
  private readonly apiKey = process.env.GOOGLE_MAPS_API_KEY;

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
      headers: { 'X-Goog-FieldMask': 'formattedAddress,googleMapsUri' },
    });
    const result = await response.json() as { formattedAddress?: string; googleMapsUri?: string };
    if (!result.formattedAddress || !result.googleMapsUri) {
      throw new BadGatewayException('Google Places did not return an address and map link.');
    }
    return { address: result.formattedAddress, mapLink: result.googleMapsUri };
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
      results?: Array<{ formatted_address?: string; place_id?: string }>;
    };
    const match = result.results?.[0];
    if (result.status !== 'OK' || !match?.formatted_address) {
      throw new BadGatewayException('Google Geocoding could not find an area name for this location.');
    }

    const query = match.place_id ? `place_id:${match.place_id}` : `${latitude},${longitude}`;
    const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    return { address: match.formatted_address, mapLink };
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
