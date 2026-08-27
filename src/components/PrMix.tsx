import { Link } from 'react-router-dom';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import type { PrsReport } from '../types';
import { LANES, toLanes } from '../prLanes';

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

/**
 * Where my open PRs stand, as one bar.
 *
 * Four numbers in a row is a list to read; the same four as segments is a shape to glance at —
 * whether the pile is mostly waiting on other people or mostly waiting on me is the question,
 * and proportion answers it faster than arithmetic. The counts stay as labels underneath,
 * because a segment nobody can measure is decoration.
 *
 * Deliberately not a donut: these are parts of one pile, and a bar compares lengths, which is
 * the comparison people read accurately.
 */
export const PrMix = ({ report }: PrMixProps) => {
  const lanes = toLanes(report);
  const parts = LANES.map((lane) => ({
    id: lane.id,
    title: lane.title,
    count: (lanes.get(lane.id) ?? []).length,
  })).filter((part) => part.count > 0);
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  if (total === 0) return null;

  return (
    <section className="panel pr-mix">
      <div className="mini-head">
        <span className="panel-icon badge-open" aria-hidden="true">
          <AltRouteRoundedIcon fontSize="small" />
        </span>
        <h2>My PRs</h2>
        <Link className="day-more" to="/prs">
          {total} open
        </Link>
      </div>

      <div className="pr-mix-bar" role="img" aria-label={parts.map((p) => `${p.count} ${p.title}`).join(', ')}>
        {parts.map((part) => (
          <span
            key={part.id}
            className="pr-mix-part"
            style={{ flexGrow: part.count, background: TONE[part.id] }}
            title={`${part.count} ${part.title.toLowerCase()}`}
          />
        ))}
      </div>

      <ul className="pr-mix-legend">
        {parts.map((part) => (
          <li key={part.id}>
            <span className="pr-mix-swatch" style={{ background: TONE[part.id] }} aria-hidden="true" />
            <strong>{part.count}</strong>
            <span>{part.title.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
