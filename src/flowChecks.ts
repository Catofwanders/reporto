import type { JiraReport, OpenPr, Pr, PrsReport, Ticket } from './types';
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
function prWithoutTicket(report: PrsReport): FlowFinding[] {
  return report.repos.flatMap((group) =>
    group.prs
      .filter((pr) => !pr.draft && !pr.ticket)
      .map((pr) => ({
        id: `pr-no-ticket:${pr.url}`,
        severity: 'warn' as const,
        title: `${group.repo}#${pr.num} names no ticket`,
        detail: 'Work nobody tracking Jira can see. Put the key in the title.',
        prs: [{ label: `${group.repo}#${pr.num}`, url: pr.url }],
      })),
  );
}

/**
 * Every finding, worst first. A missing report is not an error — it just means those checks
 * cannot run, and half the checks are better than none.
 */
export function flowFindings(
  jira: JiraReport | null,
  prs: PrsReport | null,
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

  const order: FlowSeverity[] = ['bad', 'warn'];
  return findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}
