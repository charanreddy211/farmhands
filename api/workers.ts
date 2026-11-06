import { API_URL } from './requests';

export type WorkerProfile = {
  id: string;
  name: string;
  groupName?: string | null;
  groupSize?: number;
  area: string;
  skills: string[];
  dailyRate: number | null;
  travelRadius: number | null;
  distanceKm: number | null;
  available: boolean;
  availableDates: string[];
  labourShift: 'morning' | 'full_day';
  rating: number | null;
  reviewCount: number;
  myReviewCount: number;
  latestReview: {
    rating: number;
    comment: string;
    farmerName: string;
    createdAt: string;
  } | null;
};

export type WorkerSearchParams = {
  from: string;
  to: string;
  latitude?: number;
  longitude?: number;
  maxDistanceKm?: number | null;
  minRating?: number | null;
  skill?: string | null;
  query?: string;
  farmerId?: string;
  workedWithMe?: boolean;
};

export type WorkerSearchResponse = {
  workers: WorkerProfile[];
  total: number;
  availableCount: number;
  bookedWorkerIds: string[];
  suggestions: Array<{ date: string; workerCount: number }>;
  skills: string[];
};

export type WorkerAttendanceStatus = 'all_attended' | 'fewer_attended' | 'nobody_showed' | 'came_late' | 'everything_fine';
export type WorkerReviewTag = 'on_time' | 'hard_working' | 'careful' | 'good_with_tools';

export type WorkerReviewInput = {
  requestId: string;
  workerId: string;
  farmerId: string;
  rating: number;
  attendanceStatus: WorkerAttendanceStatus;
  peopleAttended: number;
  comment?: string;
  tags: WorkerReviewTag[];
  saveWorker: boolean;
};

export type BookingWorkerReview = {
  canRate: boolean;
  review: {
    id: string;
    rating: number;
    attendanceStatus: WorkerAttendanceStatus | null;
    peopleNeeded: number | null;
    peopleAttended: number | null;
    tags: WorkerReviewTag[];
    createdAt: string;
  } | null;
};

export type SavedWorkerProfile = WorkerProfile & {
  profileImageUrl: string | null;
  saved: boolean;
  notifyWhenAvailable: boolean;
  bookedThrough: string | null;
  lastWorkedAt: string | null;
};

export type FarmerAlert = {
  id: string;
  type: 'accepted' | 'cancelled' | 'completed' | 'expired' | 'availability';
  title: string;
  message: string;
  createdAt: string;
  requestId?: string;
  workerId?: string;
  from?: string;
  to?: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchWorkers(params: WorkerSearchParams): Promise<WorkerSearchResponse> {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    ...(params.latitude !== undefined ? { latitude: String(params.latitude) } : {}),
    ...(params.longitude !== undefined ? { longitude: String(params.longitude) } : {}),
    ...(params.maxDistanceKm ? { maxDistanceKm: String(params.maxDistanceKm) } : {}),
    ...(params.minRating ? { minRating: String(params.minRating) } : {}),
    ...(params.skill ? { skill: params.skill } : {}),
    ...(params.query?.trim() ? { query: params.query.trim() } : {}),
    ...(params.farmerId ? { farmerId: params.farmerId } : {}),
    ...(params.workedWithMe ? { workedWithMe: 'true' } : {}),
  });
  const response = await fetch(`${API_URL}/workers?${query}`);
  return readResponse<WorkerSearchResponse>(response);
}

export async function saveWorkerSearchAlert(params: WorkerSearchParams & { farmerId: string }): Promise<void> {
  const response = await fetch(`${API_URL}/workers/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  await readResponse<{ saved: boolean }>(response);
}

export async function fetchBookingWorkerReview(
  requestId: string,
  workerId: string,
  farmerId: string,
): Promise<BookingWorkerReview> {
  const query = new URLSearchParams({ farmerId });
  const response = await fetch(
    `${API_URL}/workers/reviews/${encodeURIComponent(requestId)}/${encodeURIComponent(workerId)}?${query}`,
  );
  return readResponse<BookingWorkerReview>(response);
}

export async function submitWorkerReview(input: WorkerReviewInput): Promise<{ id: string; saved: boolean }> {
  const response = await fetch(`${API_URL}/workers/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<{ id: string; saved: boolean }>(response);
}

export async function fetchSavedWorkers(farmerId: string, freeToday = false): Promise<SavedWorkerProfile[]> {
  const query = freeToday ? '?freeToday=true' : '';
  const response = await fetch(`${API_URL}/workers/${encodeURIComponent(farmerId)}/saved${query}`);
  return readResponse<SavedWorkerProfile[]>(response);
}

export async function saveWorker(
  farmerId: string,
  workerId: string,
  notifyWhenAvailable = false,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/workers/${encodeURIComponent(farmerId)}/saved/${encodeURIComponent(workerId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyWhenAvailable }),
    },
  );
  await readResponse<{ saved: boolean; workerId: string }>(response);
}

export async function setWorkerAvailabilityAlert(
  farmerId: string,
  workerId: string,
  notifyWhenAvailable: boolean,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/workers/${encodeURIComponent(farmerId)}/saved/${encodeURIComponent(workerId)}/alerts`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyWhenAvailable }),
    },
  );
  await readResponse<{ workerId: string; notifyWhenAvailable: boolean }>(response);
}

export async function removeSavedWorker(farmerId: string, workerId: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/workers/${encodeURIComponent(farmerId)}/saved/${encodeURIComponent(workerId)}`,
    { method: 'DELETE' },
  );
  await readResponse<{ saved: boolean; workerId: string }>(response);
}

export async function fetchFarmerAlerts(farmerId: string): Promise<FarmerAlert[]> {
  const response = await fetch(`${API_URL}/workers/${encodeURIComponent(farmerId)}/alerts`);
  return readResponse<FarmerAlert[]>(response);
}
