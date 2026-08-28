import { describe, expect, it } from 'vitest';
import type { JiraReport, OpenPr, PrsReport, SlackReport, Ticket } from './types';
import { flowFindings } from './flowChecks';
import { statusVocab } from './statusVocab';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** The marketplace's workflow, the way config.template names it. */
const VOCAB = statusVocab({
  tones: { qc: ['Ready for QA'], ok: ['Ready to ship'] },
  groups: {
    devDone: ['Ready for QA', 'Ready to ship'],
    shipped: ['Ready to ship', 'Shipped'],
  },
});

const ticket = (over: Partial<Ticket> & Pick<Ticket, 'key' | 'status'>): Ticket => ({
  url: `https://jira.example.com/browse/${over.key}`,
  chip: 'na',
  summary: 'cache the seller catalogue',
  prs: [],
  notes: [],
  ...over,
});

const jira = (tickets: Ticket[]): JiraReport => ({
  type: 'jira',
  date: '2026-05-14',
  generatedAt: daysAgo(0),
  groups: [{ title: 'all', tickets }],
});

const openPr = (over: Partial<OpenPr> & Pick<OpenPr, 'num'>): OpenPr => ({
  title: 'cache the seller catalogue',
  url: `https://example.com/pr/${over.num}`,
  ticket: null,
  ticketUrl: null,
  review: 'REVIEW_REQUIRED',
  draft: false,
  updatedAt: daysAgo(0),
  ...over,
});

const prs = (list: OpenPr[]): PrsReport => ({
  type: 'prs',
  date: '2026-05-14',
  generatedAt: daysAgo(0),
  author: 'you',
  repos: [{ repo: 'orders-api', prs: list }],
});

const slack = (over: Partial<SlackReport['rows'][number]> = {}): SlackReport => ({
  type: 'slack',
  date: '2026-05-14',
  generatedAt: daysAgo(0),
  me: 'you',
  days: 14,
  rows: [
    {
      id: 'C1:1',
      kind: 'mention',
      channel: 'orders-team',
      channelId: 'C1',
      permalink: 'https://example.slack.com/archives/C1/p1',
      from: 'colleague',
      fromId: 'fixture-person',
      bot: false,
      at: daysAgo(3),
      threadTs: null,
      replies: 0,
      lastFrom: 'colleague',
      lastFromMe: false,
      lastAt: daysAgo(3),
      excerpt: 'is SHOP-1 going out today?',
      tickets: ['SHOP-1'],
      prs: [],
      ...over,
    },
  ],
});

const ids = (findings: { id: string }[]) => findings.map((f) => f.id);

