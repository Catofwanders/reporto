import type { JiraReport, ReviewPr, ReviewsReport } from './types';
import { idleDays } from './prLanes';

/**
 * The review queue, sorted by what it needs from me.
 *
 * The two questions worth answering here are "have I looked at this" and "has anything
 * happened since I did" — and GitHub answers neither directly: a requested review vanishes
 * from the request list the moment it is submitted, and an approval says nothing about the
 * three commits pushed afterwards.
 *
 * Nor does thread *resolution* answer anything: nobody on this team clicks resolve, so a
 * count of unresolved threads is a count of every comment ever written. "Unanswered" here
 * means nobody replied and nobody pushed over the hunk.
 */
export type ReviewLaneId =
  | 'changed'
  | 'unseen'
  | 'unanswered'
  | 'approved'
  | 'quiet'
  | 'bots';

export interface ReviewLaneMeta {
  id: ReviewLaneId;
  title: string;
  hint: string;
}

export const REVIEW_LANES: ReviewLaneMeta[] = [
  {
    id: 'changed',
    title: 'Changed since you looked',
    hint: 'You reviewed, then they pushed — your verdict is out of date',
  },
  { id: 'unseen', title: 'Never looked at', hint: 'Requested of you, no review from you yet' },
  {
    id: 'unanswered',
    title: 'Your comments unanswered',
    hint: 'You asked, and nobody has replied or pushed over it',
  },
  {
    id: 'approved',
    title: 'You approved',
    hint: 'Still open — waiting on somebody else, not on you',
  },
  { id: 'quiet', title: 'Reviewed, nothing new', hint: 'Nothing has moved since your review' },
  { id: 'bots', title: 'Automation', hint: 'Dependency bumps and other robot PRs' },
];

export interface ReviewRow {
  pr: ReviewPr;
  /** Days since the branch last moved. */
  idleDays: number;
  /** Days since the PR was opened — a different number, and the one "waiting" means. */
  openDays: number;
  /** Days since my review, when I have made one. */
  sinceMyReview: number | null;
  reason: string;
  /** The linked ticket's status, when the Jira report knows it. */
  ticketStatus: string | null;
}

export const laneOfReview = (pr: ReviewPr): ReviewLaneId => {
  // A bot PR is still a review, but it must never compete with a colleague's.
  if (pr.bot) return 'bots';
  if (pr.myReviewState && pr.pushedSinceMyReview) return 'changed';
  if (!pr.myReviewState) return 'unseen';
  if (pr.myUnansweredThreads > 0) return 'unanswered';
  if (pr.myReviewState === 'APPROVED') return 'approved';
  return 'quiet';
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const state = (pr: ReviewPr) => (pr.myReviewState ?? '').toLowerCase().replace('_', ' ');

/**
 * The row's one line: what is true, and what it implies I do.
 *
 * `days` is how long the branch has been still and `open` is how long the PR has existed —
 * they are wildly different on an abandoned branch, and conflating them made a three-year-old
 * PR read as "requested 1009 days ago" when the request may have come last week.
 */
export const reasonOfReview = (
  pr: ReviewPr,
  days: number,
  since: number | null,
  open: number,
): string => {
  if (pr.bot) {
    return pr.myReviewState ? `${state(pr)} — bot PR` : 'dependency bump, nobody is waiting';
  }
  if (pr.myReviewState && pr.pushedSinceMyReview) {
    const ago = since === null ? '' : since === 0 ? ' today' : ` ${since}d ago`;
    return `you ${state(pr)}${ago}, then they pushed — look again`;
  }
  if (!pr.myReviewState) {
    if (pr.draft) return 'requested, but still a draft';
    // An old PR whose branch is equally old is stale, not urgent — say which it is.
    if (open >= 30) {
      return days >= 30
        ? `opened ${open}d ago, untouched since — probably dead`
        : `opened ${open}d ago, never reviewed by you`;
    }
    if (open >= 2) return `waiting ${open} days for your first look`;
    return 'waiting for your first look';
  }
  if (pr.myUnansweredThreads > 0) {
    return `${plural(pr.myUnansweredThreads, 'comment')} of yours with no reply`;
  }
  if (pr.myReviewState === 'APPROVED') {
    return pr.reviewDecision === 'APPROVED'
      ? 'approved and cleared — waiting on merge'
      : 'you approved; somebody else has not';
  }
  if (pr.myReviewState === 'CHANGES_REQUESTED') return 'changes requested, no push yet';
  return `${state(pr)} — nothing new since`;
};

/** How big the review is, in the terms that decide whether it fits in a coffee break. */
export const sizeLabel = (pr: ReviewPr): string =>
  `${plural(pr.size.files, 'file')} · +${pr.size.additions}/−${pr.size.deletions}`;

/** Rough effort, so a one-line fix and a 40-file refactor do not look alike. */
export const sizeTone = (pr: ReviewPr): 'na' | 'warn' | 'bad' => {
  const touched = pr.size.additions + pr.size.deletions;
  if (pr.size.files > 20 || touched > 800) return 'bad';
  if (pr.size.files > 6 || touched > 200) return 'warn';
  return 'na';
};

/**
 * Every PR in the queue, in lanes, each lane oldest-first — the one that has waited longest
 * is the one most likely to have been forgotten.
 */
export const toReviewLanes = (
  report: ReviewsReport,
  jira: JiraReport | null,
): Map<ReviewLaneId, ReviewRow[]> => {
  const statuses = new Map<string, string>();
  for (const group of jira?.groups ?? []) {
    for (const ticket of group.tickets) statuses.set(ticket.key, ticket.status);
  }

  const lanes = new Map<ReviewLaneId, ReviewRow[]>();
  for (const pr of report.prs) {
    const days = idleDays(pr.lastCommitAt ?? pr.updatedAt);
    const since = pr.myReviewAt ? idleDays(pr.myReviewAt) : null;
    const openDays = idleDays(pr.createdAt);
    const row: ReviewRow = {
      pr,
      idleDays: days,
      openDays,
      sinceMyReview: since,
      reason: reasonOfReview(pr, days, since, openDays),
      ticketStatus: pr.ticket ? (statuses.get(pr.ticket) ?? null) : null,
    };
    const lane = laneOfReview(pr);
    const list = lanes.get(lane) ?? [];
    list.push(row);
    lanes.set(lane, list);
  }
  for (const list of lanes.values()) list.sort((a, b) => b.idleDays - a.idleDays);
  return lanes;
};
