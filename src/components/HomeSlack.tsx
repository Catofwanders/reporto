import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import type { SlackReport } from '../types';
import { agingTone } from '../prLanes';
import { SLACK_LANES, type SlackLaneId, type SlackLaneRow, toSlackLanes } from '../slackLanes';
import { MiniPanel } from './MiniPanel';

interface HomeSlackProps {
  report: SlackReport;
}

const SHOWN = 4;

/** Only the lanes that are mine to move; a reply I already sent needs nothing. */
const ORDER: SlackLaneId[] = ['dms', 'asked', 'stale'];

/**
 * Slack messages waiting on a reply. Same shape as the review queue, for the same reason:
 * the dashboard's job is to say what needs me, and an unanswered question in a channel is as
 * much of a queue as an unreviewed PR.
 */
export const HomeSlack = ({ report }: HomeSlackProps) => {
  const lanes = toSlackLanes(report);
  const rows: SlackLaneRow[] = ORDER.flatMap((id) => lanes.get(id) ?? []);

  return (
    <MiniPanel
      icon={ForumRoundedIcon}
      badge="badge-qc"
      title="Waiting on a reply"
      kind="slack"
      to="/slack"
      linkLabel={`All mentions · ${report.rows.filter((row) => !row.bot).length} in ${report.days}d`}
      count={rows.length}
      empty="Nobody is waiting on you in Slack."
      summary={
        <ul className="mini-counts">
          {SLACK_LANES.filter(
            (lane) => ORDER.includes(lane.id) && (lanes.get(lane.id) ?? []).length > 0,
          ).map((lane) => (
            <li key={lane.id}>
              <span className="mini-count">{(lanes.get(lane.id) ?? []).length}</span>
              <span className="mini-count-label">{lane.title}</span>
            </li>
          ))}
        </ul>
      }
    >
      <ul className="mini-rows">
        {rows.slice(0, SHOWN).map(({ row, idleDays }) => (
          <li key={row.id} className="mini-row">
            <span
              className={`pr-age chip-${agingTone(idleDays)}`}
              title={`last message ${new Date(row.lastAt ?? row.at).toLocaleString('en-GB')}`}
            >
              {idleDays === 0 ? 'today' : `${idleDays}d`}
            </span>
            <div className="mini-row-body">
              <a href={row.permalink} target="_blank" rel="noopener noreferrer" title={row.excerpt}>
                {row.kind === 'dm' ? `@${row.channel}` : `#${row.channel}`}
              </a>
              <span className="mini-row-meta">
                @{row.from} · {row.excerpt}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && <p className="mini-rest">{rows.length - SHOWN} more</p>}
    </MiniPanel>
  );
};
