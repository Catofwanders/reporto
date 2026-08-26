/**
 * Synthetic reports for Storybook. Deliberately invented: the real ones hold meeting
 * links and ticket detail, and are gitignored for that reason — a story file that
 * imported them would put all of it back into the repo.
 */
import type {
  CalendarReport,
  JiraReport,
  OpenPr,
  PrsReport,
  ReviewDecision,
  ReviewPr,
  ReviewsReport,
  StatsMonth,
  StatsReport,
} from '../types';

const DATE = '2026-05-14';
const AT = (hhmm: string) => `${DATE}T${hhmm}:00+02:00`;

export const calendarReport: CalendarReport = {
  type: 'calendar',
  date: DATE,
  generatedAt: AT('08:20'),
  events: [
    {
      source: 'outlook',
      calendar: 'Work',
      title: 'Daily stand-up',
      kind: 'meeting',
      start: AT('11:00'),
      end: AT('11:15'),
      url: 'https://example.zoom.us/j/000000',
      note: 'Recurring Tue + Thu, organiser Svea Lindqvist.',
    },
    {
      source: 'google',
      calendar: 'Personal',
      title: 'Platform kick-off',
      kind: 'kickoff',
      start: AT('15:30'),
      end: AT('16:00'),
      url: 'https://calendar.example.com/day/2026/5/14',
      note: 'No conferencing link on the invite; the day view is the only handle.',
    },
    {
      source: 'google',
      calendar: 'Team time off',
      title: 'Ola — vacation',
      kind: 'all-day',
      start: null,
      end: null,
      url: 'https://calendar.example.com/day/2026/5/14',
      note: '13–15 May; back Monday.',
    },
  ],
  upcoming: [
    {
      source: 'google',
      calendar: 'Personal',
      title: 'Quarter review',
      kind: 'meeting',
      start: `2026-05-15T13:00:00+02:00`,
      end: `2026-05-15T14:00:00+02:00`,
      url: 'https://calendar.example.com/day/2026/5/15',
      note: 'Moved from Thursday — the invite in mail still says the old slot.',
    },
    {
      source: 'google',
      calendar: 'Team time off',
      title: 'Dana — away',
      kind: 'all-day',
      start: null,
      end: null,
      url: 'https://calendar.example.com/day/2026/5/18',
      note: 'Out Mon 18 through Wed 20 May.',
    },
  ],
  summary: 'Stand-up 11:00, kick-off 15:30. Ola out today; Dana away next week.',
};

export const jiraReport: JiraReport = {
  type: 'jira',
  date: DATE,
  generatedAt: AT('08:22'),
  banner: { tone: 'open', text: 'Two tickets sitting in QC READY with approved PRs still open.' },
  groups: [
    {
      title: 'In Progress',
      tickets: [
        {
          key: 'PROJ-812',
          url: 'https://jira.example.com/browse/PROJ-812',
          status: 'In Progress',
          chip: 'open',
          summary: 'Cache the tenant lookup so cold requests stop hitting the directory',
          prs: [
            {
              repo: 'billing-api',
              num: 77,
              url: 'https://github.com/example/billing-api/pull/77',
              state: 'open',
              note: 'approved',
            },
          ],
          notes: [],
        },
        {
          key: 'PROJ-644',
          url: 'https://jira.example.com/browse/PROJ-644',
          status: 'In Progress',
          chip: 'open',
          summary: 'Migrate the reporting jobs off the legacy scheduler',
          prs: [],
          notes: [],
        },
      ],
    },
    {
      title: 'QC READY',
      tickets: [
        {
          key: 'PROJ-790',
          url: 'https://jira.example.com/browse/PROJ-790',
          status: 'QC READY',
          chip: 'open',
          summary: 'Confirm payment before the success screen renders',
          prs: [
            {
              repo: 'storefront',
              num: 512,
              url: 'https://github.com/example/storefront/pull/512',
              state: 'merged',
              inQc: true,
            },
          ],
          notes: [],
        },
        {
          key: 'PROJ-781',
          url: 'https://jira.example.com/browse/PROJ-781',
          status: 'QC READY',
          chip: 'open',
          summary: 'Reconnect the websocket transport after a terminate frame',
          prs: [
            {
              repo: 'storefront',
              num: 498,
              url: 'https://github.com/example/storefront/pull/498',
              state: 'merged',
              // The case the whole deploy-qc check exists for: merged, then a QC reset
              // dropped it, so the ticket reads as done while the work is not on QC.
              inQc: false,
            },
          ],
          notes: ['Re-merge into deploy-qc after the refresh.'],
        },
      ],
    },
    {
      title: 'BLOCKED',
      tickets: [
        {
          key: 'PROJ-455',
          url: 'https://jira.example.com/browse/PROJ-455',
          status: 'BLOCKED',
          chip: 'bad',
          summary: 'Provider onboarding needs the new contract fields',
          prs: [
            {
              repo: 'admin-client',
              num: 233,
              url: 'https://github.com/example/admin-client/pull/233',
              state: 'closed',
            },
          ],
          notes: ['PR closed unmerged — parked until the contract lands.'],
        },
      ],
    },
  ],
  footer: '5 tickets from JQL, PRs matched by key in title.',
};

