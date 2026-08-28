import { describe, expect, it } from 'vitest';
import type { OpenPr } from './types';
import { awaitingOthers, prState, qcChip } from './prState';

const at = (iso: string) => new Date(iso).toISOString();

const pr = (over: Partial<OpenPr> = {}): OpenPr => ({
  num: 1,
  title: 'cache the seller catalogue',
  url: 'https://example.com/pr/1',
  ticket: null,
  ticketUrl: null,
  review: 'REVIEW_REQUIRED',
  draft: false,
  updatedAt: at('2026-05-14T09:00:00Z'),
  ...over,
});

describe('prState', () => {
  it('reports the two verdicts as themselves', () => {
    expect(prState(pr({ review: 'APPROVED' }))).toBe('approved');
    expect(prState(pr({ review: 'CHANGES_REQUESTED' }))).toBe('changes-requested');
  });

  it('is awaiting review when nobody has looked', () => {
    expect(prState(pr())).toBe('awaiting-review');
  });

  /*
   * The distinction the whole module exists for: GitHub reports both of these as COMMENTED,
   * and a list that renders them the same way cannot say whether the ball is mine.
   */
  it('stays on me when a review landed and nothing was pushed after it', () => {
    const reviewed = pr({
      review: 'COMMENTED',
      lastReviewAt: at('2026-05-14T10:00:00Z'),
      lastCommitAt: at('2026-05-14T09:00:00Z'),
      lastReworkAt: null,
      syncOnlySinceReview: false,
    });
    expect(prState(reviewed)).toBe('commented');
  });

  it('goes back to the reviewer when work landed after the review', () => {
    const pushed = pr({
      review: 'COMMENTED',
      lastReviewAt: at('2026-05-14T10:00:00Z'),
      lastReworkAt: at('2026-05-14T11:00:00Z'),
      syncOnlySinceReview: false,
    });
    expect(prState(pushed)).toBe('awaiting-re-review');
  });

  /*
   * The bug this pins: a base-branch merge is not work a reviewer has to re-read, and letting
   * it flip the state moved a PR out of "needs you" while the ball was still mine.
   */
  it('does not count a base-branch merge as a push', () => {
    const synced = pr({
      review: 'COMMENTED',
      lastReviewAt: at('2026-05-14T10:00:00Z'),
      lastCommitAt: at('2026-05-14T12:00:00Z'),
      lastReworkAt: null,
      syncOnlySinceReview: true,
    });
    expect(prState(synced)).toBe('commented');
  });

  /*
   * And its mirror: absent is "the puller never carried this", which is not the same as an
   * explicit null. An old report only knows the tip commit, so that is still the best guess.
   */
  it('falls back to the tip commit when the report predates rework tracking', () => {
    const old = pr({
      review: 'COMMENTED',
      lastReviewAt: at('2026-05-14T10:00:00Z'),
      lastCommitAt: at('2026-05-14T12:00:00Z'),
    });
    expect(prState(old)).toBe('awaiting-re-review');
  });

  it('treats a review with no timestamp as reviewed rather than inventing a push', () => {
    expect(prState(pr({ review: 'COMMENTED' }))).toBe('commented');
  });
});

describe('awaitingOthers', () => {
  it('is true only where somebody else is holding it', () => {
    expect(awaitingOthers(pr())).toBe(true);
    expect(
      awaitingOthers(
        pr({ review: 'COMMENTED', lastReviewAt: at('2026-05-14T10:00:00Z'), lastReworkAt: null }),
      ),
    ).toBe(false);
    expect(awaitingOthers(pr({ review: 'APPROVED' }))).toBe(false);
  });

  it('excludes drafts, which nobody can review', () => {
    expect(awaitingOthers(pr({ draft: true }))).toBe(false);
  });
});

describe('qcChip', () => {
  it('says nothing when there is no comparison to report', () => {
    expect(qcChip(null)).toBeNull();
    expect(qcChip(undefined)).toBeNull();
  });

  /* aheadBy is the only field that matters: BEHIND just means QC moved on since. */
  it('reads zero commits ahead as deployed, however far QC has moved on', () => {
    expect(qcChip({ status: 'BEHIND', aheadBy: 0, behindBy: 12 })?.label).toBe('on QC');
    expect(qcChip({ status: 'IDENTICAL', aheadBy: 0, behindBy: 0 })?.tone).toBe('qc');
  });

  it('counts what QC is missing, singular and plural', () => {
    expect(qcChip({ status: 'AHEAD', aheadBy: 1, behindBy: 0 })?.title).toBe(
      '1 commit on this branch is not in deploy-qc',
    );
    expect(qcChip({ status: 'AHEAD', aheadBy: 2, behindBy: 0 })?.title).toBe(
      '2 commits on this branch are not in deploy-qc',
    );
    expect(qcChip({ status: 'DIVERGED', aheadBy: 3, behindBy: 2 })?.label).toBe('off QC · 3');
  });
});
