import { describe, expect, it } from 'vitest';
import { activeDismissals, isDone, markDone, readDone, undoDone } from './slackDone';

const NOW = new Date('2026-08-31T22:30:00+03:00');
const today = NOW.toLocaleDateString('en-CA');

describe('slackDone', () => {
  it('marks a row done and keeps the others alone', () => {
    const marks = markDone('C1:2', markDone('C1:1', {}, NOW), NOW);
    expect(isDone('C1:1', marks)).toBe(true);
    expect(isDone('C1:3', marks)).toBe(false);
    expect(marks['C1:1']).toBe(today);
  });

  it('undoes one without touching the rest', () => {
    const marks = markDone('C1:2', markDone('C1:1', {}, NOW), NOW);
    expect(Object.keys(undoDone('C1:1', marks, NOW))).toEqual(['C1:2']);
  });

  /* A dismissal outlives nothing: the report only holds a fortnight, so the mark expires. */
  it('drops dismissals older than the retention window', () => {
    const stale = { 'C1:old': '2026-01-01', 'C1:live': today };
    expect(activeDismissals(stale, NOW)).toEqual({ 'C1:live': today });
  });

  /*
   * Local dates, not `toISOString()`: at a positive offset the ISO date of a late-evening
   * mark is tomorrow's, which would make it expire a day early.
   */
  it('stores the local calendar date, set late in the evening', () => {
    expect(markDone('C1:1', {}, NOW)['C1:1']).toBe(NOW.toLocaleDateString('en-CA'));
  });

  it('falls back to nothing dismissed when storage is unavailable', () => {
    expect(readDone(NOW)).toEqual({});
  });
});
