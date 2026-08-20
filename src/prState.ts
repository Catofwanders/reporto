import type { DeployQcState, OpenPr } from './types';

/**
 * What the PR is actually waiting on, which is not the same as GitHub's reviewDecision.
 * GitHub collapses "nobody has looked yet" and "somebody commented and I have since
 * pushed" into states that read identically in a list, so derive the distinction here:
 *
 * - `awaiting-review`      nobody has reviewed yet — waiting on a reviewer
 * - `commented`            reviewed, and no commit since — waiting on me
 * - `awaiting-re-review`   reviewed, and I pushed after that — waiting on a reviewer again
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

  const pushed = pr.lastCommitAt ?? null;
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
 * How the PR sits against deploy-qc, for the chip beside the review state. `aheadBy` is
 * what matters: it counts commits the QC branch is missing, so zero means deployed — the
 * branch being BEHIND just means QC has moved on since, which is the normal steady state.
 * Returns null when there is nothing to claim: no deploy-qc branch, or no comparison.
 */
export const qcChip = (
  deployQc: DeployQcState | null | undefined,
): { label: string; tone: 'qc' | 'qcout'; title: string } | null => {
  if (!deployQc) return null;
  if (deployQc.aheadBy === 0) {
    return {
      label: 'on QC',
      tone: 'qc',
      title:
        deployQc.status === 'IDENTICAL'
          ? 'deploy-qc is at this exact commit'
          : `merged into deploy-qc; deploy-qc is ${deployQc.behindBy} commits further along`,
    };
  }
  return {
    label: `off QC · ${deployQc.aheadBy}`,
    tone: 'qcout',
    title: `${deployQc.aheadBy} commit${deployQc.aheadBy === 1 ? '' : 's'} on this branch are not in deploy-qc`,
  };
};
