import { API_URL } from './requests';

export type PlacePrediction = {
  placeId: string;
  text: string;
};

export type PlaceDetails = {
  address: string;
  mapLink: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function autocompletePlaces(input: string, signal?: AbortSignal): Promise<PlacePrediction[]> {
  const response = await fetch(`${API_URL}/places/autocomplete?input=${encodeURIComponent(input)}`, { signal });
  return readResponse<PlacePrediction[]>(response);
}

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const response = await fetch(`${API_URL}/places/${encodeURIComponent(placeId)}`);
  return readResponse<PlaceDetails>(response);
}

export async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<PlaceDetails> {
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  const response = await fetch(`${API_URL}/places/reverse-geocode?${query}`);
  return readResponse<PlaceDetails>(response);
}
