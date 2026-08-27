import type { ReportKind } from './reportKinds';

export type Chip = 'bad' | 'warn' | 'ok' | 'na' | 'open' | 'qc' | 'qcout';

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
  /**
   * When the ticket entered its current status. Only set for the statuses configured as
   * worth aging, since each one costs a changelog request. Days are derived live rather than
   * stored: a report read tomorrow must not still claim "2 days".
   */
  statusSince?: string | null;
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
  /**
   * Written by the fast half of a two-phase pull: the board is complete, the slow parts are
   * not. Views render a skeleton for whatever `pending` names rather than an empty space,
   * which would read as "there are none".
   */
  partial?: boolean;
  pending?: ('prs' | 'aging')[];
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
  /**
   * Inline threads whose last word is somebody else's, on a hunk still in the diff — the
   * questions actually waiting on me. Not thread *resolution*: nobody here clicks resolve,
   * so that count only ever grows. Only set by the API puller.
   */
  unansweredThreads?: number;
  /** Last review submitted by somebody other than the author. Only set by the API puller. */
  lastReviewAt?: string | null;
  /**
   * Head branch name. It is the honest signal for "this work has no ticket on purpose": a
   * `chore/` or `hotfix/` branch says so, where a missing ticket key alone says nothing.
   */
  branch?: string | null;
  /** Tip commit of the branch, merge commits included. Only set by the API puller. */
  lastCommitAt?: string | null;
  /**
   * Newest commit after the last review that is work rather than a merge of the base
   * branch — the only kind that makes a PR wait on a reviewer again.
   */
  lastReworkAt?: string | null;
  /** Who wrote it: usually me, but colleagues do push to my branches. */
  lastReworkBy?: string | null;
  /** Something landed after the review, and all of it was the base branch coming in. */
  syncOnlySinceReview?: boolean;
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

/** Counts for one month. Any source that failed leaves its half null rather than zero. */
export interface StatsMonth {
  /** `2026-08`. */
  month: string;
  jira: {
    /*
     * Null where no status name is configured for that metric: the words a board uses for
     * these stages come from config (see rules/nda.md), and a metric nobody named is
     * unavailable rather than zero.
     */
    releaseReady: number | null;
    deployed: number | null;
    qcReady: number | null;
    qcFailed: number | null;
    created: number;
  } | null;
  cycle: {
    /** Median days from the last "in progress" transition to the configured release status. */
    releaseReadyDays: number | null;
    /** Tickets the median is built from — small samples are worth showing as such. */
    sampled: number;
  } | null;
  prs: {
    merged: number;
    opened: number;
    abandoned: number;
    reviewsGiven: number;
    byRepo: { repo: string; merged: number }[];
    medianHoursToFirstReview: number | null;
    medianHoursToMerge: number | null;
  } | null;
  meetings: { hours: number; count: number } | null;
  /** Per-source failures for this month, as readable sentences. */
  missing: string[];
}

export interface StatsReport {
  type: 'stats';
  date: string;
  generatedAt: string;
  /** Newest month first. */
  months: StatsMonth[];
  /** The status names the counts were built from, so the page can label them honestly. */
  statuses: Record<string, string>;
  notes: string[];
}

/** An open PR that is in my review queue — requested of me, or already reviewed by me. */
export interface ReviewPr {
  repo: string;
  num: number;
  title: string;
  url: string;
  author: string;
  /** Automation rather than a colleague: dependabot and friends. */
  bot: boolean;
  draft: boolean;
  ticket: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tip commit, for judging whether anything moved since I looked. */
  lastCommitAt: string | null;
  /** GitHub still lists me as a requested reviewer. */
  reviewRequested: boolean;
  reviewDecision: string | null;
  /** My latest review on it, if I have reviewed at all. */
  myReviewState: string | null;
  myReviewAt: string | null;
  myReviewCount: number;
  /** Anything landed after my last review, branch syncs included. */
  pushedSinceMyReview: boolean;
  /** Of those, the commits that are somebody's work rather than a merge of the base branch. */
  reworkCommits: number;
  /** Who authored the newest commit since my review, so a row can name a person. */
  reworkBy: string | null;
  reworkHeadline: string | null;
  /** Something landed, but all of it was the base branch being merged in. */
  syncOnlySinceMyReview: boolean;
  /** Threads I opened where mine is still the last word, and the hunk still stands. */
  myUnansweredThreads: number;
  size: { additions: number; deletions: number; files: number };
}

export interface ReviewsReport {
  type: 'reviews';
  date: string;
  generatedAt: string;
  reviewer: string;
  prs: ReviewPr[];
}

/**
 * One thing in Slack that has my name on it.
 *
 * `lastFromMe` is the whole point: unread state clears the moment a channel is glanced at,
 * so "waiting" is derived from the conversation instead — somebody addressed me, and the last
 * word since is not mine.
 */
export interface SlackRow {
  /** A channel mention, or a direct message — they wait differently and read differently. */
  kind: 'mention' | 'dm';
  /** channel id + timestamp: stable, and unique across channels. */
  id: string;
  /** Channel name, or the other person's handle for a direct message. */
  channel: string;
  channelId: string;
  permalink: string;
  from: string;
  fromId: string;
  bot: boolean;
  /** When the mention itself landed. */
  at: string;
  /** Set when the mention sits in a thread, which changes where a reply belongs. */
  threadTs: string | null;
  replies: number;
  lastFrom: string | null;
  lastFromMe: boolean;
  lastAt: string | null;
  /** First line, with Slack's markup flattened. */
  excerpt: string;
  /** Ticket keys named in the message — the hook the flow checks hang on. */
  tickets: string[];
  /** Pull requests named in it, as "repo#num". */
  prs: string[];
}

