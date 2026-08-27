import type { Chip, StatsMonth, StatsReport } from './types';

/**
 * One number tracked across months. `tone` reuses the status inks the chips are drawn
 * from, so a metric keeps the same hue in every palette and in dark mode.
 *
 * `lowerIsBetter` only decides how a month-over-month delta is coloured — cycle time
 * falling is good news, deploy count falling is not, and a plain arrow cannot say which.
 */
export interface StatsMetric {
  id: string;
  label: string;
  /** Suffix for a value, e.g. `d` or `h`. Counts have none. */
  unit?: string;
  tone: Chip;
  lowerIsBetter?: boolean;
  /** What this counts, shown under the chart — the numbers are meaningless unlabelled. */
  hint: string;
  value: (month: StatsMonth) => number | null;
}

export const DELIVERY_METRICS: StatsMetric[] = [
  {
    id: 'deployed',
    label: 'Deployed',
    tone: 'ok',
    hint: 'tickets that reached the production status this month',
    value: (m) => m.jira?.deployed ?? null,
  },
  {
    id: 'releaseReady',
    label: 'Ready to release',
    tone: 'qc',
    hint: 'tickets that finished development and testing this month',
    value: (m) => m.jira?.releaseReady ?? null,
  },
  {
    id: 'qcFailed',
    label: 'Sent back',
    tone: 'bad',
    lowerIsBetter: true,
    hint: 'tickets testing sent back — rework, not throughput',
    value: (m) => m.jira?.qcFailed ?? null,
  },
  {
    id: 'cycle',
    label: 'Cycle time',
    unit: 'd',
    tone: 'warn',
    lowerIsBetter: true,
    hint: 'median days from development starting to ready-to-release',
    value: (m) => m.cycle?.releaseReadyDays ?? null,
  },
];

export const PR_METRICS: StatsMetric[] = [
  {
    id: 'merged',
    label: 'PRs merged',
    tone: 'open',
    hint: 'my pull requests merged this month',
    value: (m) => m.prs?.merged ?? null,
  },
  {
    id: 'opened',
    label: 'PRs opened',
    tone: 'na',
    hint: 'my pull requests opened this month',
    value: (m) => m.prs?.opened ?? null,
  },
  {
    id: 'firstReview',
    label: 'To first review',
    unit: 'h',
    tone: 'warn',
    lowerIsBetter: true,
    hint: 'median hours from opening a PR to somebody else reviewing it',
    value: (m) => m.prs?.medianHoursToFirstReview ?? null,
  },
  {
    id: 'toMerge',
    label: 'To merge',
    unit: 'h',
    tone: 'warn',
    lowerIsBetter: true,
    hint: 'median hours from opening a PR to its merge',
    value: (m) => m.prs?.medianHoursToMerge ?? null,
  },
  {
    id: 'reviewsGiven',
    label: 'PRs I reviewed',
    tone: 'qcout',
    hint: "other people's PRs I reviewed that moved this month",
    value: (m) => m.prs?.reviewsGiven ?? null,
  },
];

export const LOAD_METRICS: StatsMetric[] = [
  {
    id: 'meetings',
    label: 'Meeting hours',
    unit: 'h',
    tone: 'qcout',
    lowerIsBetter: true,
    hint: 'timed Google-calendar events, declined ones excluded',
    value: (m) => m.meetings?.hours ?? null,
  },
  {
    id: 'created',
    label: 'Tickets assigned',
    tone: 'na',
    hint: 'tickets created and assigned to me this month',
    value: (m) => m.jira?.created ?? null,
  },
];

/** Oldest first, which is the direction a reader expects a timeline to run. */
export const chronological = (report: StatsReport): StatsMonth[] => [...report.months].reverse();

export const MONTH_LABEL = (month: string): string => {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString('en-GB', { month: 'short' });
};

/**
 * Month-over-month change, and whether it is an improvement. Returns null when either
 * month has no value — "no data" must not read as "no change".
 */
export const delta = (
  metric: StatsMetric,
  months: StatsMonth[],
): { change: number; better: boolean } | null => {
  if (months.length < 2) return null;
  const latest = metric.value(months[months.length - 1]);
  const previous = metric.value(months[months.length - 2]);
  if (latest === null || previous === null) return null;
  const change = Math.round((latest - previous) * 10) / 10;
  if (change === 0) return { change, better: true };
  return { change, better: metric.lowerIsBetter ? change < 0 : change > 0 };
};

export const formatValue = (metric: StatsMetric, value: number | null): string => {
  if (value === null) return '—';
  // Hours read badly past a couple of days; days are what the reader thinks in by then.
  if (metric.unit === 'h' && value >= 48) return `${Math.round((value / 24) * 10) / 10}d`;
  return `${value}${metric.unit ?? ''}`;
};
