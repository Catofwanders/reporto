export type PrActionName = 'ready' | 'draft' | 'close' | 'reopen';

export interface PrActionResult {
  ok: boolean;
  changed?: boolean;
  isDraft?: boolean;
  state?: string;
  error?: string;
}

/**
 * Flips one pull request's state through the dev server. The action is chosen from a fixed
 * set server-side; this only names which one.
 */
export async function runPrAction(
  repo: string,
  num: number,
  action: PrActionName,
): Promise<PrActionResult> {
  const res = await fetch(`/api/pr/${repo}/${num}/${action}`, {
    method: 'POST',
    headers: { 'X-Reporto-Write': '1' },
  });
  const body = (await res.json()) as PrActionResult;
  if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
