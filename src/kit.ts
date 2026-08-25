import type { KitReport } from './types';

/**
 * The commands and skills installed on this machine, read live from `~/.claude`.
 *
 * Not part of the report loader: there is no file on disk to load, and nothing to refresh
 * through the pull API — the dev server reads the directory when asked.
 */
export async function fetchKit(): Promise<KitReport> {
  const res = await fetch('/api/kit', { cache: 'no-store' });
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('no /api/kit — is the dev server running? A static build has no API.');
  }
  const body = (await res.json()) as KitReport & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
