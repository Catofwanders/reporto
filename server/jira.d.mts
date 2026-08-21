import type { JiraReport, Pr } from '../src/types';

export function pullJira(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  jql: string;
  jiraBrowseUrl?: string;
  /** Given every ticket found, return ticket key → the PRs implementing it. */
  resolvePrs?: (tickets: { key: string; status: string }[]) => Promise<Map<string, Pr[]>>;
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
}): Promise<JiraTransition[]>;

export function jiraTransition(options: {
  site: string | undefined;
  email: string | undefined;
  apiToken: string | undefined;
  key: string;
  transitionId: string;
}): Promise<{ key: string; transitionId: string }>;
