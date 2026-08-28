import { describe, expect, it } from 'vitest';
import type { OpenPr, ReviewPr, SlackRow } from './types';
import { agingTone, idleDays, laneOf, reasonOf } from './prLanes';
import { laneOfReview, reasonOfReview, sizeLabel, sizeTone } from './reviewLanes';
import { laneOfSlack, reasonOfSlack } from './slackLanes';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const pr = (over: Partial<OpenPr> = {}): OpenPr => ({
  num: 1,
  title: 'cache the seller catalogue',
  url: 'https://example.com/pr/1',
  ticket: null,
  ticketUrl: null,
  review: 'REVIEW_REQUIRED',
  draft: false,
  updatedAt: daysAgo(0),
  ...over,
});

const review = (over: Partial<ReviewPr> = {}): ReviewPr => ({
  repo: 'orders-api',
  num: 88,
  title: 'retry the refund webhook',
  url: 'https://example.com/review/88',
  author: 'colleague',
  bot: false,
  draft: false,
  ticket: null,
  createdAt: daysAgo(6),
  updatedAt: daysAgo(1),
  lastCommitAt: daysAgo(1),
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

const row = (over: Partial<SlackRow> = {}): SlackRow => ({
  id: 'C1:1',
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

describe('PR lanes', () => {
  it('sorts by who is holding the ball, with drafts on their own', () => {
    expect(laneOf(pr({ draft: true, review: 'APPROVED' }))).toBe('drafts');
    expect(laneOf(pr({ review: 'APPROVED' }))).toBe('ready');
    expect(laneOf(pr({ review: 'CHANGES_REQUESTED' }))).toBe('needs-you');
    expect(laneOf(pr())).toBe('waiting');
  });

  it('counts idle days from the update, never negative', () => {
    expect(idleDays(daysAgo(3))).toBe(3);
    expect(idleDays(new Date(Date.now() + 60_000).toISOString())).toBe(0);
  });

  it('stays quiet for two days, then escalates', () => {
    expect(agingTone(1)).toBe('na');
    expect(agingTone(2)).toBe('warn');
    expect(agingTone(4)).toBe('bad');
  });

  it('says what is true and what it implies', () => {
    expect(reasonOf(pr({ draft: true }), 0)).toContain('mark it ready');
    expect(reasonOf(pr({ review: 'CHANGES_REQUESTED', unansweredThreads: 2 }), 0)).toBe(
      'changes requested · 2 comments unanswered',
    );
    expect(reasonOf(pr({ review: 'APPROVED', deployQc: { status: 'IDENTICAL', aheadBy: 0, behindBy: 0 } }), 0)).toBe(
      'approved · on QC — merge it',
    );
    expect(reasonOf(pr({ review: 'APPROVED', deployQc: { status: 'AHEAD', aheadBy: 1, behindBy: 0 } }), 0)).toBe(
      'approved — 1 commit not on deploy-qc yet',
    );
    expect(reasonOf(pr(), 5)).toBe('no review yet — 5 days, chase it');
    expect(reasonOf(pr(), 0)).toBe('waiting for a first review');
  });

  /* "They pushed" hid whether a person was involved: an auto-merge is nobody's move. */
  it('names the pusher, and only when it was not me', () => {
    const pushed = pr({
      review: 'COMMENTED',
      lastReviewAt: daysAgo(3),
      lastReworkAt: daysAgo(1),
      lastReworkBy: 'colleague',
    });
    expect(reasonOf(pushed, 1, 'you')).toContain('@colleague pushed after review');
    expect(reasonOf({ ...pushed, lastReworkBy: 'you' }, 1, 'you')).toContain('you pushed after review');
  });

  it('says a base-branch merge is not a re-review', () => {
    const synced = pr({
      review: 'COMMENTED',
      lastReviewAt: daysAgo(3),
      lastReworkAt: null,
      syncOnlySinceReview: true,
      lastReworkBy: 'colleague',
    });
    expect(reasonOf(synced, 1, 'you')).toBe(
      'reviewed — your move (a base-branch merge by @colleague since is not a re-review)',
    );
  });
});

describe('review lanes', () => {
  it('puts a bot PR out of the way of a colleague’s', () => {
    expect(laneOfReview(review({ bot: true, myReviewState: 'APPROVED', reworkCommits: 3 }))).toBe('bots');
  });

  /* The lane the review page exists for: my verdict is out of date. */
  it('pulls a reviewed PR back to "changed" only when real work landed', () => {
    expect(laneOfReview(review({ myReviewState: 'APPROVED', reworkCommits: 2 }))).toBe('changed');
    expect(laneOfReview(review({ myReviewState: 'APPROVED', reworkCommits: 0 }))).toBe('approved');
  });

  it('separates unseen, unanswered and quiet', () => {
    expect(laneOfReview(review())).toBe('unseen');
    expect(laneOfReview(review({ myReviewState: 'COMMENTED', myUnansweredThreads: 1 }))).toBe('unanswered');
    expect(laneOfReview(review({ myReviewState: 'COMMENTED' }))).toBe('quiet');
  });

  /*
   * Branch age and PR age are wildly different on an abandoned branch, and conflating them
   * made a three-year-old PR read as "requested 1009 days ago".
   */
  it('tells a stale PR from an urgent one', () => {
    expect(reasonOfReview(review(), 40, null, 60)).toBe('opened 60d ago, untouched since — probably dead');
    expect(reasonOfReview(review(), 1, null, 60)).toBe('opened 60d ago, never reviewed by you');
    expect(reasonOfReview(review(), 1, null, 3)).toBe('waiting 3 days for your first look');
    expect(reasonOfReview(review({ draft: true }), 1, null, 3)).toBe('requested, but still a draft');
  });

  it('says who pushed after the review, and how long ago I looked', () => {
    const changed = review({ myReviewState: 'APPROVED', reworkCommits: 2, reworkBy: 'colleague' });
    expect(reasonOfReview(changed, 1, 3, 6)).toBe(
      'you approved 3d ago, then @colleague pushed 2 commits — look again',
    );
  });

  it('distinguishes my approval from the PR being cleared', () => {
    expect(reasonOfReview(review({ myReviewState: 'APPROVED', reviewDecision: 'APPROVED' }), 1, 1, 6)).toBe(
      'approved and cleared — waiting on merge',
    );
    expect(reasonOfReview(review({ myReviewState: 'APPROVED' }), 1, 1, 6)).toBe(
      'you approved; somebody else has not',
    );
  });

  it('reports size, and calls a big diff big', () => {
    expect(sizeLabel(review({ size: { additions: 40, deletions: 8, files: 3 } }))).toContain('3 files');
    expect(sizeTone(review({ size: { additions: 20, deletions: 5, files: 2 } }))).toBe('na');
    expect(sizeTone(review({ size: { additions: 900, deletions: 200, files: 40 } }))).toBe('bad');
  });
});

describe('Slack lanes', () => {
  it('keeps bots and answered rows out of the queue', () => {
    expect(laneOfSlack(row({ bot: true }))).toBe('bots');
    expect(laneOfSlack(row({ lastFromMe: true }))).toBe('answered');
  });

  /* Age beats kind: a three-week-old DM belongs with the things being carried. */
  it('moves anything a week old into stale, DM or not', () => {
    expect(laneOfSlack(row({ kind: 'dm' }))).toBe('dms');
    expect(laneOfSlack(row({ kind: 'dm', lastAt: daysAgo(9) }))).toBe('stale');
    expect(laneOfSlack(row())).toBe('asked');
  });

  it('says who is waiting, where, and for how long', () => {
    expect(reasonOfSlack(row(), 0)).toBe('colleague asked today in the channel, no reply yet');
    expect(reasonOfSlack(row({ kind: 'dm' }), 2)).toBe('colleague asked 2 days ago in your DMs, no reply yet');
    expect(reasonOfSlack(row({ threadTs: '1', replies: 3, lastFrom: 'someone-else' }), 1)).toBe(
      'someone-else spoke last 1 day ago · 3 replies in a thread',
    );
    expect(reasonOfSlack(row({ lastFromMe: true }), 0)).toBe('you answered today');
  });
});
