import { API_URL } from './requests';

export type LabourGroup = {
  leaderId: string;
  name: string;
  memberNames: string[];
  size: number;
  updatedAt: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const error = JSON.parse(body) as { message?: string | string[] };
      message = Array.isArray(error.message) ? error.message.join(' ') : error.message ?? body;
    } catch {
      // Preserve the server response when it is not JSON.
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchLabourGroup(leaderId: string): Promise<LabourGroup | null> {
  const response = await fetch(`${API_URL}/groups/${encodeURIComponent(leaderId)}`);
  return readResponse<LabourGroup | null>(response);
}

export async function saveLabourGroup(leaderId: string, input: Pick<LabourGroup, 'name' | 'memberNames'>): Promise<LabourGroup> {
  const response = await fetch(`${API_URL}/groups/${encodeURIComponent(leaderId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse<LabourGroup>(response);
}
