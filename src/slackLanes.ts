import type { SlackReport, SlackRow } from './types';
import { idleDays } from './prLanes';

/**
 * Slack sorted by what it needs from me.
 *
 * Unread is not the question. It clears the moment a channel is glanced at on a phone, and a
 * message somebody is waiting on an answer to then looks handled. What matters is whether the
 * last word is mine — and how long ago somebody else had it.
 */
export type SlackLaneId = 'asked' | 'stale' | 'answered' | 'bots';

export interface SlackLaneMeta {
  id: SlackLaneId;
  title: string;
  hint: string;
}

/** Past this, an unanswered mention has usually been overtaken by events rather than forgotten. */
export const STALE_DAYS = 7;

export const SLACK_LANES: SlackLaneMeta[] = [
  {
    id: 'asked',
    title: 'Waiting on you',
    hint: 'Somebody addressed you and the last word is still theirs',
  },
  {
    id: 'stale',
    title: 'Old and unanswered',
    hint: `Over ${STALE_DAYS} days — answer it or let it go, but stop carrying it`,
  },
  { id: 'answered', title: 'You replied', hint: 'Your answer is the last word' },
  { id: 'bots', title: 'Automation', hint: 'Alerts and app messages that named you' },
];

export interface SlackLaneRow {
  row: SlackRow;
  /** Days since the last message in the conversation. */
  idleDays: number;
  /** Why it is in this lane, in words. */
  reason: string;
}

export const laneOfSlack = (row: SlackRow): SlackLaneId => {
  // A bot naming you is not a person waiting, however urgent the alert reads.
  if (row.bot) return 'bots';
  if (row.lastFromMe) return 'answered';
  return idleDays(row.lastAt ?? row.at) >= STALE_DAYS ? 'stale' : 'asked';
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The row's one line: who is waiting, on what, and where the answer belongs. */
export const reasonOfSlack = (row: SlackRow, days: number): string => {
  const where = row.threadTs ? 'in a thread' : 'in the channel';
  if (row.bot) return `${row.from} · ${where}`;
  if (row.lastFromMe) {
    return days === 0 ? 'you answered today' : `you answered ${plural(days, 'day')} ago`;
  }
  const who = row.lastFrom && row.lastFrom !== row.from ? row.lastFrom : row.from;
  const waited = days === 0 ? 'today' : `${plural(days, 'day')} ago`;
  if (row.replies > 0) {
    return `${who} spoke last ${waited} · ${plural(row.replies, 'reply')} ${where}`;
  }
  return `${row.from} asked ${waited} ${where}, no reply yet`;
};

/**
 * Every row in lanes, each lane oldest-first: what has waited longest is what is most likely
 * to have been forgotten, which is the only reason this page exists.
 */
export const toSlackLanes = (report: SlackReport): Map<SlackLaneId, SlackLaneRow[]> => {
  const lanes = new Map<SlackLaneId, SlackLaneRow[]>();
  for (const row of report.rows) {
    const days = idleDays(row.lastAt ?? row.at);
    const lane = laneOfSlack(row);
    const list = lanes.get(lane) ?? [];
    list.push({ row, idleDays: days, reason: reasonOfSlack(row, days) });
    lanes.set(lane, list);
  }
  for (const list of lanes.values()) list.sort((a, b) => b.idleDays - a.idleDays);
  return lanes;
};

/** Links worth copying into a catch-up session: the ones still waiting on a reply. */
export const slackLinks = (lanes: Map<SlackLaneId, SlackLaneRow[]>): string[] =>
  [...(lanes.get('asked') ?? []), ...(lanes.get('stale') ?? [])]
    .map((entry) => entry.row.permalink)
    .filter(Boolean);
