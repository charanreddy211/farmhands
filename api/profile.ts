import { API_URL } from './requests';
import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

export type FarmLocation = {
  id: string;
  name: string;
  acres: number;
  crop: string;
  address: string;
  mapLink: string | null;
};

export type UserProfile = {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
  homeAddress: string;
  homeAddressMapLink: string | null;
  profileImageUrl: string | null;
  roles: Array<'farmer' | 'labour'>;
  preferredLanguage: 'en' | 'te';
  onboardingComplete: boolean;
  labourSkills: string[];
  labourArea: string;
  labourDailyRate: number | null;
  labourTravelRadius: number | null;
  labourLatitude: number | null;
  labourLongitude: number | null;
  labourLocationSet: boolean;
  labourAvailable: boolean;
  labourAvailableDates: string[];
  labourShift: 'morning' | 'full_day';
  farms: FarmLocation[];
  createdAt: string;
};

export type ProfileDetails = Pick<UserProfile, 'firstName' | 'lastName' | 'email' | 'homeAddress' | 'homeAddressMapLink' | 'profileImageUrl' | 'roles' | 'preferredLanguage' | 'onboardingComplete' | 'labourSkills' | 'labourArea' | 'labourDailyRate' | 'labourTravelRadius' | 'labourLatitude' | 'labourLongitude' | 'labourAvailable' | 'labourAvailableDates' | 'labourShift' | 'farms'>;
export type UpdateProfileInput = Partial<ProfileDetails>;

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const error = JSON.parse(body) as { message?: string | string[] };
      if (Array.isArray(error.message)) message = error.message.join(' ');
      else if (error.message) message = error.message;
    } catch {
      // Keep the raw response text when the server does not return JSON.
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}`);
  return readResponse<UserProfile>(response);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<UserProfile>(response);
}

export async function uploadProfileImage(userId: string, asset: ImagePickerAsset): Promise<string> {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const image = await fetch(asset.uri).then((response) => response.blob());
    formData.append('file', image, asset.fileName ?? 'profile-image.jpg');
  } else {
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName ?? 'profile-image.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  }

  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}/profile-image`, {
    method: 'POST',
    body: formData,
  });
  const result = await readResponse<{ url: string }>(response);
  return new URL(result.url, API_URL).toString();
}
