import type { Pr, PrsReport } from '../src/types';

export function pullOpenPrs(options: {
  author: string;
  org: string;
  jiraBrowseUrl: string;
  account?: string;
  /** Repo names to sort ahead of the busiest-first order, in the order given. */
  pinnedRepos?: string[];
}): Promise<PrsReport>;

export type PrActionName = 'ready' | 'draft' | 'close' | 'reopen';

export const PR_ACTIONS: readonly PrActionName[];

export function prAction(options: {
  owner: string;
  repo: string;
  num: number;
  action: PrActionName;
  account?: string;
}): Promise<{ repo: string; num: number; changed: boolean; isDraft?: boolean; state?: string }>;

export function pullTicketPrs(options: {
  author: string;
  org: string;
  /** Regex source matching a ticket key in a PR title, e.g. "\\bDTP-\\d+\\b". */
  ticketPattern: string;
  account?: string;
  /** Ticket keys worth one body search each when no PR title named them. */
  fallbackKeys?: string[];
}): Promise<Map<string, Pr[]>>;
