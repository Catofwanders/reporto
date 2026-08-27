import type { JiraReport, PrsReport, ReviewsReport, SlackReport } from './types';
import { idleDays, laneOf, reasonOf } from './prLanes';
import { laneOfReview, reasonOfReview, toReviewLanes } from './reviewLanes';
import { laneOfSlack, reasonOfSlack } from './slackLanes';
import { activeTickets } from './jiraActive';
import { type AgingLimits, agingOf } from './ticketAging';

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

export interface FeedItem {
  id: string;
  source: FeedSource;
  /** Short enough to scan: a repo and number, a ticket key, or a Slack handle. */
  label: string;
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
  limit = 7,
}: {
  prs: PrsReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  jira: JiraReport | null;
  aging?: AgingLimits;
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
          label: `${repoShort(group.repo)} #${pr.num}`,
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
      if (lane !== 'changed' && lane !== 'unseen' && lane !== 'unanswered') continue;
      for (const row of rows) {
        items.push({
          id: `review:${row.pr.url}`,
          source: 'review',
          label: `${repoShort(row.pr.repo)} #${row.pr.num}`,
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
      const lane = laneOfSlack(row);
      if (lane !== 'asked' && lane !== 'stale' && lane !== 'dms') continue;
      const days = idleDays(row.lastAt ?? row.at);
      items.push({
        id: `slack:${row.id}`,
        source: 'slack',
        label: row.kind === 'dm' ? `@${row.channel}` : `#${row.channel}`,
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
    for (const ticket of activeTickets(jira)) {
      const age = agingOf(ticket, aging);
      // Only the ones past their limit: a ticket moving normally is not waiting on anybody.
      if (!age?.over) continue;
      items.push({
        id: `ticket:${ticket.key}`,
        source: 'ticket',
        label: ticket.key,
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
  slack: number;
  tickets: number;
  stuck: number;
  conflicts: number;
}

export const kpis = ({
  prs,
  reviews,
  slack,
  jira,
  aging = {},
  conflicts = 0,
}: {
  prs: PrsReport | null;
  reviews: ReviewsReport | null;
  slack: SlackReport | null;
  jira: JiraReport | null;
  aging?: AgingLimits;
  conflicts?: number;
}): Kpis => {
  const reviewLanes = reviews ? toReviewLanes(reviews, jira) : new Map();
  const active = jira ? activeTickets(jira) : [];

  return {
    // Open PRs of mine that are not finished — the number in the sidebar's PR row.
    prs: (prs?.repos ?? []).reduce((n, group) => n + group.prs.length, 0),
    reviews:
      (reviewLanes.get('changed') ?? []).length +
      (reviewLanes.get('unseen') ?? []).length +
      (reviewLanes.get('unanswered') ?? []).length,
    slack: (slack?.rows ?? []).filter((row) => {
      const lane = laneOfSlack(row);
      return lane === 'asked' || lane === 'dms' || lane === 'stale';
    }).length,
    tickets: active.length,
    stuck: active.filter((ticket) => agingOf(ticket, aging)?.over).length,
    conflicts,
  };
};
