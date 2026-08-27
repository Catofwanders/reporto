import type { JiraReport, OpenPr, Pr, PrsReport, SlackReport, SlackRow, Ticket } from './types';
import { idleDays } from './prLanes';
import { prState } from './prState';

/**
 * Contradictions between what Jira says and what GitHub says.
 *
 * Each side is believable on its own — that is what makes these expensive. A ticket sitting
 * in QC READY with nothing merged looks finished on the board; a merged PR missing from
 * deploy-qc reads as delivered everywhere except on the QC environment where it is not.
 * Nobody notices until QC asks, so the checks are worth running on every load.
 */
export type FlowSeverity = 'bad' | 'warn';

export interface FlowFinding {
  id: string;
  severity: FlowSeverity;
  /** What is contradictory, in one line. */
  title: string;
  /** Why it matters, or what to do about it. */
  detail: string;
  ticket?: { key: string; url: string };
  prs?: { label: string; url: string }[];
}

/** Statuses that claim development is finished. */
const DONE_WITH_DEV = ['qc ready', 'qc approved', 'cs ready', 'cs approved', 'release ready'];

/** Statuses that claim the work has shipped. */
const SHIPPED = ['release ready', 'released to production', 'done', 'closed'];

/** Statuses that claim the work has not finished yet. */
const IN_FLIGHT = ['in progress', 'in development', 'code review', 'in review'];

const has = (list: string[], status: string) => list.includes(status.trim().toLowerCase());

const prLabel = (pr: Pr) => `${pr.repo.split('/').pop()}#${pr.num}`;

const link = (pr: Pr) => ({ label: prLabel(pr), url: pr.url });

const tickets = (report: JiraReport): Ticket[] => report.groups.flatMap((group) => group.tickets);

/**
 * The board says development is done, but a PR for that ticket is neither merged nor on
 * deploy-qc — so QC is testing a branch without this work in it.
 *
 * An open PR on its own is not the problem: this workflow merges into deploy-qc for testing
 * and into the base branch later, so "open but on QC" is the normal state of a ticket in QC.
 * Only a PR that deploy-qc has not got contradicts the status, which is why this check needs
 * the PR report — the ticket's own PR list carries QC standing for merged PRs only.
 */
function unmergedOnFinishedTicket(
  ticket: Ticket,
  qcOf: (pr: Pr) => OpenPr | undefined,
): FlowFinding | null {
  if (!has(DONE_WITH_DEV, ticket.status)) return null;
  const offQc = ticket.prs.filter((pr) => {
    if (pr.state !== 'open') return false;
    const open = qcOf(pr);
    // Not in the open-PR report — somebody else's PR, or a repo not covered. Cannot judge.
    if (!open?.deployQc) return false;
    return open.deployQc.aheadBy > 0;
  });
  if (offQc.length === 0) return null;
  return {
    id: `off-qc-on-done:${ticket.key}`,
    severity: 'bad',
    title: `${ticket.key} is ${ticket.status.toUpperCase()} but ${offQc.length} PR${
      offQc.length === 1 ? ' is' : 's are'
    } not on deploy-qc`,
    detail:
      'QC is testing a branch that does not contain this work — merge it into deploy-qc, or move the ticket back.',
    ticket: { key: ticket.key, url: ticket.url },
    prs: offQc.map(link),
  };
}

/**
 * Shipped according to the board, but a merged PR is not reachable from deploy-qc — the
 * signature of a QC branch reset that dropped it. Invisible everywhere else: the PR still
 * reads as merged and the ticket still reads as done.
 */
function droppedFromQc(ticket: Ticket): FlowFinding | null {
  const dropped = ticket.prs.filter((pr) => pr.state === 'merged' && pr.inQc === false);
  if (dropped.length === 0) return null;
  return {
    id: `dropped-from-qc:${ticket.key}`,
    severity: 'bad',
    title: `${ticket.key} is merged but missing from deploy-qc`,
    detail: 'A QC reset dropped the commit. Re-merge it or the environment stays without it.',
    ticket: { key: ticket.key, url: ticket.url },
    prs: dropped.map(link),
  };
}

/**
 * The code landed but the ticket never moved. Costs a status nobody trusts, and the ticket
 * shows up in tomorrow's stand-up as work in progress that is finished.
 */
function mergedButTicketOpen(ticket: Ticket): FlowFinding | null {
  if (!has(IN_FLIGHT, ticket.status)) return null;
  const merged = ticket.prs.filter((pr) => pr.state === 'merged');
  if (merged.length === 0 || ticket.prs.some((pr) => pr.state === 'open')) return null;
  return {
    id: `merged-but-open:${ticket.key}`,
    severity: 'warn',
    title: `${ticket.key} is ${ticket.status.toUpperCase()} but every PR is merged`,
    detail: 'Nothing is left to write — move it on, or say what is still missing.',
    ticket: { key: ticket.key, url: ticket.url },
    prs: merged.map(link),
  };
}

