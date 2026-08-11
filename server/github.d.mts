import type { PrsReport } from '../src/types';

export function pullOpenPrs(options: {
  author: string;
  org: string;
  jiraBrowseUrl: string;
  account?: string;
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
