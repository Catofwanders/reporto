import type { StandupSince } from '../src/types';

export function readStandup(options: {
  jiraSite: string | undefined;
  jiraEmail: string | undefined;
  jiraApiToken: string | undefined;
  jiraStatsJql?: string;
  githubAuthor: string;
  githubOrg: string;
  githubAccount?: string;
  now?: Date;
  /** `day` for the stand-up, `week` for the wrap a one-to-one wants. */
  span?: 'day' | 'week';
}): Promise<StandupSince>;

/**
 * `day`: Monday looks back to Friday, every other day to yesterday.
 * `week`: Monday of this week, except on Monday, where it is the week that just ended.
 */
export function windowStart(now?: Date, span?: 'day' | 'week'): Date;
