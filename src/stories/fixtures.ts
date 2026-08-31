/**
 * Synthetic reports for Storybook. Deliberately invented: the real ones hold meeting
 * links and ticket detail, and are gitignored for that reason — a story file that
 * imported them would put all of it back into the repo.
 *
 * The domain is an online marketplace — buyers, sellers, baskets, listings — chosen because
 * it is nothing like the work these reports actually describe. Fixtures that mirror the real
 * projects one for one leak them by shape even when every name is changed.
 */
import type { AdfNode, TicketDetail } from '../ticketDetail';
import type { StatusVocabConfig } from '../statusVocab';
import type {
  CalendarReport,
  JiraReport,
  OpenPr,
  PrsReport,
  ReviewDecision,
  ReviewPr,
  ReviewsReport,
  SlackReport,
  SlackRow,
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
      title: 'Checkout kick-off',
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
  banner: { tone: 'open', text: 'Two tickets sitting in Ready for QA with approved PRs still open.' },
  groups: [
    {
      title: 'In Progress',
      tickets: [
        {
          key: 'SHOP-812',
          url: 'https://jira.example.com/browse/SHOP-812',
          status: 'In Progress',
          chip: 'open',
          // Past the 5-day limit the marketplace config sets, so the age pill and the
          // dashboard's Unstick group have something real to draw.
          statusSince: `2026-05-05T09:00:00+02:00`,
          summary: 'Cache the seller catalogue so a cold product page stops hitting search',
          prs: [
            {
              repo: 'orders-api',
              num: 77,
              url: 'https://github.com/example/orders-api/pull/77',
              state: 'open',
              note: 'approved',
            },
          ],
          notes: [],
        },
        {
          key: 'SHOP-644',
          url: 'https://jira.example.com/browse/SHOP-644',
          status: 'In Progress',
          chip: 'open',
          statusSince: `2026-05-13T09:00:00+02:00`,
          summary: 'Move the payout report off the nightly scheduler',
          prs: [],
          notes: [],
        },
      ],
    },
    {
      title: 'Ready for QA',
      tickets: [
        {
          key: 'SHOP-790',
          url: 'https://jira.example.com/browse/SHOP-790',
          status: 'Ready for QA',
          chip: 'open',
          summary: 'Confirm payment before the order-confirmation screen renders',
          prs: [
            {
              repo: 'shop-web',
              num: 512,
              url: 'https://github.com/example/shop-web/pull/512',
              state: 'merged',
              inQc: true,
            },
          ],
          notes: [],
        },
        {
          key: 'SHOP-781',
          url: 'https://jira.example.com/browse/SHOP-781',
          status: 'Ready for QA',
          chip: 'open',
          summary: 'Reconnect the delivery-tracking socket after a terminate frame',
          prs: [
            {
              repo: 'shop-web',
              num: 498,
              url: 'https://github.com/example/shop-web/pull/498',
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
          key: 'SHOP-455',
          url: 'https://jira.example.com/browse/SHOP-455',
          status: 'BLOCKED',
          chip: 'bad',
          summary: 'Seller onboarding needs the new payout fields',
          prs: [
            {
              repo: 'seller-console',
              num: 233,
              url: 'https://github.com/example/seller-console/pull/233',
              state: 'closed',
            },
          ],
          notes: ['PR closed unmerged — parked until the payout contract lands.'],
        },
      ],
    },
  ],
  activity: [
    {
      id: 'SHOP-790:10241',
      kind: 'comment',
      ticket: 'SHOP-790',
      ticketUrl: 'https://jira.example.com/browse/SHOP-790',
      summary: 'Confirm payment before the order-confirmation screen renders',
      status: 'Ready for QA',
      author: 'Ola',
      avatar: null,
      at: AT('09:40'),
      mentionsMe: true,
      excerpt:
        '@you the QA build still shows the confirmation before the charge settles — is 512 the one that fixes it, or does that need the payout contract first?',
    },
    {
      id: 'SHOP-455:10238',
      kind: 'comment',
      ticket: 'SHOP-455',
      ticketUrl: 'https://jira.example.com/browse/SHOP-455',
      summary: 'Seller onboarding needs the new payout fields',
      status: 'BLOCKED',
      author: 'Dana',
      avatar: null,
      at: AT('08:05'),
      mentionsMe: false,
      excerpt: 'Parking this until the payout contract is signed. Nothing to do here this week.',
    },
    {
      // A change rather than a comment: on a quiet board this is most of the queue.
      id: 'SHOP-812:change:88:status',
      kind: 'change',
      field: 'status',
      from: 'Ready for QA',
      to: 'QA rejected',
      ticket: 'SHOP-812',
      ticketUrl: 'https://jira.example.com/browse/SHOP-812',
      summary: 'Cache the seller catalogue so a cold product page stops hitting search',
      status: 'In Progress',
      author: 'A QC tester',
      avatar: null,
      at: AT('09:05'),
      mentionsMe: false,
      excerpt: 'moved it from Ready for QA to QA rejected',
    },
    {
      // Being handed a ticket: the strongest "this is yours now" signal Jira has.
      id: 'SHOP-644:change:91:assignee',
      kind: 'change',
      field: 'assignee',
      from: 'Dana',
      to: 'you',
      ticket: 'SHOP-644',
      ticketUrl: 'https://jira.example.com/browse/SHOP-644',
      summary: 'Move the payout report off the nightly scheduler',
      status: 'In Progress',
      author: 'Dana',
      avatar: null,
      at: AT('08:40'),
      mentionsMe: true,
      excerpt: 'assigned it to you',
    },
    {
      // No text at all: a comment that is one screenshot. The row still has to read.
      id: 'SHOP-781:10230',
      kind: 'comment',
      ticket: 'SHOP-781',
      ticketUrl: 'https://jira.example.com/browse/SHOP-781',
      summary: 'Reconnect the delivery-tracking socket after a terminate frame',
      status: 'Ready for QA',
      author: 'a QC tester',
      avatar: null,
      at: '2026-05-18T14:12:00+02:00',
      mentionsMe: false,
      excerpt: '',
    },
  ],
  activityNote: '2 tickets could not be read',
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
  ticket: /\bSHOP-\d+\b/.exec(title)?.[0] ?? null,
  ticketUrl: /\bSHOP-\d+\b/.exec(title)
    ? `https://jira.example.com/browse/${/\bSHOP-\d+\b/.exec(title)?.[0]}`
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
      repo: 'orders-api',
      prs: [
        // One PR per state the pill can show, so the story doubles as a colour reference.
        pr(77, 'SHOP-812 - cache the seller catalogue', 'APPROVED', {
          deployQc: { status: 'BEHIND', aheadBy: 0, behindBy: 12 },
          unansweredThreads: 2,
        }),
        pr(74, 'SHOP-802 - retry the shipment webhook', 'CHANGES_REQUESTED', {
          deployQc: { status: 'DIVERGED', aheadBy: 4, behindBy: 30 },
        }),
        pr(71, 'SHOP-795 - split the basket serialiser', 'COMMENTED', {
          lastReviewAt: AT('06:00'),
          lastCommitAt: AT('05:10'),
          deployQc: { status: 'IDENTICAL', aheadBy: 0, behindBy: 0 },
        }),
      ],
    },
    {
      repo: 'shop-web',
      prs: [
        pr(512, 'SHOP-790 - confirm payment before the confirmation screen', 'REVIEW_REQUIRED', {
          lastReviewAt: AT('06:00'),
          lastCommitAt: AT('07:30'),
          deployQc: { status: 'DIVERGED', aheadBy: 1, behindBy: 9 },
        }),
        pr(498, 'SHOP-781 - reconnect the delivery-tracking socket', 'REVIEW_REQUIRED'),
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
  repo: 'orders-api',
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
      title: 'SHOP-820 - retry the refund webhook',
      myReviewState: 'APPROVED',
      myReviewAt: AT('06:20'),
      pushedSinceMyReview: true,
      reworkCommits: 2,
      reworkBy: 'colleague',
      size: { additions: 610, deletions: 95, files: 22 },
    }),
    reviewPr({ num: 84, repo: 'shop-web', title: 'SHOP-818 - lazy-load the recommendations panel' }),
    reviewPr({
      num: 80,
      title: 'SHOP-810 - move the seller guard into middleware',
      myReviewState: 'CHANGES_REQUESTED',
      myReviewAt: AT('05:30'),
      myUnansweredThreads: 2,
    }),
    reviewPr({
      num: 76,
      repo: 'shop-web',
      title: 'SHOP-800 - drop the legacy basket route',
      myReviewState: 'APPROVED',
      myReviewAt: AT('05:00'),
      reviewDecision: 'APPROVED',
    }),
    reviewPr({ num: 70, title: 'Bump the linter', author: 'dependabot', bot: true }),
  ],
};

