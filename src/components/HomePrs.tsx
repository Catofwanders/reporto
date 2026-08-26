import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import type { PrsReport } from '../types';
import { LANES, type LaneId, type LanePr, agingTone, toLanes } from '../prLanes';
import { MiniPanel } from './MiniPanel';

interface HomePrsProps {
  report: PrsReport;
}

const SHOWN = 4;

/** Lanes in the order they need attention: your move, then the button, then somebody else. */
const ORDER: LaneId[] = ['needs-you', 'ready', 'waiting', 'drafts'];

/**
 * Your open PRs, shortened to the ones holding something up. The lane counts carry the rest,
 * so the module says both "two need me" and "nothing else is stuck" without listing all of
 * them — the lanes on the PR page are where the work happens.
 */
export const HomePrs = ({ report }: HomePrsProps) => {
  const lanes = toLanes(report);
  const rows: LanePr[] = ORDER.flatMap((id) => lanes.get(id) ?? []);
  const open = report.repos.reduce((n, group) => n + group.prs.length, 0);

  return (
    <MiniPanel
      icon={AltRouteRoundedIcon}
      badge="badge-open"
      title="My open PRs"
      kind="prs"
      to="/prs"
      linkLabel={`All PRs · ${open} open`}
      count={rows.length}
      empty="No open PRs."
      summary={
        <ul className="mini-counts">
          {LANES.filter((lane) => (lanes.get(lane.id) ?? []).length > 0).map((lane) => (
            <li key={lane.id}>
              <span className="mini-count">{(lanes.get(lane.id) ?? []).length}</span>
              <span className="mini-count-label">{lane.title}</span>
            </li>
          ))}
        </ul>
      }
    >
      <ul className="mini-rows">
        {rows.slice(0, SHOWN).map(({ pr, repo, idleDays, reason }) => (
          <li key={pr.url} className="mini-row">
            <span
              className={`pr-age chip-${agingTone(idleDays)}`}
              title={`last moved ${new Date(pr.updatedAt).toLocaleString('en-GB')}`}
            >
              {idleDays === 0 ? 'today' : `${idleDays}d`}
            </span>
            <div className="mini-row-body">
              <a href={pr.url} target="_blank" rel="noopener noreferrer" title={pr.title}>
                {repo} #{pr.num}
              </a>
              <span className="mini-row-meta">{reason}</span>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && <p className="mini-rest">{rows.length - SHOWN} more</p>}
    </MiniPanel>
  );
};
