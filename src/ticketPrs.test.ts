import { describe, expect, it } from 'vitest';
import type { OpenPr, Pr, PrsReport } from './types';
import { openPrIndex, reviewOf } from './ticketPrs';
import { prMark } from './format';

const ticketPr = (over: Partial<Pr> = {}): Pr => ({
  repo: 'orders-api',
  num: 77,
  url: 'https://github.com/example/orders-api/pull/77',
  state: 'open',
  ...over,
});

const openPr = (over: Partial<OpenPr> = {}): OpenPr => ({
  num: 77,
  title: 'SHOP-812 - cache the seller catalogue',
  url: 'https://github.com/example/orders-api/pull/77',
  ticket: 'SHOP-812',
  ticketUrl: 'https://jira.example.com/browse/SHOP-812',
  review: 'REVIEW_REQUIRED',
  draft: false,
  updatedAt: '2026-05-14T08:00:00Z',
  ...over,
});

const report = (prs: OpenPr[]): PrsReport => ({
  type: 'prs',
  date: '2026-05-14',
  generatedAt: '2026-05-14T08:00:00Z',
  author: 'me',
  repos: [{ repo: 'orders-api', prs }],
});

describe('reviewOf', () => {
  it('says what an open PR is waiting for, from the open-PR report', () => {
    const index = openPrIndex(report([openPr({ review: 'APPROVED' })]));
    expect(reviewOf(ticketPr(), index)).toMatchObject({
      state: 'approved',
      label: 'approved',
      short: 'approved',
      tone: 'ok',
    });
  });

  it('keeps changes-requested loud, and shortens it for a card', () => {
    const index = openPrIndex(report([openPr({ review: 'CHANGES_REQUESTED' })]));
    expect(reviewOf(ticketPr(), index)).toMatchObject({ short: 'changes', tone: 'bad' });
  });

  /*
   * The distinction a board card could not make before: nobody has looked yet, versus
   * somebody looked and the ball is mine.
   */
  it('separates "nobody has looked" from "reviewed, your move"', () => {
    const unseen = openPrIndex(report([openPr()]));
    expect(reviewOf(ticketPr(), unseen)?.state).toBe('awaiting-review');

    const commented = openPrIndex(
      report([openPr({ review: 'COMMENTED', lastReviewAt: '2026-05-13T09:00:00Z' })]),
    );
    expect(reviewOf(ticketPr(), commented)?.state).toBe('commented');
  });

  /* A merged PR's review is history; the ✓ and the deploy-qc warning are the live facts. */
  it('says nothing about a merged or closed PR', () => {
    const index = openPrIndex(report([openPr()]));
    expect(reviewOf(ticketPr({ state: 'merged' }), index)).toBeNull();
    expect(reviewOf(ticketPr({ state: 'closed' }), index)).toBeNull();
  });

  /* A draft has not been asked for review, which its own chip already says. */
  it('says nothing about a draft', () => {
    const index = openPrIndex(report([openPr({ draft: true, review: 'APPROVED' })]));
    expect(reviewOf(ticketPr(), index)).toBeNull();
  });

  /*
   * A PR the open report does not cover — another org, or past a page cap. The ticket's own
   * note is the coarse version of the same fact, and it is better than a guess.
   */
  it('falls back to the note the ticket carries', () => {
    const empty = openPrIndex(null);
    expect(reviewOf(ticketPr({ note: 'approved' }), empty)?.state).toBe('approved');
    expect(reviewOf(ticketPr({ note: 'changes requested' }), empty)?.state).toBe(
      'changes-requested',
    );
  });

  /*
   * And nothing at all where nothing is known. "Awaiting review" for a PR nobody has looked
   * *for* is the confident wrong answer this dashboard exists to avoid.
   */
  it('says nothing when neither the report nor the note knows', () => {
    expect(reviewOf(ticketPr(), openPrIndex(null))).toBeNull();
    expect(reviewOf(ticketPr({ note: 'draft' }), openPrIndex(null))).toBeNull();
  });

  it('prefers the report over the note, since the report knows more', () => {
    const index = openPrIndex(
      report([openPr({ review: 'CHANGES_REQUESTED' })]),
    );
    expect(reviewOf(ticketPr({ note: 'approved' }), index)?.state).toBe('changes-requested');
  });

  it('indexes by the repo and number a ticket names, ignoring the owner prefix', () => {
    const index = openPrIndex(report([openPr()]));
    expect(index.has('orders-api#77')).toBe(true);
    expect(reviewOf(ticketPr({ num: 999 }), index)).toBeNull();
  });
});

describe('prMark', () => {
  /*
   * Three states used to share two glyphs, with colour carrying the difference — and a closed
   * PR beside an open one that now shows a review chip read as "open, nobody has looked".
   */
  it('gives each state its own mark', () => {
    expect(prMark('merged')).toBe('✓');
    expect(prMark('open')).toBe('◌');
    expect(prMark('closed')).toBe('✕');
  });
});
