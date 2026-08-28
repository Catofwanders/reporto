import type { OpenPr, PrRepoGroup, PrsReport } from './types';
import { prState, qcChip } from './prState';
import { plural } from './format';

/**
 * Which lane a PR belongs in — the answer to "who is holding the ball", which is the only
 * question this page exists to answer. Repo is metadata and makes a poor grouping: it sorts
 * work by where it lives rather than by whether anything is waiting on you.
 */
export type LaneId = 'needs-you' | 'waiting' | 'ready' | 'drafts';

export interface LaneMeta {
  id: LaneId;
  title: string;
  /** Said once per lane, so the rows do not have to repeat it. */
  hint: string;
}

export const LANES: LaneMeta[] = [
  { id: 'needs-you', title: 'Needs you', hint: 'Nothing moves until you push, answer or decide' },
  { id: 'waiting', title: 'Waiting on others', hint: 'Out of your hands — nudge if it has sat too long' },
  { id: 'ready', title: 'Ready to merge', hint: 'Approved; the only thing left is the button' },
  { id: 'drafts', title: 'Drafts', hint: 'Not visible to reviewers yet' },
];

export interface LanePr {
  repo: string;
  pr: OpenPr;
  /** Whole days since the PR last moved. */
  idleDays: number;
  /** Why it is in this lane, in words. */
  reason: string;
  /** Approved and already on deploy-qc: the one row worth pulling the eye. */
  mergeReady: boolean;
  /**
   * The row's own colour, for the two states worth spotting without reading: approved is
   * finished work waiting on a button, a draft is not in anybody's queue at all. Everything
   * else stays neutral — colouring every row would mean colouring nothing.
   */
  tone: 'ok' | 'na' | null;
}

export const idleDays = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * Aging tone. Two days is the line: inside it a silent PR is normal, past it somebody has
 * forgotten, and past four the nudge is overdue.
 */
export const agingTone = (days: number): 'na' | 'warn' | 'bad' => {
  if (days >= 4) return 'bad';
  if (days >= 2) return 'warn';
  return 'na';
};

export const laneOf = (pr: OpenPr): LaneId => {
  // A draft cannot be reviewed at all, so its state says nothing about who is waiting.
  if (pr.draft) return 'drafts';
  const state = prState(pr);
  if (state === 'approved') return 'ready';
  if (state === 'changes-requested' || state === 'commented') return 'needs-you';
  return 'waiting';
};

const threads = (pr: OpenPr) => pr.unansweredThreads ?? 0;

/**
 * Said after a state when the only thing that landed since the review was a branch sync.
 * Naming the merger only when it was somebody else: "by @me" on my own PR says nothing.
 */
const syncNote = (pr: OpenPr, me?: string) => {
  if (!pr.syncOnlySinceReview) return '';
  const by = pr.lastReworkBy && pr.lastReworkBy !== me ? ` by @${pr.lastReworkBy}` : '';
  return ` (a base-branch merge${by} since is not a re-review)`;
};

/**
 * The row's one-line reason. Concrete: what is true, and what it implies you do.
 *
 * `me` is the report's author, so a push by somebody else onto my branch can say who —
 * "waiting on a re-review" reads very differently when a colleague put the commit there.
 */
export const reasonOf = (pr: OpenPr, days: number, me?: string): string => {
  if (pr.draft) return 'draft — mark it ready or close it';

  const state = prState(pr);
  const open = threads(pr);

  if (state === 'changes-requested') {
    return open > 0
      ? `changes requested · ${plural(open, 'comment')} unanswered`
      : 'changes requested — push a fix';
  }
  if (state === 'commented') {
    if (open > 0) return `${plural(open, 'comment')} to answer`;
    return `reviewed — your move${syncNote(pr, me)}`;
  }
  if (state === 'approved') {
    const qc = qcChip(pr.deployQc);
    if (qc?.tone === 'qc') return 'approved · on QC — merge it';
    if (pr.deployQc && pr.deployQc.aheadBy > 0) {
      return `approved — ${plural(pr.deployQc.aheadBy, 'commit')} not on deploy-qc yet`;
    }
    return 'approved — merge it';
  }
  if (state === 'awaiting-re-review') {
    // Name the pusher only when it was not me: on my own PR "you pushed" is noise.
    const who = pr.lastReworkBy && pr.lastReworkBy !== me ? `@${pr.lastReworkBy}` : 'you';
    return days >= 2
      ? `${who} pushed after review — ${days} days without a look`
      : `${who} pushed after review — waiting on a re-review`;
  }
  // awaiting-review
  if (days >= 4) return `no review yet — ${days} days, chase it`;
  if (days >= 2) return `no review yet — ${days} days, worth a nudge`;
  return 'waiting for a first review';
};

/**
 * Every PR sorted into lanes, each lane oldest-first: the thing that has been stuck longest
 * is the thing most likely to be forgotten, so it goes on top.
 */
export const toLanes = (report: PrsReport): Map<LaneId, LanePr[]> => {
  const lanes = new Map<LaneId, LanePr[]>();
  const rows = report.repos.flatMap((group: PrRepoGroup) =>
    group.prs.map((pr) => {
      const days = idleDays(pr.updatedAt);
      const qc = qcChip(pr.deployQc);
      const approved = prState(pr) === 'approved' && !pr.draft;
      return {
        repo: group.repo,
        pr,
        idleDays: days,
        reason: reasonOf(pr, days, report.author),
        mergeReady: approved && qc?.tone === 'qc',
        tone: pr.draft ? ('na' as const) : approved ? ('ok' as const) : null,
      };
    }),
  );

  for (const row of rows) {
    const lane = laneOf(row.pr);
    const list = lanes.get(lane) ?? [];
    list.push(row);
    lanes.set(lane, list);
  }
  for (const list of lanes.values()) list.sort((a, b) => b.idleDays - a.idleDays);
  return lanes;
};