/** Shipped with no PR at all: either the work is untracked, or the ticket is not yours. */
function shippedWithoutPr(ticket: Ticket): FlowFinding | null {
  if (!has(SHIPPED, ticket.status) || ticket.prs.length > 0) return null;
  return {
    id: `shipped-no-pr:${ticket.key}`,
    severity: 'warn',
    title: `${ticket.key} is ${ticket.status.toUpperCase()} with no PR on it`,
    detail: 'No PR was ever matched to this ticket — check the title, or that it was yours.',
    ticket: { key: ticket.key, url: ticket.url },
  };
}

/** Approved days ago and still not merged: the cheapest thing on the board to finish. */
function approvedAndSitting(report: PrsReport): FlowFinding[] {
  return report.repos.flatMap((group) =>
    group.prs
      .filter((pr) => !pr.draft && prState(pr) === 'approved' && idleDays(pr.updatedAt) >= 2)
      .map((pr) => ({
        id: `approved-idle:${pr.url}`,
        severity: 'warn' as const,
        title: `${group.repo}#${pr.num} has been approved for ${idleDays(pr.updatedAt)} days`,
        detail: 'Approved and unmerged is the cheapest work on the board to finish.',
        prs: [{ label: `${group.repo}#${pr.num}`, url: pr.url }],
      })),
  );
}

/** An open PR naming no ticket: real work that no report about tickets can see. */
/**
 * Work that legitimately has no Jira ticket, said in the branch name.
 *
 * Not every PR comes from a ticket: a hotfix, a chore, a revert, a dependency bump. Flagging
 * those was this check's whole output — seven of seven findings on one board — and a check
 * that is wrong every time trains you to ignore the card it sits in. The branch prefix is the
 * signal, because it is what the author already declares; a missing key on its own says
 * nothing about whether a key was owed.
 */
const NO_TICKET_OK =
  /^(chore|hotfix|fix|bugfix|revert|deps|dependabot|docs|test|ci|build|refactor|style|release)[/\-_]/i;

/** Conventional-commit titles declare the same thing: "chore: …", "fix(scope): …". */
const NO_TICKET_TITLE =
  /^(chore|hotfix|fix|bugfix|revert|deps|docs|test|ci|build|refactor|style|release)(\([^)]*\))?!?:/i;

const ticketOwed = (pr: OpenPr) =>
  !pr.ticket &&
  !pr.draft &&
  !NO_TICKET_OK.test(pr.branch ?? '') &&
  !NO_TICKET_TITLE.test(pr.title);

function prWithoutTicket(report: PrsReport): FlowFinding[] {
  return report.repos.flatMap((group) =>
    group.prs.filter(ticketOwed).map((pr) => ({
      id: `pr-no-ticket:${pr.url}`,
      severity: 'warn' as const,
      title: `${group.repo}#${pr.num} names no ticket`,
      detail:
        'Work nobody tracking Jira can see. Put the key in the title, or name the branch ' +
        'chore/ or hotfix/ if it is deliberately ticketless.',
      prs: [{ label: `${group.repo}#${pr.num}`, url: pr.url }],
    })),
  );
}

/** A Slack row nobody has answered: somebody spoke, it was not a bot, and I have not replied. */
const waiting = (row: SlackRow) => !row.bot && !row.lastFromMe;

const where = (row: SlackRow) => (row.kind === 'dm' ? `@${row.channel}` : `#${row.channel}`);

/**
 * Somebody asked about a ticket that is still in flight, and nobody answered.
 *
 * This is the contradiction the other checks cannot see: the board says the work is moving,
 * and a question about it has been sitting in a channel for days. Neither Jira nor Slack
 * knows the other exists, so nothing surfaces it until the asker asks again.
 */
function unansweredAboutLiveTicket(row: SlackRow, byKey: Map<string, Ticket>): FlowFinding | null {
  if (!waiting(row)) return null;
  const live = row.tickets
    .map((key) => byKey.get(key))
    .filter((ticket): ticket is Ticket => Boolean(ticket))
    // SHIPPED overlaps DONE_WITH_DEV ("release ready" is in both), and without this exclusion
    // one question produced two findings saying nearly the same thing.
    .filter(
      (ticket) =>
        !has(SHIPPED, ticket.status) &&
        (has(IN_FLIGHT, ticket.status) || has(DONE_WITH_DEV, ticket.status)),
    );
  const ticket = live[0];
  if (!ticket) return null;

  const days = idleDays(row.lastAt ?? row.at);
  return {
    id: `slack-live-${row.id}`,
    severity: days >= 2 ? 'bad' : 'warn',
    title: `${ticket.key} was asked about in ${where(row)}${days > 0 ? ` ${days} days ago` : ''}, unanswered`,
    detail: `The ticket is ${ticket.status.toUpperCase()} and ${row.from} is still waiting. ${row.excerpt}`,
    ticket: { key: ticket.key, url: ticket.url },
  };
}