const pr = (
  num: number,
  title: string,
  review: ReviewDecision,
  extra: Partial<OpenPr> = {},
): OpenPr => ({
  num,
  title,
  url: `https://github.com/example/repo/pull/${num}`,
  ticket: /\bPROJ-\d+\b/.exec(title)?.[0] ?? null,
  ticketUrl: /\bPROJ-\d+\b/.exec(title)
    ? `https://jira.example.com/browse/${/\bPROJ-\d+\b/.exec(title)?.[0]}`
    : null,
  review,
  draft: false,
  updatedAt: AT('07:45'),
  ...extra,
});

export const prsReport: PrsReport = {
  type: 'prs',
  date: DATE,
  generatedAt: AT('08:25'),
  author: 'you',
  repos: [
    {
      repo: 'billing-api',
      prs: [
        // One PR per state the pill can show, so the story doubles as a colour reference.
        pr(77, 'PROJ-812 - cache the tenant lookup', 'APPROVED', {
          deployQc: { status: 'BEHIND', aheadBy: 0, behindBy: 12 },
          unansweredThreads: 2,
        }),
        pr(74, 'PROJ-802 - retry the webhook dispatch', 'CHANGES_REQUESTED', {
          deployQc: { status: 'DIVERGED', aheadBy: 4, behindBy: 30 },
        }),
        pr(71, 'PROJ-795 - split the invoice serializer', 'COMMENTED', {
          lastReviewAt: AT('06:00'),
          lastCommitAt: AT('05:10'),
          deployQc: { status: 'IDENTICAL', aheadBy: 0, behindBy: 0 },
        }),
      ],
    },
    {
      repo: 'storefront',
      prs: [
        pr(512, 'PROJ-790 - confirm payment before the success screen', 'REVIEW_REQUIRED', {
          lastReviewAt: AT('06:00'),
          lastCommitAt: AT('07:30'),
          deployQc: { status: 'DIVERGED', aheadBy: 1, behindBy: 9 },
        }),
        pr(498, 'PROJ-781 - reconnect the websocket transport', 'REVIEW_REQUIRED'),
        pr(455, 'Bump the design tokens package', 'NONE', { draft: true, ticket: null }),
      ],
    },
  ],
};

/**
 * The review queue, one PR per lane that the dashboard and the page care about: reviewed
 * then pushed to, never looked at, my threads unanswered, approved, quiet, and a bot.
 */
