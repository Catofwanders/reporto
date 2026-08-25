import type { StandupSince } from './types';

/** What moved since the last working day. Dev-server only; a static build has no API. */
export async function fetchStandupSince(): Promise<StandupSince> {
  const res = await fetch('/api/standup', { cache: 'no-store' });
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('no /api/standup — is the dev server running?');
  }
  const body = (await res.json()) as StandupSince & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
