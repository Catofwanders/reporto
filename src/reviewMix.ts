import type { ReviewLaneId, ReviewRow } from './reviewLanes';
import { REVIEW_LANES } from './reviewLanes';

/**
 * The review queue as one bar: whose move is it.
 *
 * The queue's six lanes are the right grain for the page — they say what to do — but they are
 * the wrong grain for a glance, and six segments in a thin bar is six hues nobody can tell
 * apart. So the lanes fold into the same three groups the PR card uses, and the group keeps
 * the lane names in its hover text rather than losing them.
 *
 * "Your comments unanswered" sits under *waiting*, not under *needs you*: you already said
 * your part, and the next move is the author's.
 */
export type ReviewMixId = 'needs-you' | 'waiting' | 'bots';

interface ReviewMixMeta {
  id: ReviewMixId;
  title: string;
  lanes: ReviewLaneId[];
}

export const REVIEW_MIX: ReviewMixMeta[] = [
  { id: 'needs-you', title: 'Needs you', lanes: ['changed', 'unseen'] },
  { id: 'waiting', title: 'Waiting on others', lanes: ['unanswered', 'approved', 'quiet'] },
  { id: 'bots', title: 'Automation', lanes: ['bots'] },
];

export interface ReviewMixPart {
  id: ReviewMixId;
  title: string;
  count: number;
  /** The lanes behind the number, so folding them does not hide them. */
  detail: string;
}

const laneTitle = (id: ReviewLaneId): string =>
  REVIEW_LANES.find((lane) => lane.id === id)?.title ?? id;

/** Groups with nothing in them are dropped — an empty segment is decoration. */
export const reviewMix = (lanes: Map<ReviewLaneId, ReviewRow[]>): ReviewMixPart[] =>
  REVIEW_MIX.map((group) => {
    const counts = group.lanes
      .map((id) => ({ id, count: (lanes.get(id) ?? []).length }))
      .filter((lane) => lane.count > 0);
    return {
      id: group.id,
      title: group.title,
      count: counts.reduce((sum, lane) => sum + lane.count, 0),
      detail: counts.map((lane) => `${lane.count} ${laneTitle(lane.id).toLowerCase()}`).join(', '),
    };
  }).filter((part) => part.count > 0);