/**
 * Slack mentions in the invented marketplace: one waiting on a reply, one gone stale, one
 * already answered, and an alert from an app.
 */
const slackRow = (over: Partial<SlackRow> & Pick<SlackRow, 'id' | 'excerpt'>): SlackRow => ({
  kind: 'mention',
  channel: 'orders-team',
  channelId: 'C0000001',
  permalink: 'https://example.slack.com/archives/C0000001/p1',
  from: 'colleague',
  // Not id-shaped on purpose: a fixture that looks like a real member id trips the NDA scan.
  fromId: 'fixture-person',
  bot: false,
  at: AT('09:10'),
  threadTs: null,
  replies: 0,
  lastFrom: 'colleague',
  lastFromMe: false,
  lastAt: AT('09:10'),
  tickets: [],
  prs: [],
  ...over,
});

export const slackReport: SlackReport = {
  type: 'slack',
  date: DATE,
  generatedAt: AT('08:35'),
  me: 'you',
  days: 14,
  rows: [
    slackRow({
      id: 'C0000001:1',
      excerpt: 'can you confirm the refund window before we ship the release? SHOP-790',
      tickets: ['SHOP-790'],
    }),
    slackRow({
      id: 'C0000002:2',
      channel: 'checkout',
      channelId: 'C0000002',
      excerpt: 'the basket serialiser change — is that still landing this sprint?',
      at: `2026-05-02T10:00:00+02:00`,
      lastAt: `2026-05-02T10:00:00+02:00`,
    }),
    slackRow({
      id: 'C0000001:3',
      excerpt: 'thanks — merged and on QC now',
      threadTs: 'C0000001:3',
      replies: 2,
      lastFrom: 'you',
      lastFromMe: true,
    }),
    slackRow({
      kind: 'dm',
      id: 'D0000009:5',
      channel: 'seller-ops-lead',
      channelId: 'D0000009',
      from: 'seller-ops-lead',
      fromId: 'fixture-seller-ops',
      excerpt: 'when does the payout report land? finance is asking',
    }),
    slackRow({
      id: 'C0000003:4',
      channel: 'alerts',
      channelId: 'C0000003',
      from: 'deploy-bot',
      bot: true,
      excerpt: 'orders-api deploy finished · 3 migrations applied',
      lastFrom: 'deploy-bot',
    }),
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
      { repo: 'orders-api', merged: Math.max(1, merged - 4) },
      { repo: 'shop-web', merged: Math.min(4, merged) },
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
  statuses: { releaseReady: 'Ready to ship', deployed: 'Shipped' },
  notes: [],
};

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
const hoursAgo = (hours: number) => minutesAgo(hours * 60);

/*
 * The fixtures above are pinned to one date so stories stay deterministic. Anything that
 * renders an age — a PR lane, the review queue, the dashboard feed — then reads "104d idle",
 * which is the fixture's date rather than a fact about the row, and makes a screenshot look
 * like a dashboard nobody has opened since spring.
 *
 * These restamp the same fixtures onto now. Functions, not constants, so the ages are taken
 * when the story renders rather than when the module loads.
 */

/**
 * Open PRs spread over the last few days rather than the last few hours: the age pill and its
 * tone are half of what a lane row says, and a fixture where every row reads "today" shows
 * neither.
 */
export const freshPrs = (): PrsReport => ({
  ...prsReport,
  repos: prsReport.repos.map((group) => ({
    ...group,
    prs: group.prs.map((pr, i) => ({ ...pr, updatedAt: hoursAgo(3 + i * 26) })),
  })),
});

/** Review requests aged in days, keeping each row's own state — reviewed, unseen, answered. */
export const freshReviews = (): ReviewsReport => ({
  ...reviewsReport,
  prs: reviewsReport.prs.map((pr, i) => ({
    ...pr,
    updatedAt: hoursAgo(5 + i * 27),
    lastCommitAt: hoursAgo(5 + i * 27),
    createdAt: hoursAgo(24 * (4 + i)),
    // Older than the commit above, or the row would not be "pushed since you looked".
    myReviewAt: pr.myReviewAt ? hoursAgo(24 * (2 + i) + 12) : null,
  })),
});

/** Mentions and DMs, the oldest a few days back so the tones differ. */
export const freshSlack = (): SlackReport => ({
  ...slackReport,
  rows: slackReport.rows.map((row, i) => ({
    ...row,
    at: hoursAgo(2 + i * 30),
    lastAt: hoursAgo(2 + i * 30),
  })),
});


/**
 * A description in Atlassian Document Format, carrying every node type the renderer handles —
 * including a `date`, which has no children and so rendered as nothing until it got a case,
 * and an invented node type to show that an unknown one degrades to its own text rather than
 * blanking the ticket.
 */
export const adfDescription: AdfNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'A cold ' },
        { type: 'text', text: 'listing page', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' hits ' },
        { type: 'text', text: 'search', marks: [{ type: 'code' }] },
        { type: 'text', text: ' on every request. See ' },
        {
          type: 'text',
          text: 'the seller catalogue doc',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/catalogue' } }],
        },
        { type: 'text', text: ', raised by ' },
        { type: 'mention', attrs: { text: '@dana' } },
        { type: 'text', text: ' before ' },
        { type: 'date', attrs: { timestamp: '1780531200000' } },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cache the catalogue per seller' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'invalidate on a listing write' }] }] },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'measure the cold page first' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'then add the cache' }] }] },
      ],
    },
    { type: 'codeBlock', content: [{ type: 'text', text: 'GET /listings?seller=42&page=1' }] },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'QC saw 4s on a cold basket.' }] }],
    },
    { type: 'panel', attrs: { panelType: 'warning' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Do not cache signed download links.' }] }] },
    { type: 'rule' },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'was 2s', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' now 4s', marks: [{ type: 'underline' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'italic aside', marks: [{ type: 'em' }] },
      ],
    },
    { type: 'status', attrs: { text: 'needs sizing' } },
    { type: 'inlineCard', attrs: { url: 'https://example.com/orders-api/pull/77' } },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'page' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cold' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'listing' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '4.1s' }] }] },
          ],
        },
      ],
    },
    { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x', type: 'file' } }] },
    // Not a real ADF type: stands in for whatever Atlassian adds next.
    { type: 'someFutureNode', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'unknown node, text kept' }] }] },
  ],
};

