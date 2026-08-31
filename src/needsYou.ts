import type {
  JiraReport,
  OpenPr,
  PrsReport,
  ReviewPr,
  ReviewsReport,
  SlackReport,
  SlackRow,
} from './types';
import { prState } from './prState';
import { idleDays, laneOf, reasonOf } from './prLanes';
import { laneOfReview, reasonOfReview, toReviewLanes } from './reviewLanes';
import { laneOfSlack, reasonOfSlack, WAITING_LANES } from './slackLanes';
import type { SlackWords } from './slackIntent';
import { activeTickets } from './jiraActive';
import { type AgingLimits, agingOf, countsAsStuck } from './ticketAging';
import { DEFAULT_VOCAB, type StatusVocab } from './statusVocab';

/**
 * One queue instead of four.
 *
 * Four parallel lists made the dashboard a wall of near-identical sentences — "waiting for a
 * first review" four times over — and left the reader to interleave them by hand. What a
 * morning actually needs is a single answer to "what first", so everything blocked on me goes
 * into one list, ordered by how much it is blocking, then by how long it has waited.
 *
 * The reason each item is here stays available as a tooltip rather than a line of prose: it is
 * what you read *after* deciding to look, and the dedicated pages carry it in full.
 */
export type FeedSource = 'pr' | 'review' | 'slack' | 'ticket';

/**
 * What the row wants doing, as one word. Rows are grouped under it, which is what makes a
 * merged list legible: without it, seven rows of "name + age" say what each thing *is* and
 * nothing about why it is in front of you.
 */
export type FeedAction = 'push' | 'review' | 'answer' | 'merge' | 'unstick';

export const ACTION_LABEL: Record<FeedAction, string> = {
  push: 'Your move',
  review: 'Review',
  answer: 'Answer',
  merge: 'Merge',
  unstick: 'Unstick',
};

export interface FeedItem {
  id: string;
  source: FeedSource;
  action: FeedAction;
  /** Short enough to scan: a repo and number, a ticket key, or a Slack handle. */
  label: string;
  /**
   * Why it is here, in three or four words — "changes requested", "never looked at". Not the
   * full sentence: that is `detail`, and it belongs in a tooltip. A row with no reason at all
   * turned out to be unreadable, which is what this field exists to fix.
   */
  why: string;
  /** The full sentence, for the title attribute. */
  detail: string;
  url: string;
  /** In-app destination, when there is a page that shows this item in context. */
  to: string;
  days: number;
  tone: 'bad' | 'warn' | 'na';
  /** Higher moves up the list, before age is considered. */
  weight: number;
}

/**
 * How much each kind of thing is blocking. A review somebody has waited on is worth more of
 * my attention than my own PR nobody has looked at yet, and an approved PR that only needs
 * the button is worth more than either — it is thirty seconds from done.
 */
const WEIGHT = {
  prNeedsYou: 100,
  reviewChanged: 90,
  reviewUnseen: 85,
  slackAsked: 80,
  prReady: 70,
  ticketStuck: 60,
  slackStale: 50,
} as const;

const repoShort = (repo: string) => repo.split('/').pop() ?? repo;

/** The reason in as few words as still say it. Long enough to act on, short enough to scan. */
const prWhy = (pr: OpenPr): string => {
  const state = prState(pr);
  const threads = pr.unansweredThreads ?? 0;
  if (state === 'approved') return pr.deployQc && pr.deployQc.aheadBy === 0 ? 'approved · on QC' : 'approved';
  if (state === 'changes-requested') return threads > 0 ? `changes + ${threads} to answer` : 'changes requested';
  if (state === 'commented') return threads > 0 ? `${threads} comments to answer` : 'reviewed, your move';
  return 'waiting on you';
};

const reviewWhy = (pr: ReviewPr): string => {
  if (pr.myReviewState && pr.reworkCommits > 0) return 'pushed since you looked';
  if (!pr.myReviewState) return pr.draft ? 'requested, still a draft' : 'never looked at';
  if (pr.myUnansweredThreads > 0) return 'your comments unanswered';
  return 'waiting on you';
};

