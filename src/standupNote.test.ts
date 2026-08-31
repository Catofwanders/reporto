import { describe, expect, it } from 'vitest';
import type { CalendarReport, JiraReport, StandupSince } from './types';
import { buildStandup, standupText } from './standupNote';
import { statusVocab } from './statusVocab';

const since = (over: Partial<StandupSince> = {}): StandupSince => ({
  since: '2026-05-18',
  generatedAt: '2026-05-20T08:00:00Z',
  moved: [{ key: 'SHOP-1', from: 'In Progress', to: 'In Review', steps: 1, at: '2026-05-19T09:00:00Z' }],
  merged: [
    {
      repo: 'orders-api',
      num: 77,
      title: 'cache the seller catalogue',
      url: 'https://github.com/example/orders-api/pull/77',
      mergedAt: '2026-05-19T10:00:00Z',
    },
  ],
  notes: [],
  ...over,
});

const jira: JiraReport = {
  type: 'jira',
  date: '2026-05-20',
  generatedAt: '2026-05-20T08:00:00Z',
  groups: [
    {
      title: 'In Progress',
      tickets: [
        {
          key: 'SHOP-2',
          url: 'https://jira.example.com/browse/SHOP-2',
          status: 'In Progress',
          chip: 'open',
          summary: 'move the payout report off the nightly scheduler',
          prs: [],
          notes: [],
        },
      ],
    },
  ],
};

const calendar: CalendarReport = {
  type: 'calendar',
  date: '2026-05-20',
  generatedAt: '2026-05-20T08:00:00Z',
  events: [
    {
      source: 'google',
      calendar: 'Work',
      title: 'Daily stand-up',
      kind: 'meeting',
      start: '2026-05-20T09:00:00+02:00',
      end: '2026-05-20T09:15:00+02:00',
    },
  ],
  upcoming: [],
  summary: '1 today',
};

/** The marketplace's own words, through the same merge the app uses. */
const vocab = statusVocab({ groups: { inFlight: ['In Progress'] } });

describe('buildStandup', () => {
  it('carries yesterday, today and the calendar for a stand-up', () => {
    const note = buildStandup(since(), jira, null, calendar, {}, [], vocab);
    expect(note.span).toBe('day');
    expect(note.yesterday).toEqual([
      'SHOP-1 — IN PROGRESS → IN REVIEW',
      'merged orders-api#77 — cache the seller catalogue',
    ]);
    expect(note.today.some((line) => line.includes('Daily stand-up'))).toBe(true);
  });

  /*
   * Today's meetings are noise in a weekly wrap: by the time anybody reads it those hours are
   * spent, and five calendar lines bury the four things that actually shipped.
   */
  it('leaves today’s meetings out of a weekly wrap', () => {
    const note = buildStandup(since({ span: 'week' }), jira, null, calendar, {}, [], vocab);
    expect(note.span).toBe('week');
    expect(note.today.some((line) => line.includes('Daily stand-up'))).toBe(false);
    expect(note.today).toContain('SHOP-2 — move the payout report off the nightly scheduler (IN PROGRESS)');
  });
});

describe('standupText', () => {
  it('titles the sections for the window it covers', () => {
    const day = standupText(buildStandup(since(), jira, null, calendar, {}, [], vocab));
    expect(day).toContain('Since 2026-05-18');
    expect(day).toContain('Today');

    const week = standupText(buildStandup(since({ span: 'week' }), jira, null, calendar, {}, [], vocab));
    expect(week).toContain('Done since 2026-05-18');
    expect(week).toContain('Still in flight');
  });

  it('says "nothing" rather than leaving a section blank', () => {
    const text = standupText(buildStandup(since({ moved: [], merged: [] }), null, null, null, {}, [], vocab));
    expect(text).toContain('- nothing');
  });
});
