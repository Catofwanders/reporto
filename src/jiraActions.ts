export interface JiraTransition {
  id: string;
  name: string;
  /** Status this transition lands in — what the reader actually cares about. */
  to: string;
}

const HEADERS = { 'Content-Type': 'application/json', 'X-Reporto-Write': '1' };

async function body<T>(res: Response): Promise<T> {
  // The dev server answers JSON on every path including errors; anything else means the
  // request never reached it (SPA fallback), which is worth saying plainly.
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error(`unexpected response (HTTP ${res.status}) — is the dev server running?`);
  }
  const parsed = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || parsed.ok === false) throw new Error(parsed.error ?? `HTTP ${res.status}`);
  return parsed;
}

/** What the workflow allows for this ticket right now. */
export async function fetchTransitions(key: string): Promise<JiraTransition[]> {
  const res = await fetch(`/api/jira/${key}/transitions`);
  return (await body<{ transitions: JiraTransition[] }>(res)).transitions;
}

export async function applyTransition(key: string, transitionId: string): Promise<void> {
  const res = await fetch(`/api/jira/${key}/transition`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ transitionId }),
  });
  await body(res);
}
