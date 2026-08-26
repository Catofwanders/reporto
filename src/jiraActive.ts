import type { JiraReport, Ticket } from './types';

/**
 * What counts as work in flight.
 *
 * "cs approved" is the board's "Waiting for Merge (CS Approved)" column — the skill writes
 * the short name, so match that. Everything from QC onward is still live work: the ticket is
 * waiting on somebody, and it is still mine until it ships.
 *
 * This lives on its own because two places ask the question — the Jira panel and the
 * dashboard module — and two copies of the list is how they start disagreeing about which
 * tickets are yours today.
 */
export const ACTIVE_STATUSES = [
  'in progress',
  'code review',
  'qc ready',
  'qc failed',
  'qc approved',
  'cs approved',
];

export const isActiveStatus = (status: string) => ACTIVE_STATUSES.includes(status.toLowerCase());

export const isActive = (ticket: Ticket) => isActiveStatus(ticket.status);

/** Every ticket in flight, in report order. */
export const activeTickets = (report: JiraReport): Ticket[] =>
  report.groups
    // Umbrella tickets carry no PR of their own — the child tickets below them do.
    .filter((group) => !group.title.toLowerCase().startsWith('umbrella'))
    .flatMap((group) => group.tickets)
    .filter(isActive);
