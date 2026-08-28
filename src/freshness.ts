import { KIND_META, REPORT_KINDS, type ReportKind } from './reportKinds';

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

/**
 * Which reports a route actually shows — derived from `KIND_META`, so a new kind cannot be
 * added without one. The dashboard is the exception worth stating: it draws from everything
 * except the statistics, whose numbers do not move within a day.
 */
const DASHBOARD_KINDS: ReportKind[] = ['jira', 'prs', 'reviews', 'slack', 'calendar'];

/** Routes that show reports without owning one. */
const EXTRA_ROUTES: { prefix: string; kinds: ReportKind[] }[] = [
  { prefix: '/projects', kinds: ['jira', 'prs'] },
];

export const kindsForRoute = (path: string): ReportKind[] => {
  if (path === '/') return DASHBOARD_KINDS;
  const own = REPORT_KINDS.find((kind) => path.startsWith(KIND_META[kind].route));
  if (own) return [own, ...(KIND_META[own].alsoReads ?? [])];
  return EXTRA_ROUTES.find((entry) => path.startsWith(entry.prefix))?.kinds ?? [];
};

export const minutesSince = (iso: string | undefined): number => {
  if (iso === undefined) return Number.POSITIVE_INFINITY;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  return (Date.now() - at) / 60_000;
};

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
