import { useMemo } from 'react';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import type { JiraReport, ReviewsReport } from '../types';
import { toReviewLanes } from '../reviewLanes';
import { reviewMix } from '../reviewMix';
import { MixCard } from './MixCard';

interface ReviewMixProps {
  report: ReviewsReport;
  /** Only for the lane rows' ticket status; the counts do not need it. */
  jira?: JiraReport | null;
}

/** The same ink as the PR card: red is my move, wherever the pile came from. */
const TONE: Record<string, string> = {
  'needs-you': 'var(--bad-ink)',
  waiting: 'var(--open-ink)',
  bots: 'var(--na-ink)',
};

/** Where the reviews other people are waiting on stand, as one bar. */
export const ReviewMix = ({ report, jira = null }: ReviewMixProps) => {
  const parts = useMemo(
    () => reviewMix(toReviewLanes(report, jira)).map((part) => ({ ...part, ink: TONE[part.id] })),
    [report, jira],
  );
  const total = parts.reduce((sum, part) => sum + part.count, 0);

  return (
    <MixCard
      icon={<VisibilityRoundedIcon fontSize="small" />}
      badge="badge-qcout"
      title="Reviews for you"
      to="/reviews"
      linkLabel={`${total} to review`}
      parts={parts}
      empty="Nothing waiting on your review."
    />
  );
};