describe('flowFindings', () => {
  it('is empty with no reports, since half the checks are better than none', () => {
    expect(flowFindings(null, null, null, VOCAB)).toEqual([]);
  });

  /*
   * The one a board cannot show: merged, so the ticket reads as delivered, but a QC reset
   * dropped it and the environment QC is testing does not have the work.
   */
  it('catches a merged PR that is no longer on the QC branch', () => {
    const report = jira([
      ticket({
        key: 'SHOP-1',
        status: 'Ready for QA',
        prs: [{ repo: 'orders-api', num: 1, url: 'https://example.com/pr/1', state: 'merged', inQc: false }],
      }),
    ]);
    expect(ids(flowFindings(report, null, null, VOCAB))).toContain('dropped-from-qc:SHOP-1');
  });

  it('does not fire when the merged PR is on the QC branch', () => {
    const report = jira([
      ticket({
        key: 'SHOP-1',
        status: 'Ready for QA',
        prs: [{ repo: 'orders-api', num: 1, url: 'https://example.com/pr/1', state: 'merged', inQc: true }],
      }),
    ]);
    expect(ids(flowFindings(report, null, null, VOCAB))).toEqual([]);
  });

  /*
   * The group is empty in the committed defaults, so this check simply does not fire until a
   * workflow names its development-done statuses. That silence is the designed behaviour: a
   * guess there would invent contradictions on somebody else's board.
   */
  it('needs a configured devDone status before it can call a ticket finished', () => {
    const report = jira([
      ticket({
        key: 'SHOP-1',
        status: 'Ready for QA',
        prs: [{ repo: 'orders-api', num: 1, url: 'https://example.com/pr/1', state: 'open' }],
      }),
    ]);
    const withPrs = prs([openPr({ num: 1, deployQc: { status: 'AHEAD', aheadBy: 2, behindBy: 0 } })]);

    expect(ids(flowFindings(report, withPrs, null, VOCAB))).toContain('off-qc-on-done:SHOP-1');
    expect(ids(flowFindings(report, withPrs, null))).not.toContain('off-qc-on-done:SHOP-1');
  });

  it('flags a ticket still in flight whose every PR is merged', () => {
    const report = jira([
      ticket({
        key: 'SHOP-2',
        status: 'In Progress',
        prs: [{ repo: 'orders-api', num: 2, url: 'https://example.com/pr/2', state: 'merged', inQc: true }],
      }),
    ]);
    expect(ids(flowFindings(report, null, null, VOCAB))).toContain('merged-but-open:SHOP-2');
  });

  it('flags shipped work that no PR was ever matched to', () => {
    const report = jira([ticket({ key: 'SHOP-3', status: 'Ready to ship' })]);
    expect(ids(flowFindings(report, null, null, VOCAB))).toContain('shipped-no-pr:SHOP-3');
  });

  it('flags an approved PR left sitting, which is the cheapest thing on the board to finish', () => {
    const report = prs([
      openPr({ num: 4, review: 'APPROVED', updatedAt: daysAgo(4), ticket: 'SHOP-1' }),
    ]);
    expect(ids(flowFindings(null, report, null, VOCAB))).toContain(
      'approved-idle:https://example.com/pr/4',
    );
    const fresh = prs([
      openPr({ num: 5, review: 'APPROVED', updatedAt: daysAgo(0), ticket: 'SHOP-1' }),
    ]);
    expect(ids(flowFindings(null, fresh, null, VOCAB))).toEqual([]);
  });

  /*
   * A PR with no ticket is normal for a chore or a hotfix. Keying only off the missing key
   * made every one of these a finding, and a check that is wrong every time teaches you to
   * ignore the card it sits in.
   */
  it('excuses a ticketless PR when the branch or the title says it is deliberate', () => {
    const flagged = prs([openPr({ num: 6, branch: 'feature/new-basket' })]);
    expect(ids(flowFindings(null, flagged, null, VOCAB))).toContain(
      'pr-no-ticket:https://example.com/pr/6',
    );

    for (const pr of [
      openPr({ num: 7, branch: 'chore/bump-linter' }),
      openPr({ num: 8, branch: 'hotfix/payment-timeout' }),
      openPr({ num: 9, title: 'fix: stop the basket flickering' }),
      openPr({ num: 10, ticket: 'SHOP-1', branch: 'feature/whatever' }),
    ]) {
      expect(ids(flowFindings(null, prs([pr]), null, VOCAB))).toEqual([]);
    }
  });

  it('surfaces an unanswered question about work that is still moving', () => {
    const board = jira([ticket({ key: 'SHOP-1', status: 'In Progress' })]);
    expect(ids(flowFindings(board, null, slack(), VOCAB))).toContain('slack-live-C1:1');
  });

  it('says it differently when the work has already shipped', () => {
    const board = jira([ticket({ key: 'SHOP-1', status: 'Ready to ship' })]);
    const found = ids(flowFindings(board, null, slack(), VOCAB));
    expect(found).toContain('slack-shipped-C1:1');
    // The shipped and development-done groups overlap, and without the exclusion one question
    // produced two findings saying nearly the same thing.
    expect(found).not.toContain('slack-live-C1:1');
  });

  it('ignores a Slack row that is a bot, or that I already answered', () => {
    const board = jira([ticket({ key: 'SHOP-1', status: 'In Progress' })]);
    expect(ids(flowFindings(board, null, slack({ bot: true }), VOCAB))).toEqual([]);
    expect(
      ids(flowFindings(board, null, slack({ lastFromMe: true, lastFrom: 'you' }), VOCAB)),
    ).toEqual([]);
  });

  it('puts the worst first', () => {
    const board = jira([
      ticket({
        key: 'SHOP-1',
        status: 'Ready for QA',
        prs: [{ repo: 'orders-api', num: 1, url: 'https://example.com/pr/1', state: 'merged', inQc: false }],
      }),
      ticket({ key: 'SHOP-3', status: 'Ready to ship' }),
    ]);
    const severities = flowFindings(board, null, null, VOCAB).map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'bad' ? -1 : 1)));
  });
});
