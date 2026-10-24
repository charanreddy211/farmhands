export type CreateRequestInput = {
  title: string;
  area: string;
  startDate: string;
  endDate: string;
  peopleNeeded: number;
  payPerDay: number;
};

export type LabourRequest = CreateRequestInput & {
  id: string;
  status: 'open' | 'filled' | 'closed';
  createdAt: string;
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

export async function createRequest(input: CreateRequestInput): Promise<LabourRequest> {
  const response = await fetch(`${API_URL}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<LabourRequest>(response);
}
