import { describe, expect, it } from 'vitest';
import type { ReviewLaneId, ReviewRow } from './reviewLanes';
import { reviewMix } from './reviewMix';

let seq = 0;

const rows = (lane: ReviewLaneId, n: number): ReviewRow[] =>
  Array.from({ length: n }, () => {
    seq += 1;
    return {
      pr: {
        repo: 'shop-web',
        num: seq,
        title: `SHOP-${seq} - a change`,
        url: `https://example.test/${lane}/${seq}`,
        author: 'colleague',
      },
      reason: `${lane} reason`,
    } as ReviewRow;
  });

const lanes = (counts: Partial<Record<ReviewLaneId, number>>) => {
  seq = 0;
  const map = new Map<ReviewLaneId, ReviewRow[]>();
  for (const [lane, n] of Object.entries(counts)) {
    map.set(lane as ReviewLaneId, rows(lane as ReviewLaneId, n));
  }
  return map;
};

describe('reviewMix', () => {
  /**
   * The card exists to answer "whose move is it", so the two lanes that need me to read
   * something are one number and everything else is not.
   */
  it('counts only the lanes that need a look from me as needs-you', () => {
    const parts = reviewMix(lanes({ changed: 2, unseen: 1, unanswered: 3, approved: 1, quiet: 4 }));
    expect(parts.map((part) => [part.id, part.count])).toEqual([
      ['needs-you', 3],
      ['waiting', 8],
    ]);
  });

  /**
   * You already said your part on an unanswered thread — putting it in "needs you" made the
   * card demand work that is the author's to do.
   */
  it('leaves unanswered comments of mine with the ones waiting on others', () => {
    const [part] = reviewMix(lanes({ unanswered: 1 }));
    expect(part.id).toBe('waiting');
  });

  /** A queue of dependency bumps must not read as reviews to do. */
  it('keeps automation as its own segment', () => {
    const parts = reviewMix(lanes({ unseen: 1, bots: 5 }));
    expect(parts.map((part) => part.id)).toEqual(['needs-you', 'bots']);
    expect(parts[1].count).toBe(5);
  });

  /** Folding six lanes into three hides their names unless the segment carries them. */
  it('names the lanes behind a folded segment', () => {
    const [part] = reviewMix(lanes({ changed: 2, unseen: 1 }));
    expect(part.detail).toBe('2 changed since you looked, 1 never looked at');
  });

  /**
   * The popup is the only place these rows are named, so it carries the handle, the title and
   * whose PR it is — a count nobody can attach to a PR is what the legend already said.
   */
  it('names each PR behind a segment, with its author', () => {
    const [part] = reviewMix(lanes({ unseen: 1 }));
    expect(part.items).toEqual([
      {
        id: 'https://example.test/unseen/1',
        name: 'shop-web#1',
        title: 'SHOP-1 - a change',
        author: 'colleague',
        note: 'unseen reason',
      },
    ]);
  });

  /** An empty group is decoration: a zero-width segment with a legend entry nobody needs. */
  it('drops groups with nothing in them', () => {
    expect(reviewMix(lanes({}))).toEqual([]);
    expect(reviewMix(lanes({ bots: 1 })).map((part) => part.id)).toEqual(['bots']);
  });
});
