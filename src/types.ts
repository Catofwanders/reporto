export type Chip = 'bad' | 'warn' | 'ok' | 'na' | 'open' | 'qc' | 'qcout';

export interface EmailItem {
  chip: Chip;
  chipLabel: string;
  from: string;
  time: string;
  subject: string;
  mailUrl: string;
  refLabel?: string;
  refUrl?: string;
  note?: string;
  action: string | null;
}

export interface EmailSection {
  title: string;
  account: string;
  items: EmailItem[];
}

export interface EmailReport {
  type: 'email';
  date: string;
  generatedAt: string;
  sections: EmailSection[];
  filteredOut: string;
}

export interface Pr {
  repo: string;
  num: number;
  url: string;
  state: 'open' | 'merged' | 'closed';
  note?: string;
  /**
   * For merged PRs: is the merge commit still reachable from deploy-qc? false means a QC
   * branch reset dropped it. null / absent means unknown — no deploy-qc branch, or the
   * comparison could not be made.
   */
  inQc?: boolean | null;
}

export interface Ticket {
  key: string;
  url: string;
  status: string;
  chip: Chip;
  summary: string;
  prs: Pr[];
  notes: string[];
}

export interface TicketGroup {
  title: string;
  tickets: Ticket[];
}

export interface JiraReport {
  type: 'jira';
  date: string;
  generatedAt: string;
  banner?: { tone: Chip; text: string };
  groups: TicketGroup[];
  restNote?: string;
  footer?: string;
}

export interface CalendarEvent {
  source: 'google' | 'outlook' | 'gmail';
  calendar: string;
  title: string;
  kind: 'meeting' | 'kickoff' | 'all-day' | 'activity';
  start: string | null;
  end: string | null;
  url?: string;
  note?: string;
}

export interface CalendarReport {
  type: 'calendar';
  date: string;
  generatedAt: string;
  events: CalendarEvent[];
  upcoming: CalendarEvent[];
  summary: string;
}

export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED'
  | 'COMMENTED'
  | 'NONE';

/** deploy-qc containment for a PR head, as reported by GitHub's ref comparison. */
export interface DeployQcState {
  status: 'IDENTICAL' | 'BEHIND' | 'AHEAD' | 'DIVERGED';
  /** Commits on the PR head that deploy-qc has not got. Zero means it is deployed there. */
  aheadBy: number;
  /** Commits deploy-qc has that the PR head has not. */
  behindBy: number;
}

export interface OpenPr {
  num: number;
  title: string;
  url: string;
  ticket: string | null;
  ticketUrl: string | null;
  review: ReviewDecision;
  draft: boolean;
  updatedAt: string;
  /** Unresolved inline review threads. Only set by the API puller. */
  unresolvedThreads?: number;
  /** Last review submitted by somebody other than the author. Only set by the API puller. */
  lastReviewAt?: string | null;
  /** Tip commit of the branch. Only set by the API puller. */
  lastCommitAt?: string | null;
  /** null when the repo has no deploy-qc branch, or the comparison could not be made. */
  deployQc?: DeployQcState | null;
}

export interface PrRepoGroup {
  repo: string;
  prs: OpenPr[];
}

export interface PrsReport {
  type: 'prs';
  date: string;
  generatedAt: string;
  author: string;
  repos: PrRepoGroup[];
}

export interface ReportIndex {
  latest: { email?: string; jira?: string; calendar?: string; prs?: string };
  history: { date: string; email?: string; jira?: string; calendar?: string; prs?: string }[];
}
