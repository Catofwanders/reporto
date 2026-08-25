import type { Chip, Ticket } from './types';

/**
 * Ticket status → chip tone, drawn from the same palette the open-PR pill uses, so a
 * status and a review state that mean the same thing look the same:
 *
 *   qc     QC READY        — the QC dimension, matching the "on QC" half of the PR pill
 *   warn   CODE REVIEW     — waiting on somebody, like "awaiting re-review"
 *   warn   CS APPROVED     — approved, waiting on a merge; also waiting on somebody
 *   open   In Progress     — live work, like "awaiting review"
 *   bad    BLOCKED         — stuck, like "changes requested"
 *   qcout  On Hold         — parked rather than broken, so distinct from BLOCKED
 *   ok     RELEASE READY   — done as far as this board goes
 *   na     Backlog / NEXT  — not started
 *
 * The server also writes a `chip` per ticket; this takes precedence because it keeps the
 * two cards consistent even for reports written before a status was known here, and falls
 * back to that value for any status this list has never seen.
 */
const STATUS_TONE: [RegExp, Chip][] = [
  [/^qc[\s-]?ready$/i, 'qc'],
  [/^(code review|in review|review)$/i, 'warn'],
  [/^cs approved$/i, 'warn'],
  [/^(in progress|in development|doing)$/i, 'open'],
  [/^blocked$/i, 'bad'],
  [/^on hold$/i, 'qcout'],
  [/^(release ready|released|done|closed)/i, 'ok'],
  [/^(backlog|next|to do|selected|new)$/i, 'na'],
];

export const statusTone = (ticket: Pick<Ticket, 'status' | 'chip'>): Chip => {
  for (const [pattern, tone] of STATUS_TONE) if (pattern.test(ticket.status.trim())) return tone;
  return ticket.chip;
};

/**
 * Jira statuses arrive in whatever case each workflow author typed: "QC READY" shouts,
 * "In Progress" does not, and "CODE REVIEW" and "Backlog" sit side by side in the same
 * list. Upper-case them all so a column of chips reads as one set.
 */
export const formatStatus = (status: string): string => status.trim().toUpperCase();