const slackWhy = (row: SlackRow, days: number): string => {
  const who = row.kind === 'dm' ? 'DM' : 'mention';
  if (days >= 7) return `${who}, still unanswered`;
  return `${who}, no reply yet`;
};

const toneForDays = (days: number): 'bad' | 'warn' | 'na' => {
  if (days >= 4) return 'bad';
  if (days >= 2) return 'warn';
  return 'na';
};

export function needsYou({
  prs,
  reviews,
  slack,
  jira,
  aging = {},
  stuckStatuses = [],
  vocab = DEFAULT_VOCAB,
  slackWords = {},
  slackDone = () => false,
  limit = 7,
}: {
  prs: PrsReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  jira: JiraReport | null;
  aging?: AgingLimits;
  /** Statuses where sitting still counts as stuck; empty means all that have a limit. */
  stuckStatuses?: string[];
  /** The board's status vocabulary, so "in flight" means what this workflow calls it. */
  vocab?: StatusVocab;
  /** Extra ask/closer phrases from config, so the queue and the Slack page classify alike. */
  slackWords?: SlackWords;
  /** Rows dismissed by hand. The mark is in the browser, so only the caller knows it. */
  slackDone?: (id: string) => boolean;
  limit?: number;
}): FeedItem[] {
  const items: FeedItem[] = [];

  if (prs) {
    for (const group of prs.repos) {
      for (const pr of group.prs) {
        const lane = laneOf(pr);
        // "Waiting on others" is deliberately absent: nothing there is mine to move, and it
        // is the biggest lane — putting it here would drown the six things that are.
        if (lane !== 'needs-you' && lane !== 'ready') continue;
        const days = idleDays(pr.updatedAt);
        items.push({
          id: `pr:${group.repo}#${pr.num}`,
          source: 'pr',
          action: lane === 'ready' ? 'merge' : 'push',
          label: `${repoShort(group.repo)} #${pr.num}`,
          why: prWhy(pr),
          detail: reasonOf(pr, days, prs.author),
          url: pr.url,
          to: `/prs#${group.repo}-${pr.num}`,
          days,
          tone: lane === 'needs-you' ? toneForDays(Math.max(days, 2)) : 'na',
          weight: lane === 'needs-you' ? WEIGHT.prNeedsYou : WEIGHT.prReady,
        });
      }
    }
  }

  if (reviews) {
    for (const [lane, rows] of toReviewLanes(reviews, jira)) {
      /*
       * Only "changed since you looked". A review request I have never opened is on the queue
       * page, not here: requests land on whole teams, so most of them are somebody else's to
       * take, and counting them made the dashboard claim work that was not mine. A PR I
       * reviewed and that has since been pushed to is unambiguously mine — my verdict is the
       * thing that is out of date.
       */
      if (lane !== 'changed') continue;
      for (const row of rows) {
        items.push({
          id: `review:${row.pr.url}`,
          source: 'review',
          action: 'review',
          label: `${repoShort(row.pr.repo)} #${row.pr.num}`,
          why: `@${row.pr.author} · ${reviewWhy(row.pr)}`,
          detail: `${row.pr.author}: ${reasonOfReview(row.pr, row.idleDays, row.sinceMyReview, row.openDays)}`,
          url: row.pr.url,
          to: `/reviews#${row.pr.repo}-${row.pr.num}`,
          days: row.idleDays,
          tone: toneForDays(row.idleDays),
          weight: laneOfReview(row.pr) === 'changed' ? WEIGHT.reviewChanged : WEIGHT.reviewUnseen,
        });
      }
    }
  }

  if (slack) {
    for (const row of slack.rows) {
      // Decided about by hand: it never needed an answer, and the row stops asking for one.
      if (slackDone(row.id)) continue;
      /*
       * Only the lanes that actually want a reply. "Told you something" and "nothing to
       * answer" are readable on the Slack page and are not work: measured on a real
       * fortnight, two of the three rows in "waiting on you" were statements.
       */
      if (!WAITING_LANES.includes(laneOfSlack(row, slackWords))) continue;
      const lane = laneOfSlack(row, slackWords);
      const days = idleDays(row.lastAt ?? row.at);
      items.push({
        id: `slack:${row.id}`,
        source: 'slack',
        action: 'answer',
        label: row.kind === 'dm' ? `@${row.channel}` : `#${row.channel}`,
        why: slackWhy(row, days),
        detail: `${row.from}: ${row.excerpt || reasonOfSlack(row, days)}`,
        url: row.permalink,
        to: `/slack#${row.id}`,
        days,
        tone: toneForDays(days),
        weight: lane === 'stale' ? WEIGHT.slackStale : WEIGHT.slackAsked,
      });
    }
  }

  if (jira) {
    for (const ticket of activeTickets(jira, vocab)) {
      // Only where sitting still is the problem: blocked and QC-failed tickets are loud
      // enough through their own status, and their age says nothing new.
      if (!countsAsStuck(ticket.status, stuckStatuses)) continue;
      const age = agingOf(ticket, aging);
      // Only the ones past their limit: a ticket moving normally is not waiting on anybody.
      if (!age?.over) continue;
      items.push({
        id: `ticket:${ticket.key}`,
        source: 'ticket',
        action: 'unstick',
        label: ticket.key,
        why: `stuck in ${ticket.status.toLowerCase()}`,
        detail: `${age.days} days in ${ticket.status}: ${ticket.summary}`,
        url: ticket.url,
        to: `/jira#${ticket.key}`,
        days: age.days,
        tone: age.tone === 'na' ? 'warn' : age.tone,
        weight: WEIGHT.ticketStuck,
      });
    }
  }

  return items
    .sort((a, b) => b.weight - a.weight || b.days - a.days)
    .slice(0, limit);
}

