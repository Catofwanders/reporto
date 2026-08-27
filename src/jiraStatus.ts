import type { Chip, Ticket } from './types';
import { DEFAULT_VOCAB, statusToneOf, type StatusVocab } from './statusVocab';

/**
 * Ticket status → chip tone, drawn from the same palette the open-PR pill uses, so a status
 * and a review state that mean the same thing look the same:
 *
 *   na     Backlog / To Do  — not started
 *   open   In Progress      — live work, like "awaiting review"
 *   warn   In Review        — waiting on somebody, like "awaiting re-review"
 *   qc     a QA stage       — matching the "on QC" half of the PR pill
 *   bad    Blocked          — stuck, like "changes requested"
 *   qcout  On Hold          — parked rather than broken, so distinct from blocked
 *   ok     Done             — finished as far as this board goes
 *
 * Which status names carry which tone is configuration, not code: everything past "in review"
 * is somebody's own pipeline. See `statusVocab.ts`.
 *
 * The server also writes a `chip` per ticket; the vocabulary takes precedence because it keeps
 * the two cards consistent even for reports written before a status was known, and falls back
 * to that value for any status the vocabulary has never seen.
 */
export const statusTone = (
  ticket: Pick<Ticket, 'status' | 'chip'>,
  vocab: StatusVocab = DEFAULT_VOCAB,
): Chip => statusToneOf(vocab, ticket.status) ?? ticket.chip;

/**
 * Jira statuses arrive in whatever case each workflow author typed: one shouts, the next does
 * not, and both sit side by side in the same list. Upper-case them all so a column of chips
 * reads as one set.
 */
export const formatStatus = (status: string): string => status.trim().toUpperCase();
