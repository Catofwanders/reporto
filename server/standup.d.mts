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
}): Promise<StandupSince>;

/** Monday looks back to Friday; every other day to yesterday. */
export function windowStart(now?: Date): Date;
