import type { CalendarReport, JiraReport, PrsReport, StandupSince, Ticket } from './types';
import { formatStatus } from './jiraStatus';
import { type AgingLimits, overdueTickets } from './ticketAging';
import { idleDays, laneOf } from './prLanes';

/**
 * The stand-up note, assembled from what already exists.
 *
 * Only "since the last working day" needs the API — a report on disk is a snapshot of now,
 * so it cannot say a ticket *reached* QC READY yesterday. Everything else is derivation:
 * what is in flight, what is blocked, what the calendar takes today.
 */
export interface StandupNote {
  since: string;
  yesterday: string[];
  today: string[];
  blockers: string[];
  notes: string[];
}

const IN_FLIGHT = ['in progress', 'in development', 'code review', 'in review'];
/**
 * On Hold is deliberately not here. Parked work is not blocking today, and six long-parked
 * tickets read out every morning are what makes people stop listening to the blockers list.
 */
const BLOCKED = ['blocked', 'qc failed'];

const has = (list: string[], status: string) => list.includes(status.trim().toLowerCase());

const allTickets = (report: JiraReport | null): Ticket[] =>
  (report?.groups ?? []).flatMap((group) => group.tickets);

/** `KEY-1 FROM → TO`, or the plain status when it only moved one step. */
const movement = (from: string | null, to: string | null) =>
  from && to && from !== to ? `${formatStatus(from)} → ${formatStatus(to)}` : formatStatus(to ?? '');

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : 'all day';

export function buildStandup(
  since: StandupSince | null,
  jira: JiraReport | null,
  prs: PrsReport | null,
  calendar: CalendarReport | null,
  /** Days-in-status limits per status, so a ticket stuck too long can be said out loud. */
  aging: AgingLimits = {},
  /** Statuses where sitting still is worth saying out loud; empty means all with a limit. */
  stuckStatuses: string[] = [],
): StandupNote {
  const yesterday = [
    ...(since?.moved ?? []).map(
      (move) =>
        `${move.key} — ${movement(move.from, move.to)}${move.steps > 1 ? ` (${move.steps} moves)` : ''}`,
    ),
    ...(since?.merged ?? []).map((pr) => `merged ${pr.repo}#${pr.num} — ${pr.title}`),
  ];

  const today = [
    ...allTickets(jira)
      .filter((ticket) => has(IN_FLIGHT, ticket.status))
      .map((ticket) => `${ticket.key} — ${ticket.summary} (${formatStatus(ticket.status)})`),
    // A PR waiting on me is work for today whether or not its ticket says so.
    ...(prs?.repos ?? []).flatMap((group) =>
      group.prs
        .filter((pr) => laneOf(pr) === 'needs-you')
        .map((pr) => `answer review on ${group.repo}#${pr.num}`),
    ),
    ...(calendar?.events ?? []).map((event) => `${clock(event.start)} ${event.title}`),
  ];

  const blockers = [
    ...allTickets(jira)
      .filter((ticket) => has(BLOCKED, ticket.status))
      .map((ticket) => `${ticket.key} — ${formatStatus(ticket.status)}: ${ticket.summary}`),
    /*
     * Stuck in a status past its limit. Not "blocked" in Jira's sense — nobody set a flag —
     * which is exactly why it is worth saying: a ticket in CODE REVIEW for six days is the
     * thing a stand-up exists to surface, and the board looked the same on day one.
     */
    ...overdueTickets(
      allTickets(jira).filter((ticket) => !has(BLOCKED, ticket.status)),
      aging,
      stuckStatuses,
    ).map(
      ({ ticket, age }) =>
        `${ticket.key} — ${age.days} days in ${formatStatus(ticket.status)}: ${ticket.summary}`,
    ),
    // Waiting on somebody for two days or more is the point at which it is worth saying out
    // loud; below that it is just a PR in review.
    ...(prs?.repos ?? []).flatMap((group) =>
      group.prs
        .filter((pr) => laneOf(pr) === 'waiting' && idleDays(pr.updatedAt) >= 2)
        .map(
          (pr) =>
            `${group.repo}#${pr.num} waiting on review for ${idleDays(pr.updatedAt)} days`,
        ),
    ),
  ];

  return { since: since?.since ?? '', yesterday, today, blockers, notes: since?.notes ?? [] };
}

const section = (title: string, lines: string[]) =>
  `${title}\n${lines.length ? lines.map((line) => `- ${line}`).join('\n') : '- nothing'}`;

/** Plain text, because it is going into Slack or said out loud — not rendered. */
export function standupText(note: StandupNote): string {
  return [
    section(`Since ${note.since}`, note.yesterday),
    section('Today', note.today),
    section('Blockers', note.blockers),
  ].join('\n\n');
}
