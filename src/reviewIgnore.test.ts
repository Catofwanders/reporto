import { describe, expect, it } from 'vitest';
import type { ReviewPr, ReviewsReport } from './types';
import {
  activeIgnores,
  ignoreReview,
  isIgnored,
  splitIgnored,
  unignoreReview,
} from './reviewIgnore';

const NOW = new Date('2026-09-09T22:40:00+03:00');
const today = NOW.toLocaleDateString('en-CA');

const pr = (num: number, over: Partial<ReviewPr> = {}): ReviewPr =>
  ({
    repo: 'shop-web',
    num,
    title: `SHOP-${num} - a change`,
    url: `https://github.test/shop-web/pull/${num}`,
    author: 'colleague',
    bot: false,
    draft: false,
    ticket: null,
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-08T09:00:00Z',
    lastCommitAt: '2026-09-08T09:00:00Z',
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
  }) as ReviewPr;

const report = (prs: ReviewPr[]): ReviewsReport => ({
  type: 'reviews',
  date: '2026-09-09',
  generatedAt: '2026-09-09T08:00:00Z',
  reviewer: 'me',
  prs,
});

describe('reviewIgnore', () => {
  it('ignores one PR by url and leaves the rest alone', () => {
    const marks = ignoreReview('https://github.test/shop-web/pull/1', {}, NOW);
    expect(isIgnored('https://github.test/shop-web/pull/1', marks)).toBe(true);
    expect(isIgnored('https://github.test/shop-web/pull/2', marks)).toBe(false);
  });

  /* The way back has to exist: an ignore is a display decision, not a verdict on the work. */
  it('puts one back without touching the others', () => {
    const two = ignoreReview('b', ignoreReview('a', {}, NOW), NOW);
    expect(Object.keys(unignoreReview('a', two, NOW))).toEqual(['b']);
  });

  /*
   * The mark expires — "not this month" rather than "never". A PR still open and still
   * requested after the window is worth seeing again, and a set that never shrinks would go
   * on hiding rows whose subject merged long ago.
   */
  it('drops ignores older than the window', () => {
    expect(activeIgnores({ old: '2026-01-01', live: today }, NOW)).toEqual({ live: today });
  });

  /*
   * Local dates, not `toISOString()`: at a positive offset the ISO date of a late-evening
   * mark is tomorrow's, which would expire it a day early.
   */
  it('stores the local calendar date, set late in the evening', () => {
    expect(ignoreReview('a', {}, NOW).a).toBe('2026-09-09');
  });

  /*
   * Both halves come back, because every count on the page derives from the report: the views
   * get the filtered one, and the page still says how many were taken out.
   */
  it('splits the report into what is kept and what was ignored', () => {
    const marks = ignoreReview('https://github.test/shop-web/pull/2', {}, NOW);
    const { kept, ignored } = splitIgnored(report([pr(1), pr(2), pr(3)]), marks);
    expect(kept.prs.map((p) => p.num)).toEqual([1, 3]);
    expect(ignored.map((p) => p.num)).toEqual([2]);
  });

  /* Nothing ignored means the same object back — no needless re-render of every lane. */
  it('returns the report itself when nothing is ignored', () => {
    const full = report([pr(1)]);
    expect(splitIgnored(full, {}).kept).toBe(full);
  });
});
