import type { Ticket } from './types';

/**
 * How long a ticket has sat where it is, and whether that is too long.
 *
 * The board looks identical on day one and day seven of a review column. The PR lanes have said
 * "no review yet — 6 days, chase it" for a while; tickets had no equivalent, so a ticket could
 * quietly rot in a status nobody owns.
 *
 * A fixed threshold would cry wolf: a QA queue is meant to wait for somebody else, a review
 * column is not, and a status that is normally slow would light up every day. So the limit is
 * per status and comes from config — which also keeps the board's own vocabulary out of this
 * repo.
 */
export interface TicketAge {
  /** Whole days in the current status. */
  days: number;
  /** The configured limit for this status, when there is one. */
  limit: number | null;
  /** Past the limit — the only state worth colouring. */
  over: boolean;
  tone: 'na' | 'warn' | 'bad';
  label: string;
  title: string;
}

const DAY = 86_400_000;

/** Thresholds by status name, case-insensitive, with `default` as the fallback. */
export type AgingLimits = Record<string, number>;

const limitFor = (limits: AgingLimits, status: string): number | null => {
  const wanted = status.trim().toLowerCase();
  for (const [name, days] of Object.entries(limits)) {
    if (name.toLowerCase() === wanted) return days;
  }
  const fallback = Object.entries(limits).find(([name]) => name.toLowerCase() === 'default');
  return fallback ? fallback[1] : null;
};

/**
 * Null when the report carries no `statusSince` for this ticket — that is "not measured",
 * which must not render as "0 days". A pull only reads changelogs for the statuses configured
 * as worth aging, so most tickets legitimately have nothing here.
 */
export const agingOf = (ticket: Ticket, limits: AgingLimits): TicketAge | null => {
  if (!ticket.statusSince) return null;
  const since = new Date(ticket.statusSince).getTime();
  if (Number.isNaN(since)) return null;

  const days = Math.max(0, Math.floor((Date.now() - since) / DAY));
  const limit = limitFor(limits, ticket.status);
  const over = limit !== null && days >= limit;
  return {
    days,
    limit,
    over,
    // Twice the limit is a different problem from just past it: one needs a nudge, the other
    // needs a decision.
    tone: !over ? 'na' : limit !== null && days >= limit * 2 ? 'bad' : 'warn',
    label: days === 0 ? 'today' : `${days}d`,
    title: `in ${ticket.status.toUpperCase()} since ${new Date(ticket.statusSince).toLocaleString(
      'en-GB',
    )}${limit !== null ? ` · over ${limit} days is worth chasing` : ''}`,
  };
};

/**
 * Whether sitting still in this status is worth calling stuck.
 *
 * Narrower than having a limit at all, and deliberately so: a BLOCKED ticket is not slow, it
 * is blocked, and one a QA stage sent back is already shouting through its own status. Counting those
 * as "sitting too long" put four years of blocked work in a number about today. An empty list
 * means every status that has a limit.
 */
export const countsAsStuck = (status: string, watched: string[]): boolean => {
  if (watched.length === 0) return true;
  const wanted = status.trim().toLowerCase();
  return watched.some((name) => name.trim().toLowerCase() === wanted);
};

/** The ones past their limit, longest first — what a stand-up would actually mention. */
export const overdueTickets = (
  tickets: Ticket[],
  limits: AgingLimits,
  watched: string[] = [],
): { ticket: Ticket; age: TicketAge }[] =>
  tickets
    .filter((ticket) => countsAsStuck(ticket.status, watched))
    .map((ticket) => ({ ticket, age: agingOf(ticket, limits) }))
    .filter((entry): entry is { ticket: Ticket; age: TicketAge } => Boolean(entry.age?.over))
    .sort((a, b) => b.age.days - a.age.days);
