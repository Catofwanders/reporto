import type { ReportKind } from './reportKinds';

/**
 * How long each report stays believable, in minutes.
 *
 * One number for everything is the thing to avoid. A PR's review state changes in minutes and
 * a Slack question is the most time-sensitive thing here; monthly counts do not move at all
 * within a day, and their pull is the most expensive one. A single interval would either
 * hammer the slow sources or leave the fast ones stale.
 *
 * These are ceilings on *belief*, not schedules: nothing is fetched on a timer. The check runs
 * when somebody looks — on load, on navigation, and when the window regains focus — because a
 * report nobody is reading does not need to be current.
 */
export const FRESH_MINUTES: Record<ReportKind, number> = {
  slack: 5,
  prs: 10,
  reviews: 10,
  jira: 30,
  calendar: 120,
  // A day. The pull reads six months of Jira, GitHub and Calendar, and the numbers it
  // produces are monthly — refetching it on a focus event would be pure waste.
  stats: 1440,
};

/** Which reports a route actually shows. Nothing else is worth fetching for that view. */
export const ROUTE_KINDS: { match: (path: string) => boolean; kinds: ReportKind[] }[] = [
  { match: (p) => p === '/', kinds: ['jira', 'prs', 'reviews', 'slack', 'calendar'] },
  { match: (p) => p.startsWith('/jira'), kinds: ['jira'] },
  { match: (p) => p.startsWith('/prs'), kinds: ['prs'] },
  // The review queue reads ticket status for its rows, so a stale board shows there too.
  { match: (p) => p.startsWith('/reviews'), kinds: ['reviews', 'jira'] },
  { match: (p) => p.startsWith('/slack'), kinds: ['slack'] },
  { match: (p) => p.startsWith('/calendar'), kinds: ['calendar'] },
  { match: (p) => p.startsWith('/stats'), kinds: ['stats'] },
  { match: (p) => p.startsWith('/projects'), kinds: ['jira', 'prs'] },
];

export const kindsForRoute = (path: string): ReportKind[] =>
  ROUTE_KINDS.find((entry) => entry.match(path))?.kinds ?? [];

export const minutesSince = (iso: string | undefined): number =>
  iso === undefined ? Number.POSITIVE_INFINITY : (Date.now() - new Date(iso).getTime()) / 60_000;

/** Undefined stamps count as stale, but only once the reports have loaded — see LiveRefresh. */
export const isStale = (kind: ReportKind, iso: string | undefined): boolean =>
  minutesSince(iso) >= FRESH_MINUTES[kind];

/** Said in the shortest form that is still true, for the Settings copy. */
export const freshnessLabel = (kind: ReportKind): string => {
  const minutes = FRESH_MINUTES[kind];
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${minutes / 60} h`;
  return `${minutes / (60 * 24)} day`;
};
