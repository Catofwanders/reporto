import type { StandupSince } from './types';
import { fetchWithTimeout } from './apiFetch';

export type StandupSpan = 'day' | 'week';

/**
 * What moved since the last working day, or since Monday. Dev-server only; a static build has
 * no API.
 */
export async function fetchStandupSince(span: StandupSpan = 'day'): Promise<StandupSince> {
  const res = await fetchWithTimeout(`/api/standup?span=${span}`, { cache: 'no-store' });
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('no /api/standup — is the dev server running?');
  }
  const body = (await res.json()) as StandupSince & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
