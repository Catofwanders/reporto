import type { JiraReport, Ticket } from './types';
import { DEFAULT_VOCAB, inStatusGroup, type StatusVocab } from './statusVocab';

/**
 * What counts as work in flight.
 *
 * Everything from the first QA stage onward is still live work: the ticket is waiting on
 * somebody, and it is still mine until it ships. Which statuses those are is configuration —
 * see `statusVocab.ts` — because the names past "in review" belong to whoever owns the board.
 *
 * This lives on its own because two places ask the question — the Jira panel and the dashboard
 * queue — and two copies of the list is how they start disagreeing about which tickets are
 * yours today.
 */
export const isActiveStatus = (status: string, vocab: StatusVocab = DEFAULT_VOCAB) =>
  inStatusGroup(vocab, 'active', status);

export const isActive = (ticket: Ticket, vocab: StatusVocab = DEFAULT_VOCAB) =>
  isActiveStatus(ticket.status, vocab);

/** Every ticket in flight, in report order. */
export const activeTickets = (
  report: JiraReport,
  vocab: StatusVocab = DEFAULT_VOCAB,
): Ticket[] =>
  report.groups
    // Umbrella tickets carry no PR of their own — the child tickets below them do.
    .filter((group) => !group.title.toLowerCase().startsWith('umbrella'))
    .flatMap((group) => group.tickets)
    .filter((ticket) => isActive(ticket, vocab));
