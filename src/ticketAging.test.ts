import { describe, expect, it } from 'vitest';
import type { Ticket } from './types';
import { agingOf, countsAsStuck, overdueTickets } from './ticketAging';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const ticket = (over: Partial<Ticket> & Pick<Ticket, 'key' | 'status'>): Ticket => ({
  url: `https://jira.example.com/browse/${over.key}`,
  chip: 'na',
  summary: 'cache the seller catalogue',
  prs: [],
  notes: [],
  ...over,
});

const LIMITS = { 'In Progress': 5, 'In Review': 2, default: 7 };

describe('agingOf', () => {
  /*
   * The distinction that matters: a pull only reads changelogs for the statuses configured as
   * worth aging, so most tickets legitimately carry no `statusSince`. Rendering that as "0
   * days" would claim the ticket just arrived.
   */
  it('is null when the report never measured this ticket', () => {
    expect(agingOf(ticket({ key: 'SHOP-1', status: 'In Progress' }), LIMITS)).toBeNull();
    expect(
      agingOf(ticket({ key: 'SHOP-1', status: 'In Progress', statusSince: null }), LIMITS),
    ).toBeNull();
  });

  it('is null rather than NaN when the timestamp is unreadable', () => {
    expect(
      agingOf(ticket({ key: 'SHOP-1', status: 'In Progress', statusSince: 'yesterday' }), LIMITS),
    ).toBeNull();
  });

  it('counts whole days and says "today" for the first one', () => {
    const fresh = agingOf(
      ticket({ key: 'SHOP-1', status: 'In Progress', statusSince: daysAgo(0) }),
      LIMITS,
    );
    expect(fresh?.days).toBe(0);
    expect(fresh?.label).toBe('today');
    expect(fresh?.over).toBe(false);
  });

  it('is quiet inside the limit and only colours past it', () => {
    const inside = agingOf(
      ticket({ key: 'SHOP-1', status: 'In Progress', statusSince: daysAgo(4) }),
      LIMITS,
    );
    expect(inside?.over).toBe(false);
    expect(inside?.tone).toBe('na');

    const over = agingOf(
      ticket({ key: 'SHOP-1', status: 'In Progress', statusSince: daysAgo(6) }),
      LIMITS,
    );
    expect(over?.over).toBe(true);
    expect(over?.tone).toBe('warn');
    expect(over?.label).toBe('6d');
  });

  /* Twice the limit is a different problem: one wants a nudge, the other wants a decision. */
  it('turns red at twice the limit', () => {
    const bad = agingOf(
      ticket({ key: 'SHOP-1', status: 'In Review', statusSince: daysAgo(4) }),
      LIMITS,
    );
    expect(bad?.tone).toBe('bad');
  });

  it('matches the status however it was cased, and falls back to the default limit', () => {
    const cased = agingOf(
      ticket({ key: 'SHOP-1', status: '  in progress ', statusSince: daysAgo(6) }),
      LIMITS,
    );
    expect(cased?.limit).toBe(5);

    const unknown = agingOf(
      ticket({ key: 'SHOP-2', status: 'Something Else', statusSince: daysAgo(8) }),
      LIMITS,
    );
    expect(unknown?.limit).toBe(7);
    expect(unknown?.over).toBe(true);
  });

  it('never calls a ticket old when no limit applies at all', () => {
    const age = agingOf(
      ticket({ key: 'SHOP-3', status: 'Whatever', statusSince: daysAgo(400) }),
      {},
    );
    expect(age?.limit).toBeNull();
    expect(age?.over).toBe(false);
  });
});

describe('countsAsStuck', () => {
  it('watches everything when nothing is named', () => {
    expect(countsAsStuck('Blocked', [])).toBe(true);
  });

  /*
   * Narrower than having a limit on purpose: a blocked ticket is not slow, it is blocked, and
   * counting those put years of parked work into a number about today.
   */
  it('watches only the named statuses once a list exists', () => {
    expect(countsAsStuck('In Progress', ['In Progress', 'In Review'])).toBe(true);
    expect(countsAsStuck('  in review ', ['In Progress', 'In Review'])).toBe(true);
    expect(countsAsStuck('Blocked', ['In Progress', 'In Review'])).toBe(false);
  });
});

describe('overdueTickets', () => {
  const tickets = [
    ticket({ key: 'SHOP-1', status: 'In Progress', statusSince: daysAgo(6) }),
    ticket({ key: 'SHOP-2', status: 'In Progress', statusSince: daysAgo(20) }),
    ticket({ key: 'SHOP-3', status: 'In Progress', statusSince: daysAgo(1) }),
    ticket({ key: 'SHOP-4', status: 'Blocked', statusSince: daysAgo(90) }),
    ticket({ key: 'SHOP-5', status: 'In Progress' }),
  ];

  it('returns the ones past their limit, longest first', () => {
    const overdue = overdueTickets(tickets, LIMITS, ['In Progress']);
    expect(overdue.map((entry) => entry.ticket.key)).toEqual(['SHOP-2', 'SHOP-1']);
  });

  it('drops statuses nobody is watching, however long they have sat', () => {
    const keys = overdueTickets(tickets, LIMITS, ['In Progress']).map((e) => e.ticket.key);
    expect(keys).not.toContain('SHOP-4');
  });

  it('drops unmeasured tickets rather than treating them as fresh or as old', () => {
    const keys = overdueTickets(tickets, LIMITS, []).map((e) => e.ticket.key);
    expect(keys).not.toContain('SHOP-5');
  });
});
