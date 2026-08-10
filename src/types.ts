export type Chip = 'bad' | 'warn' | 'ok' | 'na' | 'open';

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
  inQc: boolean | null;
  note?: string;
}

export interface Ticket {
  key: string;
  url: string;
  status: string;
  chip: Chip;
  summary: string;
  prs: Pr[];
  qc: string;
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

export interface OpenPr {
  num: number;
  title: string;
  url: string;
  ticket: string | null;
  ticketUrl: string | null;
  review: ReviewDecision;
  draft: boolean;
  updatedAt: string;
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
