import { describe, expect, it } from 'vitest';
import { timeAgo } from './timeAgo';

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

describe('timeAgo', () => {
  /* "never" is a real state: a fresh checkout has no reports, a ticket has no comments. */
  it('says never for nothing at all, including an unreadable stamp', () => {
    expect(timeAgo(undefined)).toBe('never');
    expect(timeAgo(null)).toBe('never');
    expect(timeAgo('whenever')).toBe('never');
  });

  it('counts minutes inside the hour and hours inside the day', () => {
    expect(timeAgo(minutesAgo(0))).toBe('just now');
    expect(timeAgo(minutesAgo(20))).toBe('20m ago');
    expect(timeAgo(minutesAgo(150))).toBe('3h ago');
  });

  it('falls back to the date once it is more than a day old', () => {
    expect(timeAgo('2026-05-14T09:00:00Z')).toMatch(/\d{2} \w{3}/);
  });
});