export interface SlackReport {
  type: 'slack';
  date: string;
  generatedAt: string;
  /** The handle the mentions were searched for. */
  me: string;
  /** How many days back the search went. */
  days: number;
  rows: SlackRow[];
}

/** A lane in a flow diagram: who or what performs a step. */
export interface FlowActor {
  id: string;
  label: string;
}

export interface FlowStep {
  id: string;
  /** Which actor's lane this step sits in. */
  actor: string;
  label: string;
  note?: string;
  /** Where it lives — a file path, an endpoint, a queue or handler name. */
  ref?: string;
}

/** One named path through a project: sign-in, checkout, a listing going live. */
export interface ProjectFlow {
  id: string;
  title: string;
  what: string;
  actors: FlowActor[];
  steps: FlowStep[];
  /** Where this was read from, so a reader can check it rather than trust it. */
  source?: string;
  /** False means nobody has confirmed it against the running system yet. */
  verified?: boolean;
}

/** One repository, as a card on the projects page. */
export interface ProjectCard {
  id: string;
  /** Repository name, as GitHub knows it. */
  name: string;
  /** What a human calls it. */
  title: string;
  /** One line: what it is for. */
  what: string;
  /** Stack facts worth seeing at a glance — framework, package manager, Node version. */
  stack: string[];
  /** client / service / cms / infra / tool — decides the card's accent. */
  role: string;
  /** Branch PRs are opened against, when it is not the default. */
  base?: string;
  url?: string;
  /** Ids of the projects this one depends on, drawn as edges. */
  consumes?: string[];
  /** The paths through it worth drawing, shown on the project's own page. */
  flows?: ProjectFlow[];
  /** Why there are no flows, when that is a fact rather than an omission. */
  flowsNote?: string;
  /** Diagrams that belong to this project alone — its domain model, its processes. */
  diagrams?: InfraSystem[];
  /** The briefing a newcomer needs: packages, processes, data, conventions. */
  architecture?: { sections: { title: string; note?: string; items: ArchFact[] }[] };
}

export interface WorkflowStage {
  id: string;
  label: string;
  /** What actually happens at this stage, in a few words. */
  note?: string;
  /** Jira statuses that count as this stage, for the live count. */
  statuses?: string[];
}

export interface InfraNode {
  id: string;
  label: string;
  note?: string;
  /** Which layer it sits in; the layer order comes from `layers`. */
  layer: string;
}

/** A fact worth knowing about a project, with where it was read from. */
export interface ArchFact {
  label: string;
  detail?: string;
  /** File, table, enum or symbol this came from. */
  ref?: string;
}

/**
 * One self-contained system: its own layers, nodes and edges.
 *
 * Separate systems get separate diagrams rather than separate colours in one, because a
 * single stack of layers implies everything in it shares them — which was wrong the first
 * time this was drawn, and is the kind of wrong nobody notices in a picture.
 */
export interface InfraSystem {
  id: string;
  title: string;
  note?: string;
  layers: string[];
  nodes: InfraNode[];
  edges: [string, string][];
  /** Rules the picture cannot carry — constraints, generated columns, enum values. */
  notes?: ArchFact[];
}

/** The hand-written map of the work: gitignored, because it names an employer's systems. */
export interface ProjectMap {
  projects: ProjectCard[];
  workflow: { stages: WorkflowStage[]; note?: string };
  infra: { note?: string; systems: InfraSystem[] };
}

/** What moved since the last working day, from the APIs rather than from a snapshot. */
export interface StandupSince {
  /** ISO date the window starts at. */
  since: string;
  generatedAt: string;
  moved: {
    key: string;
    from: string | null;
    to: string | null;
    /** How many transitions it made inside the window. */
    steps: number;
    at: string;
  }[];
  merged: { repo: string; num: number; title: string; url: string; mergedAt: string }[];
  /** Whatever a source could not answer, in readable sentences. */
  notes: string[];
}

/** One slash command or skill installed on this machine. */
export interface KitEntry {
  kind: 'command' | 'skill';
  /** What you type, without the leading slash. */
  name: string;
  source: 'personal' | 'project' | 'plugin';
  plugin: string | null;
  description: string;
  /** The command's own `argument-hint`, when it declares one. */
  argumentHint: string | null;
  tools: string[];
  model: string | null;
  /** Home-relative path, so the repo never carries an absolute one. */
  path: string;
  lines: number;
  modified: string;
}

export interface KitReport {
  generatedAt: string;
  entries: KitEntry[];
  plugins: {
    name: string;
    marketplace: string;
    version: string;
    commands: number;
    skills: number;
  }[];
}

/**
 * Keyed by report kind rather than spelled out: a new kind that the index forgot is a kind
 * whose file the loader cannot find, and that failure is silent.
 */
export interface ReportIndex {
  latest: Partial<Record<ReportKind, string>>;
  history: ({ date: string } & Partial<Record<ReportKind, string>>)[];
}
