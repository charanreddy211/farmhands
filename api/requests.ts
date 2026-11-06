import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

export type CreateRequestInput = {
  title: string;
  workType: string;
  crop: string;
  farmLocationId?: string | null;
  area: string;
  startDate: string;
  endDate: string;
  peopleNeeded: number;
  payPerDay: number;
  farmerId: string;
  workerIds: string[];
  imageUrl?: string | null;
};

export type LabourRequest = CreateRequestInput & {
  id: string;
  status: 'open' | 'filled' | 'closed' | 'expired';
  createdAt: string;
  expiresAt: string;
  imageUrl: string | null;
  farmerId: string | null;
  workerIds: string[];
};

export type RequestOptions = {
  workTypes: string[];
  crops: string[];
  farms: Array<{ id: string; name: string; address: string; crop: string }>;
};

export type WorkerRequestBucket = 'new' | 'accepted' | 'past';
export type RequestDeclineReason = 'already_booked' | 'too_far' | 'pay_too_low' | 'not_available';
export type WorkerRequest = {
  request: Pick<LabourRequest, 'id' | 'title' | 'workType' | 'crop' | 'area' | 'startDate' | 'endDate' | 'peopleNeeded' | 'payPerDay' | 'status'>;
  responseStatus: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  declineReason: RequestDeclineReason | null;
  respondedAt: string | null;
  bookingStatus: 'confirmed' | 'cancelled' | 'completed' | null;
  expiresAt: string;
  farmer: { id: string; name: string; profileImageUrl: string | null } | null;
};

export type BookingBucket = 'upcoming' | 'pending' | 'past';
export type BookingCancellationReason = 'plans_changed' | 'found_another_worker' | 'dates_changed' | 'other';
export type BookingListItem = {
  type: 'booking' | 'request' | 'expired';
  request: Pick<LabourRequest, 'id' | 'title' | 'workType' | 'crop' | 'area' | 'farmLocationId' | 'startDate' | 'endDate' | 'peopleNeeded' | 'payPerDay' | 'status' | 'expiresAt'>;
  booking?: {
    requestId: string;
    workerId: string;
    status: 'confirmed' | 'cancelled' | 'completed';
    peopleCount?: number;
    confirmedAt: string;
    cancellationReason: BookingCancellationReason | null;
    cancelledAt: string | null;
  };
  responseStatus: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt?: string;
  worker: { id: string; name: string; profileImageUrl: string | null; area: string } | null;
  farmer: { id: string; name: string; profileImageUrl: string | null; area: string } | null;
};

export type BookingDetails = {
  request: BookingListItem['request'];
  booking: NonNullable<BookingListItem['booking']>;
  worker: NonNullable<BookingListItem['worker']> & { phone: string | null };
  farmer: NonNullable<BookingListItem['farmer']> & { phone: string | null; farmMapLink: string | null };
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchRequests(): Promise<LabourRequest[]> {
  const response = await fetch(`${API_URL}/requests`);
  return readResponse<LabourRequest[]>(response);
}

export async function fetchRequestOptions(farmerId: string): Promise<RequestOptions> {
  const response = await fetch(`${API_URL}/requests/options?farmerId=${encodeURIComponent(farmerId)}`);
  return readResponse<RequestOptions>(response);
}

export async function createRequest(input: CreateRequestInput): Promise<LabourRequest> {
  const response = await fetch(`${API_URL}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<LabourRequest>(response);
}

export async function fetchWorkerRequests(workerId: string, bucket: WorkerRequestBucket): Promise<WorkerRequest[]> {
  const response = await fetch(
    `${API_URL}/requests/worker/${encodeURIComponent(workerId)}?bucket=${bucket}`,
  );
  return readResponse<WorkerRequest[]>(response);
}

export async function respondToRequest(
  requestId: string,
  workerId: string,
  status: 'accepted' | 'declined',
  declineReason?: RequestDeclineReason,
): Promise<void> {
  const response = await fetch(`${API_URL}/requests/${encodeURIComponent(requestId)}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, status, declineReason }),
  });
  await readResponse<{ requestId: string; workerId: string; status: string }>(response);
}

export async function fetchBookings(userId: string, role: 'farmer' | 'labour', bucket: BookingBucket): Promise<BookingListItem[]> {
  const response = await fetch(
    `${API_URL}/requests/bookings/${encodeURIComponent(userId)}?role=${role}&bucket=${bucket}`,
  );
  return readResponse<BookingListItem[]>(response);
}

export async function fetchBookingDetails(requestId: string, workerId: string, userId: string): Promise<BookingDetails> {
  const response = await fetch(
    `${API_URL}/requests/bookings/${encodeURIComponent(requestId)}/${encodeURIComponent(workerId)}?userId=${encodeURIComponent(userId)}`,
  );
  return readResponse<BookingDetails>(response);
}

export async function cancelBooking(
  requestId: string,
  workerId: string,
  userId: string,
  reason: BookingCancellationReason,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/requests/bookings/${encodeURIComponent(requestId)}/${encodeURIComponent(workerId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason }),
    },
  );
  await readResponse<{ requestId: string; workerId: string; status: string }>(response);
}

export async function cancelRequest(
  requestId: string,
  userId: string,
  reason?: BookingCancellationReason,
): Promise<void> {
  const response = await fetch(`${API_URL}/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, reason }),
  });
  await readResponse<{ requestId: string; status: string }>(response);
}

export async function repeatRequest(requestId: string, farmerId: string, workerId: string): Promise<LabourRequest> {
  const response = await fetch(`${API_URL}/requests/${encodeURIComponent(requestId)}/repeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ farmerId, workerId }),
  });
  return readResponse<LabourRequest>(response);
}

export async function uploadRequestImage(asset: ImagePickerAsset): Promise<string> {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const image = await fetch(asset.uri).then((response) => response.blob());
    formData.append('file', image, asset.fileName ?? 'request-image.jpg');
  } else {
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName ?? 'request-image.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  }

  const response = await fetch(`${API_URL}/requests/image`, { method: 'POST', body: formData });
  const result = await readResponse<{ url: string }>(response);
  return new URL(result.url, API_URL).toString();
}