/** The drawer's own fixture: the marketplace ticket the board fixture already shows. */
export const ticketDetail: TicketDetail = {
  key: 'SHOP-812',
  url: 'https://jira.example.com/browse/SHOP-812',
  summary: 'Cache the seller catalogue so a cold product page stops hitting search',
  status: 'In Progress',
  chip: 'open',
  type: 'Story',
  priority: 'Normal',
  assignee: { name: 'You', avatar: null },
  reporter: { name: 'Dana Okafor', avatar: null },
  created: AT('08:00'),
  updated: AT('09:30'),
  labels: ['performance', 'catalogue'],
  parent: { key: 'SHOP-700', summary: 'Marketplace performance' },
  description: adfDescription,
  comments: [
    {
      id: '1',
      author: { name: 'Dana Okafor', avatar: null },
      at: AT('09:30'),
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { text: '@you' } },
              { type: 'text', text: ' the cold page is still 4s on staging.' },
            ],
          },
        ],
      },
    },
    {
      id: '2',
      author: { name: 'Ola Berg', avatar: null },
      at: `2026-05-13T16:10:00+02:00`,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Basket serialiser lands first.' }] }],
      },
    },
  ],
};


/**
 * The marketplace's own workflow, mirroring `config.template/reporto.json`.
 *
 * Committed code knows universal Jira words and nothing else — the stages past "in review"
 * come from config (see rules/nda.md). Storybook has no dev server to ask, so the preview
 * hands this to the capabilities context: the stories then exercise the configured path rather
 * than the bare defaults, and a board fixture's columns come out in workflow order.
 */
