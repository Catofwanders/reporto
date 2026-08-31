import type { JiraReport, PrsReport, ReportIndex } from './types';
import { PR_STATE_LABEL, prState } from './prState';
import { formatStatus } from './jiraStatus';

/**
 * What changed since the last day there is a report for.
 *
 * Every panel in this app describes *now*: what is open, what is waiting, how long it has
 * waited. None of them answers the question you actually have after a day off — what moved
 * while I was not looking — and the data for it has been on disk the whole time, because a
 * report is a dated file and yesterday's is still there.
 *
 * So this costs no API call at all. It is a diff of two files.
 */
export type SinceSource = 'ticket' | 'pr';

export interface SinceChange {
  id: string;
  source: SinceSource;
  /** A ticket key, or `repo#number`. */
  label: string;
  /** What happened, in a few words. */
  what: string;
  /** Where to look at it in the app. */
  to: string;
  tone: 'ok' | 'warn' | 'na';
}

export interface SinceReport {
  /** The day being compared against, or null when there is no earlier report. */
  date: string | null;
  changes: SinceChange[];
}

/**
 * Which files hold the most recent day that is *not* today's.
 *
 * `index.history` is newest first and one entry per date, so the answer is the first entry
 * whose date differs from the report on screen. A day that holds neither kind is skipped
 * rather than treated as an empty yesterday — the pull may simply have failed that morning,
 * and "nothing changed" would be a claim, not a reading.
 */
export function previousFiles(
  index: ReportIndex,
  today: string | undefined,
): { date: string | null; jira?: string; prs?: string } {
  for (const day of index.history ?? []) {
    if (!day.date || day.date === today) continue;
    if (day.jira || day.prs) return { date: day.date, jira: day.jira, prs: day.prs };
  }
  return { date: null };
}

const ticketsOf = (report: JiraReport | null) =>
  new Map((report?.groups ?? []).flatMap((group) => group.tickets).map((t) => [t.key, t]));

const prsOf = (report: PrsReport | null) =>
  new Map(
    (report?.repos ?? []).flatMap((group) =>
      group.prs.map((pr) => [`${group.repo}#${pr.num}`, { repo: group.repo, pr }] as const),
    ),
  );

/**
 * The diff, newest-relevant first: things that arrived, then things that moved, then things
 * that left. Arrivals come first on purpose — a ticket that appeared on the board overnight is
 * the thing most likely to be news, and something leaving is the thing least likely to need
 * anybody's attention.
 */
export function sinceYesterday(
  previous: { date: string | null; jira: JiraReport | null; prs: PrsReport | null },
  current: { jira: JiraReport | null; prs: PrsReport | null },
): SinceReport {
  if (!previous.date) return { date: null, changes: [] };

  const arrived: SinceChange[] = [];
  const moved: SinceChange[] = [];
  const left: SinceChange[] = [];

  // Only compare halves that exist on both sides: a kind missing from yesterday's day would
  // otherwise read as "everything arrived today".
  if (previous.jira && current.jira) {
    const before = ticketsOf(previous.jira);
    const after = ticketsOf(current.jira);
    for (const [key, ticket] of after) {
      const was = before.get(key);
      if (!was) {
        arrived.push({
          id: `ticket:${key}`,
          source: 'ticket',
          label: key,
          what: `arrived in ${formatStatus(ticket.status)}`,
          to: `/jira#${key}`,
          tone: 'warn',
        });
      } else if (was.status !== ticket.status) {
        moved.push({
          id: `ticket:${key}`,
          source: 'ticket',
          label: key,
          what: `${formatStatus(was.status)} → ${formatStatus(ticket.status)}`,
          to: `/jira#${key}`,
          tone: 'na',
        });
      }
    }
    for (const [key] of before) {
      if (after.has(key)) continue;
      // The JQL excludes done work, so a ticket leaving the board usually means it finished.
      left.push({
        id: `ticket:${key}`,
        source: 'ticket',
        label: key,
        what: 'left your board',
        to: '/jira',
        tone: 'ok',
      });
    }
  }

  if (previous.prs && current.prs) {
    const before = prsOf(previous.prs);
    const after = prsOf(current.prs);
    for (const [key, { repo, pr }] of after) {
      const was = before.get(key)?.pr;
      if (!was) {
        arrived.push({
          id: `pr:${key}`,
          source: 'pr',
          label: key,
          what: pr.draft ? 'opened as a draft' : 'opened',
          to: `/prs#${repo}-${pr.num}`,
          tone: 'na',
        });
        continue;
      }
      if (was.draft && !pr.draft) {
        moved.push({
          id: `pr:${key}:ready`,
          source: 'pr',
          label: key,
          what: 'ready for review',
          to: `/prs#${repo}-${pr.num}`,
          tone: 'na',
        });
      }
      const state = prState(pr);
      if (prState(was) !== state) {
        moved.push({
          id: `pr:${key}:review`,
          source: 'pr',
          label: key,
          what: `now ${PR_STATE_LABEL[state].toLowerCase()}`,
          to: `/prs#${repo}-${pr.num}`,
          tone: state === 'changes-requested' ? 'warn' : 'ok',
        });
      }
    }
    for (const [key] of before) {
      if (after.has(key)) continue;
      // The report holds open PRs only, so a PR that is gone was merged or closed. Which of
      // the two is not knowable from these files, and guessing would be worse than saying so.
      left.push({
        id: `pr:${key}`,
        source: 'pr',
        label: key,
        what: 'merged or closed',
        to: '/prs',
        tone: 'ok',
      });
    }
  }

  return { date: previous.date, changes: [...arrived, ...moved, ...left] };
}