const reviewPr = (
  over: Partial<ReviewPr> & Pick<ReviewPr, 'num' | 'title'>,
): ReviewPr => ({
  repo: 'billing-api',
  url: `https://example.com/pr/${over.num}`,
  author: 'colleague',
  bot: false,
  draft: false,
  ticket: null,
  createdAt: AT('06:00'),
  updatedAt: AT('07:40'),
  lastCommitAt: AT('07:40'),
  reviewRequested: true,
  reviewDecision: null,
  myReviewState: null,
  myReviewAt: null,
  myReviewCount: 0,
  pushedSinceMyReview: false,
  reworkCommits: 0,
  reworkBy: null,
  reworkHeadline: null,
  syncOnlySinceMyReview: false,
  myUnansweredThreads: 0,
  size: { additions: 40, deletions: 8, files: 3 },
  ...over,
});

export const reviewsReport: ReviewsReport = {
  type: 'reviews',
  date: DATE,
  generatedAt: AT('08:30'),
  reviewer: 'you',
  prs: [
    reviewPr({
      num: 88,
      title: 'PROJ-820 - retry the payment webhook',
      myReviewState: 'APPROVED',
      myReviewAt: AT('06:20'),
      pushedSinceMyReview: true,
      reworkCommits: 2,
      reworkBy: 'colleague',
      size: { additions: 610, deletions: 95, files: 22 },
    }),
    reviewPr({ num: 84, repo: 'storefront', title: 'PROJ-818 - lazy-load the basket panel' }),
    reviewPr({
      num: 80,
      title: 'PROJ-810 - move the tenant guard into middleware',
      myReviewState: 'CHANGES_REQUESTED',
      myReviewAt: AT('05:30'),
      myUnansweredThreads: 2,
    }),
    reviewPr({
      num: 76,
      repo: 'storefront',
      title: 'PROJ-800 - drop the legacy checkout route',
      myReviewState: 'APPROVED',
      myReviewAt: AT('05:00'),
      reviewDecision: 'APPROVED',
    }),
    reviewPr({ num: 70, title: 'Bump the linter', author: 'dependabot', bot: true }),
  ],
};

/**
 * Six months of invented statistics. The shape is what matters for the stories: one month
 * with a missing source, one with no cycle-time sample, and a trend that is not monotonic
 * so the deltas have something to point at.
 */
const statsMonth = (
  month: string,
  deployed: number,
  releaseReady: number,
  qcFailed: number,
  cycleDays: number | null,
  merged: number,
  hours: number,
): StatsMonth => ({
  month,
  jira: { releaseReady, deployed, qcReady: releaseReady + 1, qcFailed, created: deployed + 2 },
  cycle: { releaseReadyDays: cycleDays, sampled: cycleDays === null ? 0 : releaseReady },
  prs: {
    merged,
    opened: merged + 3,
    abandoned: 1,
    reviewsGiven: Math.round(merged / 2),
    byRepo: [
      { repo: 'billing-api', merged: Math.max(1, merged - 4) },
      { repo: 'web-client', merged: Math.min(4, merged) },
    ],
    medianHoursToFirstReview: 6.4,
    medianHoursToMerge: 52.5,
  },
  meetings: { hours, count: Math.round(hours * 1.6) },
  missing: [],
});

export const statsReport: StatsReport = {
  type: 'stats',
  date: DATE,
  generatedAt: AT('08:20'),
  months: [
    statsMonth('2026-05', 9, 12, 1, 5.5, 14, 8.5),
    statsMonth('2026-04', 12, 10, 3, 7.1, 11, 11),
    statsMonth('2026-03', 7, 8, 0, 6.2, 9, 9.5),
    statsMonth('2026-02', 10, 9, 2, 8.4, 12, 12),
    { ...statsMonth('2026-01', 4, 5, 1, null, 6, 10), meetings: null, missing: ['meeting hours unavailable: no Google credentials'] },
    statsMonth('2025-12', 3, 4, 0, 9.9, 4, 6),
  ],
  statuses: { releaseReady: 'RELEASE READY', deployed: 'Released to Production' },
  notes: [],
};
