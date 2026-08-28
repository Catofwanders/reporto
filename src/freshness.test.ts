import { describe, expect, it } from 'vitest';
import { FRESH_MINUTES, freshnessLabel, isStale, kindsForRoute, minutesSince } from './freshness';
import { REPORT_KINDS } from './reportKinds';

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

describe('kindsForRoute', () => {
  it('fetches only what the route actually shows', () => {
    expect(kindsForRoute('/jira')).toEqual(['jira']);
    expect(kindsForRoute('/slack')).toEqual(['slack']);
    expect(kindsForRoute('/stats')).toEqual(['stats']);
  });

  it('gives the dashboard everything it draws from', () => {
    expect(kindsForRoute('/')).toEqual(['jira', 'prs', 'reviews', 'slack', 'calendar']);
  });

  /* The review queue reads ticket status for its rows, so a stale board shows up there too. */
  it('includes the board with the review queue', () => {
    expect(kindsForRoute('/reviews')).toEqual(['reviews', 'jira']);
  });

  it('matches a deep link the same as its page', () => {
    expect(kindsForRoute('/prs#example/orders-api-77')).toEqual(['prs']);
    expect(kindsForRoute('/projects/orders-api')).toEqual(['jira', 'prs']);
  });

  it('asks for nothing on a route that shows no report', () => {
    expect(kindsForRoute('/settings')).toEqual([]);
    expect(kindsForRoute('/commands')).toEqual([]);
  });
});

describe('isStale', () => {
  it('holds a report until its own ceiling', () => {
    expect(isStale('slack', minutesAgo(4))).toBe(false);
    expect(isStale('slack', minutesAgo(6))).toBe(true);
    expect(isStale('jira', minutesAgo(6))).toBe(false);
    expect(isStale('stats', minutesAgo(600))).toBe(false);
  });

  /*
   * Undefined means "no report of this kind at all", which is stale by definition. The caller
   * is what stops that from firing on a fresh checkout — see LiveRefresh, which waits until
   * something has loaded.
   */
  it('treats a missing stamp as infinitely old', () => {
    expect(minutesSince(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(isStale('calendar', undefined)).toBe(true);
  });

  /*
   * An unreadable stamp used to read as fresh for ever: `NaN >= ceiling` is false, so
   * `LiveRefresh` never refetched that kind and a broken report looked current.
   */
  it('treats an unreadable stamp as infinitely old, not as fresh', () => {
    expect(minutesSince('not-a-date')).toBe(Number.POSITIVE_INFINITY);
    expect(isStale('slack', 'not-a-date')).toBe(true);
    expect(isStale('stats', '')).toBe(true);
  });

  it('gives every kind a ceiling, so a new report cannot be forgotten', () => {
    for (const kind of REPORT_KINDS) expect(FRESH_MINUTES[kind]).toBeGreaterThan(0);
  });

  /* The fast sources must not be given the slow ones' patience. */
  it('keeps Slack and PRs tighter than the board, and the board tighter than statistics', () => {
    expect(FRESH_MINUTES.slack).toBeLessThan(FRESH_MINUTES.jira);
    expect(FRESH_MINUTES.prs).toBeLessThan(FRESH_MINUTES.jira);
    expect(FRESH_MINUTES.jira).toBeLessThan(FRESH_MINUTES.stats);
  });
});

describe('freshnessLabel', () => {
  it('says it in the shortest form that is still true', () => {
    expect(freshnessLabel('slack')).toBe('5 min');
    expect(freshnessLabel('calendar')).toBe('2 h');
    expect(freshnessLabel('stats')).toBe('1 day');
  });
});
