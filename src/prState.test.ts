import { describe, expect, it } from 'vitest';
import type { OpenPr } from './types';
import { awaitingOthers, onQc, prState, qcChip } from './prState';

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

  /* BEHIND just means QC moved on since — that is the normal state of a deployed branch. */
  it('reads zero commits ahead as deployed, however far QC has moved on', () => {
    expect(qcChip({ status: 'BEHIND', aheadBy: 0, behindBy: 12 })?.label).toBe('on QC');
    expect(qcChip({ status: 'IDENTICAL', aheadBy: 0, behindBy: 0 })?.tone).toBe('qc');
  });

  it('counts what QC is missing, singular and plural', () => {
    expect(qcChip({ status: 'AHEAD', aheadBy: 1, behindBy: 0, aheadWork: 1 })?.title).toBe(
      '1 commit of this PR is not in deploy-qc',
    );
    expect(qcChip({ status: 'AHEAD', aheadBy: 2, behindBy: 0, aheadWork: 2 })?.title).toBe(
      '2 commits of this PR are not in deploy-qc',
    );
    expect(qcChip({ status: 'DIVERGED', aheadBy: 3, behindBy: 2, aheadWork: 3 })?.label).toBe(
      'off QC · 3',
    );
  });

  /*
   * The fallback figure is the divergence of two branches, not a claim about this PR, and the
   * tooltip has to stop short of making one — that overstatement is the bug it stands in for.
   */
  it('says the count is unread rather than the PR\'s when the work split is unknown', () => {
    const chip = qcChip({ status: 'AHEAD', aheadBy: 4, behindBy: 0 });
    expect(chip?.label).toBe('off QC · 4');
    expect(chip?.title).toBe(
      "this branch is 4 commits ahead of deploy-qc; which of them are this PR's own could not be read",
    );
  });

  /*
   * The bug this rule exists for: an approved PR whose change was on QC read "off QC · 1"
   * because the one commit deploy-qc lacked was a merge of main left by Update branch. The
   * chip contradicted the environment, and the same count drove the flow-check warning.
   */
  it('is on QC when every commit deploy-qc lacks is a base-branch merge', () => {
    const chip = qcChip({ status: 'DIVERGED', aheadBy: 1, behindBy: 29, aheadWork: 0 });
    expect(chip?.label).toBe('on QC');
    expect(chip?.title).toBe(
      "every commit of this PR is in deploy-qc; the 1 commit this branch has on top is other people's work or a base-branch merge",
    );
  });

  /*
   * The case that reads worst when it is wrong: deploy-qc is built by cherry-picking, so the
   * work is there under different ids and the comparison says the branch is ahead. Saying
   * "off QC" there sends somebody to deploy what is already deployed.
   */
  it('says how the work was found when deploy-qc holds a copy rather than the commit', () => {
    const chip = qcChip({
      status: 'DIVERGED',
      aheadBy: 10,
      behindBy: 413,
      aheadWork: 0,
      qcMatch: 'content',
    });
    expect(chip?.label).toBe('on QC');
    expect(chip?.title).toBe(
      "deploy-qc carries this PR's commits under different ids — cherry-picked or squashed onto it",
    );
  });

  /* A sync merge sitting on top of real work does not excuse the work. */
  it('counts only the work commits when some of both are ahead', () => {
    expect(qcChip({ status: 'DIVERGED', aheadBy: 3, behindBy: 4, aheadWork: 2 })?.label).toBe(
      'off QC · 2',
    );
  });

  /* Absent means the puller could not say, and a guess of "deployed" would be the worse one. */
  it('falls back to the raw count when the work split is unknown', () => {
    expect(qcChip({ status: 'AHEAD', aheadBy: 1, behindBy: 0 })?.label).toBe('off QC · 1');
  });
});

describe('onQc', () => {
  /* Every consumer asks this one question, so they cannot drift apart on the answer. */
  it('answers null with nothing to compare, and reads the work count otherwise', () => {
    expect(onQc(null)).toBeNull();
    expect(onQc({ status: 'BEHIND', aheadBy: 0, behindBy: 3 })).toBe(true);
    expect(onQc({ status: 'DIVERGED', aheadBy: 1, behindBy: 29, aheadWork: 0 })).toBe(true);
    expect(onQc({ status: 'AHEAD', aheadBy: 1, behindBy: 0 })).toBe(false);
  });
});
