import type { SlackReport, SlackRow } from './types';
import { idleDays } from './prLanes';
import { plural } from './format';
import { INTENT_SAID, intentOf, type SlackWords } from './slackIntent';

/**
 * Slack sorted by what it needs from me.
 *
 * Unread is not the question. It clears the moment a channel is glanced at on a phone, and a
 * message somebody is waiting on an answer to then looks handled. What matters is whether the
 * last word is mine — and how long ago somebody else had it.
 */
export type SlackLaneId =
  | 'dms'
  | 'asked'
  | 'stale'
  | 'fyi'
  | 'nothing'
  | 'answered'
  | 'bots';

export interface SlackLaneMeta {
  id: SlackLaneId;
  title: string;
  hint: string;
}

/** Past this, an unanswered mention has usually been overtaken by events rather than forgotten. */
export const STALE_DAYS = 7;

export const SLACK_LANES: SlackLaneMeta[] = [
  {
    id: 'dms',
    title: 'Direct messages',
    hint: 'One-to-one, and the last word is theirs',
  },
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
  {
    id: 'fyi',
    title: 'Told you something',
    hint: 'Their last word is a statement, not a question — worth reading, not an answer',
  },
  {
    id: 'nothing',
    title: 'Nothing to answer',
    hint: '"thanks", "ok", an emoji — the conversation ended on their side',
  },
  { id: 'answered', title: 'You replied', hint: 'Your answer, or your ✅, is the last word' },
  { id: 'bots', title: 'Automation', hint: 'Alerts and app messages that named you' },
];

/** Lanes the morning queue draws from: everything else is readable but not waiting. */
export const WAITING_LANES: SlackLaneId[] = ['dms', 'asked', 'stale'];

/** Lanes worth a look but not an answer — folded on the page rather than in your face. */
export const QUIET_LANES: SlackLaneId[] = ['fyi', 'nothing', 'answered', 'bots'];

export interface SlackLaneRow {
  row: SlackRow;
  /** Days since the last message in the conversation. */
  idleDays: number;
  /** Why it is in this lane, in words. */
  reason: string;
}

export const laneOfSlack = (row: SlackRow, words: SlackWords = {}): SlackLaneId => {
  // A bot naming you is not a person waiting, however urgent the alert reads.
  if (row.bot) return 'bots';
  // A ✅ of mine answers as much as a sentence does — and this app offers that button.
  if (row.lastFromMe || row.iReacted) return 'answered';

  /*
   * What the last message actually is, which used to be ignored entirely. A conversation that
   * ended on "thanks" is not waiting on anybody, and a statement is not a question — neither
   * belongs in a morning queue, and both belong on the page.
   */
  const intent = intentOf(row, words);
  if (intent === 'closer') return 'nothing';
  /*
   * A statement is not work, in a channel or a DM.
   *
   * DMs were exempt in the first cut — a one-to-one felt too personal to filter — but the
   * measurement said otherwise: of three rows in the queue, two were DMs where somebody had
   * told me something and stopped, and one was a question. Keeping those two in front of me
   * every morning is what teaches me to stop reading the queue. They are one fold away on the
   * Slack page, and one click from coming back if the classifier got it wrong.
   */
  if (intent === 'statement') return 'fyi';

  // Age wins over kind: an unanswered DM from three weeks ago belongs with the other things
  // being carried rather than at the top of today's list.
  if (idleDays(row.lastAt ?? row.at) >= STALE_DAYS) return 'stale';
  return row.kind === 'dm' ? 'dms' : 'asked';
};

/** The row's one line: who is waiting, on what, and where the answer belongs. */
export const reasonOfSlack = (row: SlackRow, days: number, words: SlackWords = {}): string => {
  const where = row.kind === 'dm' ? 'in your DMs' : row.threadTs ? 'in a thread' : 'in the channel';
  if (row.bot) return `${row.from} · ${where}`;
  // Naming the ✅ matters: otherwise the row looks answered and nobody can see why.
  if (!row.lastFromMe && row.iReacted) {
    return days === 0 ? 'you reacted today' : `you reacted ${plural(days, 'day')} ago`;
  }
  if (row.lastFromMe) {
    return days === 0 ? 'you answered today' : `you answered ${plural(days, 'day')} ago`;
  }
  // A row whose after-state was never read must not claim nobody replied.
  if (row.stateRead === false) {
    return `${row.from} mentioned you ${days === 0 ? 'today' : `${plural(days, 'day')} ago`} ${where} · replies not read`;
  }
  const who = row.lastFrom && row.lastFrom !== row.from ? row.lastFrom : row.from;
  const waited = days === 0 ? 'today' : `${plural(days, 'day')} ago`;
  /*
   * Say what the last message *is*. "asked … no reply yet" on a row where nobody asked
   * anything is the wording that made the queue feel like it was inventing work.
   */
  const intent = intentOf(row, words);
  if (intent !== 'ask') {
    return `${who} ${INTENT_SAID[intent]} ${waited} ${where}`;
  }
  if (row.replies > 0) {
    return `${who} spoke last ${waited} · ${plural(row.replies, 'reply', 'replies')} ${where}`;
  }
  return `${row.from} asked ${waited} ${where}, no reply yet`;
};

/**
 * Every row in lanes, each lane oldest-first: what has waited longest is what is most likely
 * to have been forgotten, which is the only reason this page exists.
 */
export const toSlackLanes = (
  report: SlackReport,
  words: SlackWords = {},
): Map<SlackLaneId, SlackLaneRow[]> => {
  const lanes = new Map<SlackLaneId, SlackLaneRow[]>();
  for (const row of report.rows) {
    const days = idleDays(row.lastAt ?? row.at);
    const lane = laneOfSlack(row, words);
    const list = lanes.get(lane) ?? [];
    list.push({ row, idleDays: days, reason: reasonOfSlack(row, days, words) });
    lanes.set(lane, list);
  }
  for (const list of lanes.values()) list.sort((a, b) => b.idleDays - a.idleDays);
  return lanes;
};
