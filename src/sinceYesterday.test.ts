import { describe, expect, it } from 'vitest';
import type { JiraReport, OpenPr, PrsReport, ReportIndex, Ticket } from './types';
import { previousFiles, sinceYesterday } from './sinceYesterday';

const ticket = (key: string, status: string): Ticket => ({
  key,
  url: `https://jira.example.com/browse/${key}`,
  status,
  chip: 'na',
  summary: 'basket totals ignore the seller discount',
  prs: [],
  notes: [],
});

const jira = (tickets: Ticket[]): JiraReport => ({
  type: 'jira',
  date: '2026-05-14',
  generatedAt: '2026-05-14T08:00:00Z',
  groups: [{ title: 'board', tickets }],
});

const pr = (num: number, over: Partial<OpenPr> = {}): OpenPr => ({
  num,
  title: `SHOP-1 - something`,
  url: `https://github.com/example/orders-api/pull/${num}`,
  ticket: 'SHOP-1',
  ticketUrl: 'https://jira.example.com/browse/SHOP-1',
  review: 'REVIEW_REQUIRED',
  draft: false,
  updatedAt: '2026-05-14T08:00:00Z',
  ...over,
});

const prs = (list: OpenPr[]): PrsReport => ({
  type: 'prs',
  date: '2026-05-14',
  generatedAt: '2026-05-14T08:00:00Z',
  author: 'me',
  repos: [{ repo: 'orders-api', prs: list }],
});

describe('previousFiles', () => {
  const index: ReportIndex = {
    latest: { jira: 'jira-2026-05-14.json' },
    history: [
      { date: '2026-05-14', jira: 'jira-2026-05-14.json', prs: 'prs-2026-05-14.json' },
      // A morning where the pull failed: no jira, no prs. Skipped rather than read as an
      // empty yesterday, which would report the whole board as having arrived overnight.
      { date: '2026-05-13', slack: 'slack-2026-05-13.json' },
      { date: '2026-05-12', jira: 'jira-2026-05-12.json' },
    ],
  };

  it('finds the most recent day that is not today', () => {
    expect(previousFiles(index, '2026-05-14')).toEqual({
      date: '2026-05-12',
      jira: 'jira-2026-05-12.json',
      prs: undefined,
    });
  });

  it('has no answer when there is no earlier day', () => {
    expect(previousFiles({ latest: {}, history: [] }, '2026-05-14')).toEqual({ date: null });
  });
});

describe('sinceYesterday', () => {
  it('says nothing at all when there is no earlier report', () => {
    const now = { jira: jira([ticket('SHOP-1', 'In Progress')]), prs: null };
    expect(sinceYesterday({ date: null, jira: null, prs: null }, now)).toEqual({
      date: null,
      changes: [],
    });
  });

  /*
   * The half that is missing from yesterday must be skipped, not compared against nothing —
   * a missing PR report would otherwise read as "every open PR was opened today".
   */
  it('compares only the halves both days have', () => {
    const report = sinceYesterday(
      { date: '2026-05-13', jira: null, prs: null },
      { jira: jira([ticket('SHOP-1', 'In Progress')]), prs: prs([pr(1)]) },
    );
    expect(report.changes).toEqual([]);
  });

  it('reports a ticket that moved, with both statuses', () => {
    const report = sinceYesterday(
      { date: '2026-05-13', jira: jira([ticket('SHOP-1', 'In Progress')]), prs: null },
      { jira: jira([ticket('SHOP-1', 'In Review')]), prs: null },
    );
    expect(report.changes).toEqual([
      {
        id: 'ticket:SHOP-1',
        source: 'ticket',
        label: 'SHOP-1',
        what: 'IN PROGRESS → IN REVIEW',
        to: '/jira#SHOP-1',
        tone: 'na',
      },
    ]);
  });

  it('puts arrivals before moves and departures', () => {
    const report = sinceYesterday(
      {
        date: '2026-05-13',
        jira: jira([ticket('SHOP-1', 'In Progress'), ticket('SHOP-9', 'In Review')]),
        prs: null,
      },
      { jira: jira([ticket('SHOP-1', 'In Review'), ticket('SHOP-2', 'To Do')]), prs: null },
    );
    expect(report.changes.map((change) => change.what)).toEqual([
      'arrived in TO DO',
      'IN PROGRESS → IN REVIEW',
      'left your board',
    ]);
  });

  it('reports an opened PR, and one that is no longer open', () => {
    const report = sinceYesterday(
      { date: '2026-05-13', jira: null, prs: prs([pr(1)]) },
      { jira: null, prs: prs([pr(2)]) },
    );
    expect(report.changes.map((change) => [change.label, change.what])).toEqual([
      ['orders-api#2', 'opened'],
      // Which of the two is not knowable from these files, and guessing is worse than saying so.
      ['orders-api#1', 'merged or closed'],
    ]);
  });

  it('reports a review verdict landing, and marks changes-requested as the loud one', () => {
    const report = sinceYesterday(
      { date: '2026-05-13', jira: null, prs: prs([pr(1)]) },
      { jira: null, prs: prs([pr(1, { review: 'CHANGES_REQUESTED' })]) },
    );
    expect(report.changes[0].what).toBe('now changes requested');
    expect(report.changes[0].tone).toBe('warn');
  });

  it('reports a draft becoming ready', () => {
    const report = sinceYesterday(
      { date: '2026-05-13', jira: null, prs: prs([pr(1, { draft: true })]) },
      { jira: null, prs: prs([pr(1)]) },
    );
    expect(report.changes.map((change) => change.what)).toContain('ready for review');
  });

  it('says nothing about a day where nothing moved', () => {
    const same = { jira: jira([ticket('SHOP-1', 'In Progress')]), prs: prs([pr(1)]) };
    const report = sinceYesterday({ date: '2026-05-13', ...same }, same);
    expect(report).toEqual({ date: '2026-05-13', changes: [] });
  });
});
