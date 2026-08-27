export interface CommandGroup {
  command: string;
  writes: string[];
  tools: 'jira';
}

export interface ReportoConfig {
  githubOrg?: string;
  /** GitHub login whose PRs the dashboard reports on. */
  githubAuthor?: string;
  /** gh keyring account to pin — org repos 404 under the wrong active account. */
  githubAccount?: string;
  /** e.g. https://your-site.atlassian.net/browse — used to link tickets. */
  jiraBrowseUrl?: string;
  /** Repo names pinned to the top of the open-PR list, in the order given. */
  pinnedRepos?: string[];
  /** Jira site root, e.g. https://your-site.atlassian.net */
  jiraSite?: string;
  /** JQL for the tickets the dashboard should show. */
  jiraJql?: string;
  /** Regex source matching a ticket key in a PR title. */
  ticketPattern?: string;
  /** Statuses worth one extra PR body search when no PR title named the ticket. */
  fallbackStatuses?: string[];
  /** Calendar addresses to read. A service account needs these; it cannot enumerate. */
  calendarIds?: string[];
  /** Calendar names to pull; empty means every calendar the account can read. */
  calendars?: string[];
  /** Calendar names to skip — birthdays, holidays, anything that is noise. */
  calendarsExcluded?: string[];
  /** How far the calendar watch-list looks ahead. */
  upcomingDays?: number;
  /** Statuses the dashboard offers when changing a ticket. Empty means the whole workflow. */
  statusChoices?: string[];
  /** JQL prefix the monthly statistics are built on. */
  jiraStatsJql?: string;
  /** Status names the statistics count transitions into. */
  statsStatuses?: {
    releaseReady?: string;
    deployed?: string;
    qcReady?: string;
    qcFailed?: string;
    inProgress?: string;
  };
  /** How far back the Slack mention search goes. */
  slackDays?: number;
  /** Channel names whose mentions are noise — announcements, alert feeds. */
  slackChannelsExcluded?: string[];
  /** Where the stand-up note posts. A name or an id; the browser never names a channel. */
  slackStandupChannel?: string;
  /**
   * Days a ticket may sit in a status before the board says so, per status name, plus an
   * optional `default`. Only the statuses named here cost a changelog read.
   */
  statusAging?: Record<string, number>;
  /** How many months the statistics report carries, newest first. */
  statsMonths?: number;
  commandGroups: CommandGroup[];
}

export function loadConfig(): ReportoConfig;

/** Lifts .env into process.env for a plain `node` run; Vite does this itself. */
export function loadDotEnv(): void;

export function readReport(kind: string): unknown;

export const PULLABLE: string[];

export function pullReport(
  kind: string,
  config?: ReportoConfig,
  /** `phase: 'fast'` asks the Jira puller for the board alone, PRs and ages left for later. */
  options?: { phase?: 'fast' | 'full' },
): Promise<{ kind: string; file: string; date: string; durationMs: number }>;
