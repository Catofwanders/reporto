import type { OpenPr, Pr, PrsReport } from './types';
import { PR_STATE_LABEL, PR_STATE_SHORT, PR_STATE_TONE, prState, type PrState } from './prState';

/**
 * The review state of a PR named on a ticket.
 *
 * A board card said `◌ orders-api#77` and nothing else, so the two cases a reader cares about
 * — approved and waiting to be merged, versus changes requested and waiting on me — looked
 * identical. The distinction already exists in `prState`; what was missing was the join, since
 * a ticket names its PRs by `repo#num` while the review data lives in the open-PR report.
 *
 * So this is that join, in one place, used by the board, the list and the drawer. Three
 * copies of it is how one of them starts disagreeing about the same PR.
 */
export interface TicketPrReview {
  state: PrState;
  /** Full wording, for the list and the drawer. */
  label: string;
  /** Two or three characters shorter, for a board card. */
  short: string;
  tone: 'ok' | 'bad' | 'open' | 'warn';
}

/** The open-PR report indexed the way a ticket refers to a PR. */
export const openPrIndex = (prs: PrsReport | null | undefined): Map<string, OpenPr> =>
  new Map(
    (prs?.repos ?? []).flatMap((group) =>
      group.prs.map((pr) => [`${group.repo}#${pr.num}`, pr] as const),
    ),
  );

/**
 * What `pullTicketPrs` wrote on the ticket when it matched the PR — a coarse version of the
 * same fact, and the only one available for a repo the open-PR report does not cover.
 */
const FROM_NOTE: Record<string, PrState> = {
  approved: 'approved',
  'changes requested': 'changes-requested',
};

/**
 * `null` where there is nothing honest to show: a merged or closed PR, whose review is
 * history, and an open one the report cannot describe. "Awaiting review" is a claim, and
 * guessing it for a PR nobody has looked *for* is exactly the kind of confident wrong answer
 * this dashboard is supposed to avoid.
 */
export function reviewOf(pr: Pr, open: Map<string, OpenPr>): TicketPrReview | null {
  if (pr.state !== 'open') return null;

  const found = open.get(`${pr.repo}#${pr.num}`);
  // A draft is not a review state: nobody has been asked yet, which the draft chip says.
  if (found?.draft) return null;

  const state = found ? prState(found) : FROM_NOTE[(pr.note ?? '').trim().toLowerCase()];
  if (!state) return null;

  return {
    state,
    label: PR_STATE_LABEL[state],
    short: PR_STATE_SHORT[state],
    tone: PR_STATE_TONE[state],
  };
}
