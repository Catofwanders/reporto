import type { PrsReport } from '../src/types';

export function pullOpenPrs(options: {
  author: string;
  org: string;
  jiraBrowseUrl: string;
  account?: string;
}): Promise<PrsReport>;
