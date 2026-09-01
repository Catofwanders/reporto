import { describe, expect, it } from 'vitest';
import type { JiraReport, OpenPr, PrsReport, ReviewPr, ReviewsReport, SlackReport, SlackRow } from './types';
import { kpis, needsYou, needsYouTotal } from './needsYou';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const daysAgo = (days: number) => hoursAgo(days * 24);

const openPr = (over: Partial<OpenPr> & Pick<OpenPr, 'num'>): OpenPr => ({
  title: 'cache the seller catalogue',
  url: `https://example.com/pr/${over.num}`,
  ticket: null,
  ticketUrl: null,
  review: 'REVIEW_REQUIRED',
  draft: false,
  updatedAt: hoursAgo(3),
  ...over,
});

const prs = (list: OpenPr[]): PrsReport => ({
  type: 'prs',
  date: '2026-05-14',
  generatedAt: hoursAgo(1),
  author: 'you',
  repos: [{ repo: 'example/orders-api', prs: list }],
});

const reviewPr = (over: Partial<ReviewPr> & Pick<ReviewPr, 'num'>): ReviewPr => ({
  repo: 'orders-api',
  title: 'retry the refund webhook',
  url: `https://example.com/review/${over.num}`,
  author: 'colleague',
  bot: false,
  draft: false,
  ticket: null,
  createdAt: daysAgo(6),
  updatedAt: daysAgo(3),
  lastCommitAt: daysAgo(3),
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
  size: { additions: 10, deletions: 2, files: 1 },
  ...over,
});

const reviews = (list: ReviewPr[]): ReviewsReport => ({
  type: 'reviews',
  date: '2026-05-14',
  generatedAt: hoursAgo(1),
  reviewer: 'you',
  prs: list,
});

const slackRow = (over: Partial<SlackRow> & Pick<SlackRow, 'id'>): SlackRow => ({
  kind: 'mention',
  channel: 'orders-team',
  channelId: 'C1',
  permalink: 'https://example.slack.com/archives/C1/p1',
  from: 'colleague',
  fromId: 'fixture-person',
  bot: false,
  at: daysAgo(1),
  threadTs: null,
  replies: 0,
  lastFrom: 'colleague',
  lastFromMe: false,
  lastAt: daysAgo(1),
  excerpt: 'can you confirm the refund window?',
  tickets: [],
  prs: [],
  ...over,
});

const slack = (rows: SlackRow[]): SlackReport => ({
  type: 'slack',
  date: '2026-05-14',
  generatedAt: hoursAgo(1),
  me: 'you',
  days: 14,
  rows,
});

const jira = (status: string, statusSince?: string): JiraReport => ({
  type: 'jira',
  date: '2026-05-14',
  generatedAt: hoursAgo(1),
  groups: [
    {
      title: status,
      tickets: [
        {
          key: 'SHOP-812',
          url: 'https://jira.example.com/browse/SHOP-812',
          status,
          chip: 'open',
          summary: 'cache the seller catalogue',
          prs: [],
          notes: [],
          ...(statusSince ? { statusSince } : {}),
        },
      ],
    },
  ],
});

const EMPTY = { prs: null, reviews: null, slack: null, jira: null };

