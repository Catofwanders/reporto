import { describe, expect, it } from 'vitest';
import type { JiraReport, KitEntry, PrsReport } from './types';
import { buildItems, matchItems, parseQuery, scoreItem } from './paletteItems';

const jira: JiraReport = {
  type: 'jira',
  date: '2026-05-14',
  generatedAt: '2026-05-14T08:00:00Z',
  groups: [
    {
      title: 'In Progress',
      tickets: [
        {
          key: 'SHOP-812',
          url: 'https://jira.example.com/browse/SHOP-812',
          status: 'In Progress',
          chip: 'open',
          summary: 'cache the seller catalogue',
          prs: [],
          notes: [],
        },
      ],
    },
  ],
};

const prs: PrsReport = {
  type: 'prs',
  date: '2026-05-14',
  generatedAt: '2026-05-14T08:00:00Z',
  author: 'you',
  repos: [
    {
      repo: 'example/orders-api',
      prs: [
        {
          num: 77,
          title: 'retry the refund webhook',
          url: 'https://example.com/pr/77',
          ticket: 'SHOP-812',
          ticketUrl: null,
          review: 'APPROVED',
          draft: false,
          updatedAt: '2026-05-14T08:00:00Z',
        },
      ],
    },
  ],
};

const kitEntry = (over: Partial<KitEntry> & Pick<KitEntry, 'kind' | 'name'>): KitEntry => ({
  source: 'personal',
  plugin: null,
  description: '',
  argumentHint: null,
  tools: [],
  model: null,
  path: `.claude/${over.kind}s/${over.name}.md`,
  lines: 20,
  modified: '2026-05-14T08:00:00Z',
  ...over,
});

const kit: KitEntry[] = [
  kitEntry({ kind: 'command', name: 'jira', description: 'refresh the board' }),
  kitEntry({ kind: 'skill', name: 'email-helper', description: 'read the calendar' }),
];

const items = buildItems(jira, prs, kit);
const titles = (query: string) => matchItems(items, query).map((item) => item.title);

describe('buildItems', () => {
  it('offers pages, updates, tickets, PRs and the kit', () => {
    expect([...new Set(items.map((item) => item.group))]).toEqual(
      expect.arrayContaining(['Pages', 'Update', 'Tickets', 'Pull requests', 'Commands', 'Skills']),
    );
  });

  /* A palette that offers "Update Statistics" with no Jira token is a list of ways to fail. */
  it('leaves out anything that depends on a report this machine cannot fetch', () => {
    const only = buildItems(jira, prs, kit, (kind) => kind === 'prs');
    expect(only.some((item) => item.id === 'refresh:jira')).toBe(false);
    expect(only.some((item) => item.id === 'page:/jira')).toBe(false);
    expect(only.some((item) => item.id === 'refresh:prs')).toBe(true);
  });

  it('sends a ticket and a PR to the page that already shows them', () => {
    const ticket = items.find((item) => item.id === 'ticket:SHOP-812');
    expect(ticket?.action).toEqual({ kind: 'goto', to: '/jira#SHOP-812' });
    const pr = items.find((item) => item.id === 'pr:example/orders-api#77');
    expect(pr?.action).toEqual({ kind: 'goto', to: '/prs#example/orders-api-77' });
  });

  /* The app cannot run a slash command — that happens in a Claude session — so copy is honest. */
  it('copies a command rather than pretending it can run one', () => {
    expect(items.find((item) => item.id === 'kit:command:jira')?.action).toEqual({
      kind: 'copy',
      text: '/jira',
    });
  });
});

describe('parseQuery', () => {
  it('reads a leading > as actions-only and keeps the rest as the query', () => {
    expect(parseQuery('>')).toEqual({ actionsOnly: true, text: '' });
    expect(parseQuery('  >  jira ')).toEqual({ actionsOnly: true, text: 'jira' });
  });

  it('leaves a > anywhere else alone', () => {
    expect(parseQuery('a>b')).toEqual({ actionsOnly: false, text: 'a>b' });
  });
});

describe('matchItems', () => {
  it('offers the always-useful rows before anything is typed', () => {
    expect([...new Set(matchItems(items, '').map((item) => item.group))]).toEqual([
      'Pages',
      'Update',
    ]);
  });

  it('finds a ticket by its bare number and a repo by an abbreviation', () => {
    expect(titles('812')[0]).toContain('SHOP-812');
    expect(titles('ordapi').some((title) => title.includes('#77'))).toBe(true);
  });

  it('ranks a word-boundary hit above a scattered one', () => {
    expect(scoreItem(items.find((i) => i.id === 'page:/jira')!, 'jira')).toBeGreaterThan(
      scoreItem(items.find((i) => i.id === 'kit:skill:email-helper')!, 'jira'),
    );
  });

  /* `>` is the editor convention: everything runnable, nowhere to go. */
  it('narrows to rows that do something under >', () => {
    const shown = matchItems(items, '>');
    expect(shown.every((item) => item.action.kind === 'refresh' || item.action.kind === 'copy')).toBe(
      true,
    );
    expect(shown.some((item) => item.group === 'Pages')).toBe(false);
    expect(matchItems(items, '> SHOP-812')).toEqual([]);
  });

  it('lists every action for a bare >, rather than waiting for more typing', () => {
    expect(matchItems(items, '>').length).toBeGreaterThan(1);
  });

  it('honours the limit', () => {
    expect(matchItems(items, 'e', 2)).toHaveLength(2);
  });
});
