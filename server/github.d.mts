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

export interface PrStats {
  merged: number;
  opened: number;
  abandoned: number;
  reviewsGiven: number;
  byRepo: { repo: string; merged: number }[];
  /** Hours from open to the first review by somebody else, one entry per merged PR. */
  hoursToFirstReview: number[];
  /** Hours from open to merge, one entry per merged PR. */
  hoursToMerge: number[];
}

export function pullPrStats(options: {
  author: string;
  org: string;
  account?: string;
  /** Inclusive ISO dates bounding the month, e.g. "2026-08-01" and "2026-08-31". */
  from: string;
  to: string;
}): Promise<PrStats>;
