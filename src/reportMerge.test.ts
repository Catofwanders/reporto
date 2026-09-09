import { describe, expect, it } from 'vitest';
import { shouldReplace } from './reportMerge';

const complete = (date: string) => ({ date });
const partial = (date: string) => ({ date, partial: true });

describe('shouldReplace', () => {
  /** The whole point: the fast pass must not strip today's PR chips and ages back to skeletons. */
  it('keeps a complete report rather than replacing it with the same day, half-fetched', () => {
    expect(shouldReplace(complete('2026-09-09'), partial('2026-09-09'))).toBe(false);
  });

  /** The complete report is yesterday's; today's board with gaps is the better answer. */
  it('takes a partial report for a newer day', () => {
    expect(shouldReplace(complete('2026-09-08'), partial('2026-09-09'))).toBe(true);
  });

  /** Nothing on screen, or nothing complete on screen: something beats a blank page. */
  it('takes a partial report when there is nothing complete to lose', () => {
    expect(shouldReplace(null, partial('2026-09-09'))).toBe(true);
    expect(shouldReplace(partial('2026-09-09'), partial('2026-09-09'))).toBe(true);
  });

  /** A complete report always lands — that is the pass everything is waiting for. */
  it('always takes a complete report', () => {
    expect(shouldReplace(complete('2026-09-09'), complete('2026-09-09'))).toBe(true);
    expect(shouldReplace(partial('2026-09-09'), complete('2026-09-09'))).toBe(true);
  });
});
