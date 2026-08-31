/**
 * One ticket in full, read from the dev server when a drawer opens.
 *
 * Not part of the report loader: there is no file on disk for this and nothing to refresh —
 * a board card knows the key, and the detail is fetched the moment somebody asks to read it.
 * A production build has no API, which is why every caller has to handle the failure.
 */
import { fetchWithTimeout } from './apiFetch';

/** An Atlassian Document Format node, as Jira returns it. */
export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export interface TicketPerson {
  name: string | null;
  avatar: string | null;
}

export interface TicketComment {
  id: string;
  author: TicketPerson | null;
  at: string | null;
  body: AdfNode | null;
}

export interface TicketDetail {
  key: string;
  url: string;
  summary: string;
  status: string;
  chip: 'ok' | 'open' | 'bad' | 'na';
  type: string | null;
  priority: string | null;
  assignee: TicketPerson | null;
  reporter: TicketPerson | null;
  created: string | null;
  updated: string | null;
  labels: string[];
  parent: { key: string; summary: string } | null;
  description: AdfNode | null;
  comments: TicketComment[];
}

export async function fetchTicketDetail(key: string): Promise<TicketDetail> {
  const res = await fetchWithTimeout(`/api/jira/${encodeURIComponent(key)}`, {
    cache: 'no-store',
  });
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('no /api/jira — is the dev server running? A static build has no API.');
  }
  const body = (await res.json()) as { ok?: boolean; ticket?: TicketDetail; error?: string };
  if (!res.ok || !body.ok || !body.ticket) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.ticket;
}
