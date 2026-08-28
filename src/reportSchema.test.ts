import { describe, expect, it } from 'vitest';
import { assertReport } from './reportSchema';
import type { ReportKind } from './reportKinds';

/**
 * These files are written by agent runs, not by this app, so a half-written or renamed-field
 * report is a normal failure mode rather than a bug. What the guards buy is *which* report is
 * broken: without them a missing array surfaces as a render crash with no kind attached.
 */
const good: Record<ReportKind, unknown> = {
  jira: { date: '2026-05-14', groups: [{ title: 'In Progress', tickets: [{ key: 'SHOP-1', prs: [] }] }] },
  calendar: { date: '2026-05-14', events: [], upcoming: [] },
  prs: { date: '2026-05-14', repos: [{ repo: 'orders-api', prs: [] }] },
  reviews: { date: '2026-05-14', prs: [{ num: 7, repo: 'orders-api' }] },
  slack: {
    date: '2026-05-14',
    rows: [{ id: 'C1:1', kind: 'mention', lastFromMe: false }],
  },
  stats: { months: [{ month: '2026-05' }] },
};

describe('assertReport', () => {
  it.each(Object.keys(good) as ReportKind[])('accepts a well-formed %s report', (kind) => {
    expect(() => assertReport(kind, good[kind])).not.toThrow();
  });

  it.each(Object.keys(good) as ReportKind[])('names the kind when a %s report is not an object', (kind) => {
    expect(() => assertReport(kind, null)).toThrow(`${kind} report is malformed`);
    expect(() => assertReport(kind, 'a string')).toThrow(`${kind} report is malformed`);
  });

  it('rejects a jira report whose tickets are not walkable', () => {
    expect(() => assertReport('jira', { date: '2026-05-14', groups: {} })).toThrow();
    // A ticket with no `prs` array is the shape every board view iterates.
    expect(() =>
      assertReport('jira', { date: '2026-05-14', groups: [{ title: 'x', tickets: [{ key: 'A-1' }] }] }),
    ).toThrow();
    expect(() =>
      assertReport('jira', { date: '2026-05-14', groups: [{ tickets: [] }] }),
    ).toThrow();
  });

  it('rejects a prs report whose repo groups are the wrong shape', () => {
    expect(() => assertReport('prs', { date: '2026-05-14', repos: [{ prs: [] }] })).toThrow();
    expect(() => assertReport('prs', { repos: [] })).toThrow();
  });

  it('rejects a reviews report whose rows lack the keys every lane reads', () => {
    expect(() => assertReport('reviews', { date: '2026-05-14', prs: [{ num: 7 }] })).toThrow();
    expect(() => assertReport('reviews', { date: '2026-05-14', prs: [{ repo: 'a' }] })).toThrow();
  });

  /* `kind` decides which page a row goes to, and `lastFromMe` decides whether it is waiting. */
  it('rejects slack rows with an unknown kind or a missing reply flag', () => {
    expect(() =>
      assertReport('slack', { date: '2026-05-14', rows: [{ id: 'x', kind: 'thread', lastFromMe: false }] }),
    ).toThrow();
    expect(() =>
      assertReport('slack', { date: '2026-05-14', rows: [{ id: 'x', kind: 'dm' }] }),
    ).toThrow();
  });

  it('rejects a calendar report missing either list, since both are rendered', () => {
    expect(() => assertReport('calendar', { date: '2026-05-14', events: [] })).toThrow();
    expect(() => assertReport('calendar', { date: '2026-05-14', upcoming: [] })).toThrow();
  });

  it('returns the value it was given, so it can be used inline', () => {
    expect(assertReport('stats', good.stats)).toBe(good.stats);
  });
});
