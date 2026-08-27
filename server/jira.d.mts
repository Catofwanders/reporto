import type { JiraReport, Pr } from '../src/types';

export function pullJira(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  jql: string;
  jiraBrowseUrl?: string;
  /** Given every ticket found, return ticket key → the PRs implementing it. */
  resolvePrs?: (tickets: { key: string; status: string }[]) => Promise<Map<string, Pr[]>>;
  /** Status names per chip tone, from config: the board's vocabulary is not committed here. */
  tones?: Record<string, string[]>;
}): Promise<JiraReport>;

export interface JiraTransition {
  id: string;
  name: string;
  /** Status this transition lands in. */
  to: string;
}

export function jiraTransitions(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  key: string;
  /** Target statuses to offer. Empty means the whole workflow. */
  allow?: string[];
}): Promise<JiraTransition[]>;

export function jiraTransition(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  key: string;
  transitionId: string;
  /** Same allow-list the menu was built from; the id is rejected if it is not in it. */
  allow?: string[];
}): Promise<{ key: string; transitionId: string }>;

export function jiraSearchKeys(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  jql: string;
}): Promise<string[]>;

export interface JiraStatusChange {
  /** ISO timestamp of the transition. */
  at: string;
  from: string | null;
  to: string | null;
}

export function jiraStatusHistory(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  key: string;
}): Promise<JiraStatusChange[]>;

/** An Atlassian Document Format node, as Jira returns it. Rendered client-side. */
export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export interface JiraPerson {
  name: string | null;
  avatar: string | null;
}

export interface JiraComment {
  id: string;
  author: JiraPerson | null;
  at: string | null;
  body: AdfNode | null;
}

export interface JiraIssueDetail {
  key: string;
  url: string;
  summary: string;
  status: string;
  chip: 'ok' | 'open' | 'bad' | 'na';
  type: string | null;
  priority: string | null;
  assignee: JiraPerson | null;
  reporter: JiraPerson | null;
  created: string | null;
  updated: string | null;
  labels: string[];
  parent: { key: string; summary: string } | null;
  description: AdfNode | null;
  comments: JiraComment[];
}

export function jiraIssueDetail(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  key: string;
  /** How many comments, newest first. Clamped to 1–20. */
  comments?: number;
  /** Base for the browse link, when the site is reached through a different host. */
  browseUrl?: string;
  /** Status names per chip tone, from config. */
  tones?: Record<string, string[]>;
}): Promise<JiraIssueDetail>;
