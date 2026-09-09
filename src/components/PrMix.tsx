import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import type { PrsReport } from '../types';
import { LANES, toLanes } from '../prLanes';
import { MixCard } from './MixCard';

interface PrMixProps {
  report: PrsReport;
}

/** Which lane gets which ink, so the bar and the PR page agree without a legend lookup. */
const TONE: Record<string, string> = {
  'needs-you': 'var(--bad-ink)',
  waiting: 'var(--open-ink)',
  ready: 'var(--ok-ink)',
  drafts: 'var(--na-ink)',
};

/** Where my open PRs stand, as one bar. */
export const PrMix = ({ report }: PrMixProps) => {
  const lanes = toLanes(report);
  const parts = LANES.map((lane) => {
    const rows = lanes.get(lane.id) ?? [];
    return {
      id: lane.id,
      title: lane.title,
      count: rows.length,
      ink: TONE[lane.id],
      // Named rather than counted: the segment says how many, the popup says which. No author
      // line here — every PR in this report is mine, so naming me four times says nothing.
      items: rows.map((row) => ({
        id: row.pr.url,
        name: `${row.repo}#${row.pr.num}`,
        title: row.pr.title,
        note: row.reason,
      })),
    };
  }).filter((part) => part.count > 0);
  const total = parts.reduce((sum, part) => sum + part.count, 0);

  return (
    <MixCard
      icon={<AltRouteRoundedIcon fontSize="small" />}
      badge="badge-open"
      title="My PRs"
      to="/prs"
      linkLabel={`${total} open`}
      parts={parts}
      empty="No open pull requests."
    />
  );
};
