import type { JiraReport, Ticket } from './types';
import { DEFAULT_VOCAB, inStatusGroup, type StatusVocab } from './statusVocab';

/**
 * What counts as work in flight.
 *
 * Everything from the first QA stage onward is still live work: the ticket is waiting on
 * somebody, and it is still mine until it ships. Which statuses those are is configuration —
 * see `statusVocab.ts` — because the names past "in review" belong to whoever owns the board.
 *
 * This lives on its own so the question has one answer. Only the dashboard queue asks it
 * today, through `activeTickets`; the predicates are exported because the answer belongs here
 * rather than inlined at the next call site that needs it.
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
