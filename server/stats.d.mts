import type { StatsReport } from '../src/types';

export function pullStats(options: {
  jiraSite: string | undefined;
  jiraEmail: string | undefined;
  jiraApiToken: string | undefined;
  /** JQL prefix every month query is built on; defaults to `assignee = currentUser()`. */
  jiraStatsJql?: string;
  /** Status names this site uses, when they differ from the defaults. */
  statsStatuses?: Partial<{
    releaseReady: string;
    deployed: string;
    qcReady: string;
    qcFailed: string;
    inProgress: string;
  }>;
  githubAuthor: string;
  githubOrg: string;
  githubAccount?: string;
  calendar?: {
    serviceAccount?: string;
    calendarIds?: string[];
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    include?: string[];
    exclude?: string[];
  };
  /** How many months the file carries, newest first. Defaults to 6. */
  months?: number;
  /** The previous stats report, so settled months are not recomputed. */
  previous?: StatsReport | null;
}): Promise<StatsReport>;