/** Everything the feed drew from, for the "N more" line under it. */
export const needsYouTotal = (args: Parameters<typeof needsYou>[0]): number =>
  needsYou({ ...args, limit: Number.MAX_SAFE_INTEGER }).length;

/** Counts for the strip across the top, each one a number somebody can act on. */
export interface Kpis {
  prs: number;
  reviews: number;
  tickets: number;
  /** Tickets past the days-in-status limit configured for their status. */
  stuck: number;
  conflicts: number;
  /**
   * Unread comments and changes on my tickets. Passed in rather than derived: the read mark
   * lives in the browser, not in any report, so only the caller can know it.
   */
  activity: number;
}

export const kpis = ({
  prs,
  reviews,
  jira,
  aging = {},
  stuckStatuses = [],
  vocab = DEFAULT_VOCAB,
  conflicts = 0,
  unread = 0,
}: {
  prs: PrsReport | null;
  reviews: ReviewsReport | null;
  /** Accepted and ignored: Slack has no tile, since the queue below already carries it. */
  slack?: SlackReport | null;
  jira: JiraReport | null;
  aging?: AgingLimits;
  stuckStatuses?: string[];
  vocab?: StatusVocab;
  conflicts?: number;
  unread?: number;
}): Kpis => {
  const reviewLanes = reviews ? toReviewLanes(reviews, jira) : new Map();
  const active = jira ? activeTickets(jira, vocab) : [];

  return {
    // Open PRs of mine that are not finished — the number in the sidebar's PR row.
    prs: (prs?.repos ?? []).reduce((n, group) => n + group.prs.length, 0),
    // Same rule as the feed: my verdict is out of date, not "somebody asked the team".
    reviews: (reviewLanes.get('changed') ?? []).length,
    tickets: active.length,
    stuck: active.filter(
      (ticket) => countsAsStuck(ticket.status, stuckStatuses) && agingOf(ticket, aging)?.over,
    ).length,
    conflicts,
    activity: unread,
  };
};