/**
 * A question about work that has already shipped. Usually a one-line answer, and usually the
 * asker has no way of knowing — the board moved and nobody said so in the channel.
 */
function unansweredAboutShippedTicket(
  row: SlackRow,
  byKey: Map<string, Ticket>,
): FlowFinding | null {
  if (!waiting(row)) return null;
  const shipped = row.tickets
    .map((key) => byKey.get(key))
    .filter((ticket): ticket is Ticket => Boolean(ticket))
    .filter((ticket) => has(SHIPPED, ticket.status));
  const ticket = shipped[0];
  if (!ticket) return null;

  return {
    id: `slack-shipped-${row.id}`,
    severity: 'warn',
    title: `${ticket.key} is ${ticket.status.toUpperCase()}, and the question in ${where(row)} is unanswered`,
    detail: `${row.from} asked and nobody said it had shipped — a one-line reply closes it.`,
    ticket: { key: ticket.key, url: ticket.url },
  };
}

/**
 * A PR posted in a channel that is not on deploy-qc.
 *
 * Sharing a link reads as "this is ready to look at", and it is the same false signal the QC
 * check catches on the Jira side: whoever opens it will test a branch the QC environment does
 * not have.
 *
 * Unlike the other two, this does not care who spoke last: the commonest case is me sharing
 * my own PR, where the last word is mine by definition. Bots are excluded because a deploy
 * feed posts links all day and its links are about deploys, not about review.
 */
function announcedOffQc(row: SlackRow, openPrs: Map<string, OpenPr>): FlowFinding | null {
  if (row.bot) return null;
  const offQc = row.prs
    .map((ref) => ({ ref, pr: openPrs.get(ref) }))
    .filter((entry) => entry.pr && (entry.pr.deployQc?.aheadBy ?? 0) > 0);
  if (offQc.length === 0) return null;

  return {
    id: `slack-offqc-${row.id}`,
    severity: 'warn',
    title: `${offQc.map((entry) => entry.ref).join(', ')} shared in ${where(row)} but not on deploy-qc`,
    detail:
      'Whoever opens the link will read code that QC cannot test yet — merge it into deploy-qc, or say so in the thread.',
    prs: offQc.map((entry) => ({ label: entry.ref, url: entry.pr!.url })),
  };
}

/**
 * Every finding, worst first. A missing report is not an error — it just means those checks
 * cannot run, and half the checks are better than none.
 */
export function flowFindings(
  jira: JiraReport | null,
  prs: PrsReport | null,
  slack: SlackReport | null = null,
): FlowFinding[] {
  const findings: FlowFinding[] = [];

  // The open-PR report carries deploy-qc standing per PR; the ticket's own list does not.
  const openPrs = new Map<string, OpenPr>();
  for (const group of prs?.repos ?? []) {
    for (const pr of group.prs) openPrs.set(`${group.repo}#${pr.num}`, pr);
  }
  const qcOf = (pr: Pr) => openPrs.get(`${pr.repo.split('/').pop()}#${pr.num}`);

  if (jira) {
    for (const ticket of tickets(jira)) {
      const checks = [
        unmergedOnFinishedTicket(ticket, qcOf),
        droppedFromQc(ticket),
        mergedButTicketOpen(ticket),
        shippedWithoutPr(ticket),
      ];
      for (const finding of checks) if (finding) findings.push(finding);
    }
  }

  if (prs) findings.push(...approvedAndSitting(prs), ...prWithoutTicket(prs));

  if (slack) {
    // Keyed by ticket, because a Slack message names a key and knows nothing else about it.
    const byKey = new Map<string, Ticket>();
    for (const ticket of jira ? tickets(jira) : []) byKey.set(ticket.key, ticket);

    for (const row of slack.rows) {
      const checks = [
        unansweredAboutLiveTicket(row, byKey),
        unansweredAboutShippedTicket(row, byKey),
        announcedOffQc(row, openPrs),
      ];
      for (const finding of checks) if (finding) findings.push(finding);
    }
  }

  const order: FlowSeverity[] = ['bad', 'warn'];
  return findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}
