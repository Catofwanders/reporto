import type { DeployQcState, OpenPr } from './types';
import { plural } from './format';

/**
 * What the PR is actually waiting on, which is not the same as GitHub's reviewDecision.
 * GitHub collapses "nobody has looked yet" and "somebody commented and I have since
 * pushed" into states that read identically in a list, so derive the distinction here:
 *
 * - `awaiting-review`      nobody has reviewed yet — waiting on a reviewer
 * - `commented`            reviewed, and no work since — waiting on me
 * - `awaiting-re-review`   reviewed, and real work landed after — waiting on a reviewer again
 *
 * APPROVED and CHANGES_REQUESTED are verdicts rather than open questions, so they keep
 * their own state.
 */
export type PrState =
  | 'approved'
  | 'changes-requested'
  | 'awaiting-review'
  | 'commented'
  | 'awaiting-re-review';

export const PR_STATE_LABEL: Record<PrState, string> = {
  approved: 'approved',
  'changes-requested': 'changes requested',
  'awaiting-review': 'awaiting review',
  commented: 'commented',
  'awaiting-re-review': 'awaiting re-review',
};

/**
 * The same five, short enough for a board card, which is 14rem wide and already carrying a
 * summary, a key, an age pill and a status chip.
 */
export const PR_STATE_SHORT: Record<PrState, string> = {
  approved: 'approved',
  'changes-requested': 'changes',
  'awaiting-review': 'no review',
  commented: 'commented',
  'awaiting-re-review': 're-review',
};

export const PR_STATE_TONE: Record<PrState, 'ok' | 'bad' | 'open' | 'warn'> = {
  approved: 'ok',
  'changes-requested': 'bad',
  'awaiting-review': 'open',
  commented: 'bad',
  'awaiting-re-review': 'warn',
};

export const prState = (pr: OpenPr): PrState => {
  if (pr.review === 'APPROVED') return 'approved';
  if (pr.review === 'CHANGES_REQUESTED') return 'changes-requested';

  const reviewed = pr.lastReviewAt ?? null;
  if (!reviewed) {
    // Reports written before the puller carried timestamps only know "there are threads",
    // which means reviewed — treat the ball as mine rather than inventing a push.
    return pr.review === 'COMMENTED' ? 'commented' : 'awaiting-review';
  }

  /*
   * Only work counts as a push here. A merge of the base branch — the Update branch button,
   * or whatever keeps the branch current — gives a reviewer nothing to re-read, and letting
   * it flip the state moved the PR out of "needs you" while the ball was still mine.
   *
   * A report written before the puller separated the two knows neither field, and there the
   * tip commit is still the best guess. Absent means "not carried", not "nothing happened":
   * `lastReworkAt` is explicitly null when the puller looked and found no work since, so
   * falling back on null would put every base-branch merge straight back in.
   */
  const knowsRework = pr.lastReworkAt !== undefined || pr.syncOnlySinceReview !== undefined;
  const pushed = knowsRework ? (pr.lastReworkAt ?? null) : (pr.lastCommitAt ?? null);
  return pushed && pushed > reviewed ? 'awaiting-re-review' : 'commented';
};

/**
 * Waiting on somebody else, so worth nudging. Drafts cannot be reviewed at all;
 * `commented` and `changes-requested` are waiting on me.
 */
export const awaitingOthers = (pr: OpenPr) => {
  if (pr.draft) return false;
  const state = prState(pr);
  return state === 'awaiting-review' || state === 'awaiting-re-review';
};

/**
 * How much of this PR's own work deploy-qc has not got.
 *
 * Not `aheadBy`, which is how far two branches have drifted apart and counts three things
 * that say nothing about this PR: the base-branch merge the Update branch button leaves,
 * every commit the branch carries from other people's merged work, and the PR's own commits
 * where deploy-qc holds a cherry-picked copy under a different id. All three have produced an
 * "off QC" chip on work that was on QC. `aheadWork` is the count with them taken out, and the
 * raw figure is the fallback for where the puller could not say.
 */
export const qcAheadWork = (deployQc: DeployQcState): number =>
  deployQc.aheadWork ?? deployQc.aheadBy;

/** Deployed to QC as far as this PR is concerned. Null when there is nothing to claim. */
export const onQc = (deployQc: DeployQcState | null | undefined): boolean | null =>
  deployQc ? qcAheadWork(deployQc) === 0 : null;

/**
 * How the PR sits against deploy-qc, for the chip beside the review state. Zero work commits
 * ahead means deployed — the branch being BEHIND just means QC has moved on since, which is
 * the normal steady state. Returns null when there is nothing to claim: no deploy-qc branch,
 * or no comparison.
 */
/**
 * Why a branch that is *ahead* of deploy-qc is nonetheless deployed. Said, rather than left
 * for the reader to reconcile with the number in the tooltip beside it.
 */
const onQcTitle = (deployQc: DeployQcState): string => {
  if (deployQc.qcMatch === 'content') {
    return `deploy-qc carries this PR's commits under different ids — cherry-picked or squashed onto it`;
  }
  if (deployQc.aheadBy > 0) {
    return `every commit of this PR is in deploy-qc; the ${plural(deployQc.aheadBy, 'commit')} this branch has on top ${deployQc.aheadBy === 1 ? 'is' : 'are'} other people's work or a base-branch merge`;
  }
  return deployQc.status === 'IDENTICAL'
    ? 'deploy-qc is at this exact commit'
    : `merged into deploy-qc; deploy-qc is ${deployQc.behindBy} commits further along`;
};

export const qcChip = (
  deployQc: DeployQcState | null | undefined,
): { label: string; tone: 'qc' | 'qcout'; title: string } | null => {
  if (!deployQc) return null;
  const ahead = qcAheadWork(deployQc);
  if (ahead === 0) {
    return { label: 'on QC', tone: 'qc', title: onQcTitle(deployQc) };
  }
  return {
    label: `off QC · ${ahead}`,
    tone: 'qcout',
    title:
      deployQc.aheadWork === undefined
        ? `this branch is ${plural(ahead, 'commit')} ahead of deploy-qc; which of them are this PR's own could not be read`
        : `${plural(ahead, 'commit')} of this PR ${ahead === 1 ? 'is' : 'are'} not in deploy-qc`,
  };
};
