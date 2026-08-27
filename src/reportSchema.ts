import type {
  CalendarReport,
  JiraReport,
  PrsReport,
  ReviewsReport,
  SlackReport,
  StatsReport,
} from './types';
import type { ReportKind } from './reportKinds';

/**
 * Report files are written by agent runs, not by this app, so a malformed or
 * half-written file is a normal failure mode. These guards check only the structure
 * each view actually walks, so one bad report is reported as that report's error
 * instead of throwing mid-render.
 */
const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

function validJira(v: unknown): v is JiraReport {
  if (!isObject(v) || typeof v.date !== 'string' || !isArray(v.groups)) return false;
  return v.groups.every(
    (g) =>
      isObject(g) &&
      typeof g.title === 'string' &&
      isArray(g.tickets) &&
      g.tickets.every((t) => isObject(t) && typeof t.key === 'string' && isArray(t.prs)),
  );
}

function validCalendar(v: unknown): v is CalendarReport {
  return (
    isObject(v) && typeof v.date === 'string' && isArray(v.events) && isArray(v.upcoming)
  );
}

function validPrs(v: unknown): v is PrsReport {
  if (!isObject(v) || typeof v.date !== 'string' || !isArray(v.repos)) return false;
  return v.repos.every((r) => isObject(r) && typeof r.repo === 'string' && isArray(r.prs));
}

function validReviews(v: unknown): v is ReviewsReport {
  if (!isObject(v) || typeof v.date !== 'string' || !isArray(v.prs)) return false;
  return v.prs.every((pr) => isObject(pr) && typeof pr.num === 'number' && typeof pr.repo === 'string');
}

function validSlack(v: unknown): v is SlackReport {
  if (!isObject(v) || typeof v.date !== 'string' || !isArray(v.rows)) return false;
  return v.rows.every(
    (row) =>
      isObject(row) &&
      typeof row.id === 'string' &&
      typeof row.lastFromMe === 'boolean' &&
      (row.kind === 'mention' || row.kind === 'dm'),
  );
}

function validStats(v: unknown): v is StatsReport {
  if (!isObject(v) || !isArray(v.months)) return false;
  return v.months.every((m) => isObject(m) && typeof m.month === 'string');
}

const VALIDATORS: Record<ReportKind, (v: unknown) => boolean> = {
  jira: validJira,
  calendar: validCalendar,
  prs: validPrs,
  reviews: validReviews,
  slack: validSlack,
  stats: validStats,
};

/** Throws with a readable reason when the file does not match its kind. */
export function assertReport(kind: ReportKind, value: unknown) {
  if (!VALIDATORS[kind](value)) {
    throw new Error(`${kind} report is malformed`);
  }
  return value;
}