describe('needsYou', () => {
  it('is empty when there are no reports at all', () => {
    expect(needsYou(EMPTY)).toEqual([]);
    expect(needsYouTotal(EMPTY)).toBe(0);
  });

  /*
   * "Waiting on others" is the biggest lane and none of it is mine to move; including it
   * drowned the handful of things that are.
   */
  it('leaves out PRs that are waiting on somebody else', () => {
    const feed = needsYou({
      ...EMPTY,
      prs: prs([
        openPr({ num: 1 }), // awaiting review — theirs
        openPr({ num: 2, review: 'CHANGES_REQUESTED' }), // mine
        openPr({ num: 3, review: 'APPROVED' }), // mine, one button away
        openPr({ num: 4, draft: true }), // nobody's yet
      ]),
    });
    expect(feed.map((item) => item.id)).toEqual([
      'pr:example/orders-api#2',
      'pr:example/orders-api#3',
    ]);
    expect(feed.map((item) => item.action)).toEqual(['push', 'merge']);
  });

  /*
   * Review requests land on whole teams, so an unopened one is usually somebody else's to
   * take. A PR I have already reviewed and that has been pushed to since is unambiguously
   * mine: my verdict is the thing that is out of date.
   */
  it('takes only re-reviews from the review queue, not every request', () => {
    const feed = needsYou({
      ...EMPTY,
      reviews: reviews([
        reviewPr({ num: 10 }), // never looked at
        reviewPr({
          num: 11,
          myReviewState: 'APPROVED',
          myReviewAt: daysAgo(5),
          pushedSinceMyReview: true,
          reworkCommits: 2,
          reworkBy: 'colleague',
        }),
      ]),
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].id).toBe('review:https://example.com/review/11');
    expect(feed[0].why).toContain('pushed since you looked');
  });

  it('carries a Slack question with a short reason and the sender in the detail', () => {
    const feed = needsYou({ ...EMPTY, slack: slack([slackRow({ id: 'C1:1' })]) });
    expect(feed[0].action).toBe('answer');
    expect(feed[0].label).toBe('#orders-team');
    expect(feed[0].why).toBe('mention, no reply yet');
    expect(feed[0].detail).toContain('colleague');
  });

  it('drops a Slack row that was already answered', () => {
    const answered = slackRow({ id: 'C1:2', lastFromMe: true, lastFrom: 'you' });
    expect(needsYou({ ...EMPTY, slack: slack([answered]) })).toEqual([]);
  });

  /*
   * The board contributes no rows at all any more. "Unstick" was the one group whose rows
   * nobody could act on from a queue — a ticket sitting too long needs a conversation, not a
   * click — and it repeated itself every morning until that conversation happened. The count
   * stays in the strip, the age pill stays on the board.
   */
  it('takes nothing from the board, however stuck a ticket is', () => {
    const args = {
      ...EMPTY,
      jira: jira('In Progress', daysAgo(90)),
      aging: { 'In Progress': 1 },
      stuckStatuses: ['In Progress'],
    };
    expect(needsYou(args)).toEqual([]);
    // And it is still counted, so the fact is not lost — only the row is.
    expect(kpis(args).stuck).toBe(1);
  });

  /* Most blocking first, then longest waiting — the order the morning should be read in. */
  it('orders by how much each thing is blocking, then by age', () => {
    const feed = needsYou({
      prs: prs([
        openPr({ num: 1, review: 'APPROVED' }),
        openPr({ num: 2, review: 'CHANGES_REQUESTED', updatedAt: daysAgo(1) }),
        openPr({ num: 3, review: 'CHANGES_REQUESTED', updatedAt: daysAgo(6) }),
      ]),
      reviews: reviews([
        reviewPr({
          num: 11,
          myReviewState: 'APPROVED',
          myReviewAt: daysAgo(5),
          reworkCommits: 1,
          reworkBy: 'colleague',
        }),
      ]),
      slack: slack([slackRow({ id: 'C1:1' })]),
      jira: null,
    });
    expect(feed.map((item) => item.action)).toEqual(['push', 'push', 'review', 'answer', 'merge']);
    // Within "your move", the one that has waited six days comes before the one-day-old.
    expect(feed[0].id).toBe('pr:example/orders-api#3');
  });

  it('cuts the list to the limit but counts everything for the "more waiting" line', () => {
    const many = prs(
      Array.from({ length: 9 }, (_, i) => openPr({ num: i + 1, review: 'CHANGES_REQUESTED' })),
    );
    expect(needsYou({ ...EMPTY, prs: many })).toHaveLength(7);
    expect(needsYou({ ...EMPTY, prs: many, limit: 3 })).toHaveLength(3);
    expect(needsYouTotal({ ...EMPTY, prs: many })).toBe(9);
  });
});

describe('kpis', () => {
  it('counts open PRs, re-reviews, active tickets and stuck ones separately', () => {
    const counts = kpis({
      prs: prs([openPr({ num: 1 }), openPr({ num: 2, draft: true })]),
      reviews: reviews([
        reviewPr({ num: 10 }),
        reviewPr({
          num: 11,
          myReviewState: 'APPROVED',
          myReviewAt: daysAgo(5),
          reworkCommits: 1,
          reworkBy: 'colleague',
        }),
      ]),
      jira: jira('In Progress', daysAgo(9)),
      aging: { 'In Progress': 4 },
      stuckStatuses: ['In Progress'],
      conflicts: 2,
    });
    expect(counts).toEqual({ prs: 2, reviews: 1, tickets: 1, stuck: 1, conflicts: 2 });
  });

  it('is all zeros with no reports, rather than throwing', () => {
    expect(kpis({ prs: null, reviews: null, jira: null })).toEqual({
      prs: 0,
      reviews: 0,
      tickets: 0,
      stuck: 0,
      conflicts: 0,
    });
  });


});
