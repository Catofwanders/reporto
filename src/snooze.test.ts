import { describe, expect, it } from 'vitest';
import { activeSnoozes, isSnoozed, readSnoozes, snooze, wake } from './snooze';

const NOW = new Date('2026-08-31T22:30:00+03:00');
const local = (at: Date) => at.toLocaleDateString('en-CA');
const today = local(NOW);
const tomorrow = local(new Date(NOW.getTime() + 86_400_000));

describe('snooze', () => {
  /*
   * The bug this exists to prevent: `toISOString().slice(0, 10)` on local midnight is
   * yesterday at any positive offset, so a snooze set in the evening woke immediately.
   */
  it('lasts until tomorrow, set late in the evening', () => {
    const marks = snooze('pr:1', {}, NOW);
    expect(marks['pr:1']).toBe(tomorrow);
    expect(isSnoozed('pr:1', marks, NOW)).toBe(true);
  });

  it('wakes on the day it names, not before', () => {
    const marks = snooze('pr:1', {}, NOW);
    const nextMorning = new Date('2026-09-01T08:00:00+03:00');
    expect(isSnoozed('pr:1', marks, nextMorning)).toBe(false);
  });

  it('says nothing about rows it has never seen', () => {
    expect(isSnoozed('pr:2', snooze('pr:1', {}, NOW), NOW)).toBe(false);
  });

  it('drops woken entries rather than growing forever', () => {
    const stale = { 'pr:old': today, 'pr:older': '2026-01-01', 'pr:live': tomorrow };
    expect(activeSnoozes(stale, NOW)).toEqual({ 'pr:live': tomorrow });
  });

  it('wakes one row without touching the others', () => {
    const marks = snooze('pr:2', snooze('pr:1', {}, NOW), NOW);
    expect(Object.keys(wake('pr:1', marks, NOW))).toEqual(['pr:2']);
  });

  /* No storage at all is the same as nothing snoozed — the queue must never come up empty. */
  it('falls back to nothing snoozed when storage is unavailable', () => {
    expect(readSnoozes(NOW)).toEqual({});
  });
});