export const marketplaceStatuses: StatusVocabConfig = {
  order: [
    'Backlog',
    'Next',
    'To Do',
    'In Progress',
    'In Review',
    'Ready for QA',
    'QA rejected',
    'Awaiting sign-off',
    'Ready to ship',
    'Shipped',
    'Done',
    'Blocked',
    'On Hold',
  ],
  tones: {
    qc: ['Ready for QA'],
    warn: ['Awaiting sign-off'],
    bad: ['QA rejected'],
    ok: ['Ready to ship', 'Shipped'],
  },
  groups: {
    active: ['Ready for QA', 'QA rejected', 'Awaiting sign-off'],
    blocked: ['QA rejected'],
    devDone: ['Ready for QA', 'Awaiting sign-off', 'Ready to ship'],
    shipped: ['Ready to ship', 'Shipped'],
  },
};

/** Days-in-status limits for the marketplace, so age pills have something to be over. */
export const marketplaceAging = {
  'In Progress': 5,
  'In Review': 2,
  'Ready for QA': 3,
  'QA rejected': 1,
  default: 7,
};

export const marketplaceStuck = ['In Progress', 'In Review', 'Ready for QA', 'Awaiting sign-off'];

/**
 * The board with times-in-status stamped onto now: one ticket past the marketplace's 5-day
 * limit for In Progress, one comfortably inside it. Without this every story either shows no
 * age pill at all or shows every ticket as months overdue, and the dashboard's Unstick group
 * had nothing to render.
 */
export const freshJira = (): JiraReport => ({
  ...jiraReport,
  groups: jiraReport.groups.map((group) => ({
    ...group,
    tickets: group.tickets.map((ticket) =>
      ticket.statusSince
        ? { ...ticket, statusSince: hoursAgo(ticket.key === 'SHOP-812' ? 24 * 9 : 24 * 2) }
        : ticket,
    ),
  })),
});
