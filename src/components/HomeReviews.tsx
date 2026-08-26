import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import type { JiraReport, ReviewsReport } from '../types';
import { agingTone } from '../prLanes';
import { REVIEW_LANES, type ReviewLaneId, type ReviewRow, toReviewLanes } from '../reviewLanes';
import { MiniPanel } from './MiniPanel';

interface HomeReviewsProps {
  report: ReviewsReport;
  jira: JiraReport | null;
}

const SHOWN = 4;

/**
 * Only the lanes that are actually mine to move. "You approved" and "nothing new since" are
 * waiting on other people, and bot PRs are waiting on nobody — none of them belong on a
 * dashboard whose job is to say what to do next.
 */
const ORDER: ReviewLaneId[] = ['changed', 'unseen', 'unanswered'];

/**
 * Other people's PRs waiting on me. This sits where the month's statistics used to: the
 * numbers were context to scroll past, and a review somebody has been waiting four days for
 * is not.
 */
export const HomeReviews = ({ report, jira }: HomeReviewsProps) => {
  const lanes = toReviewLanes(report, jira);
  const rows: ReviewRow[] = ORDER.flatMap((id) => lanes.get(id) ?? []);

  return (
    <MiniPanel
      icon={VisibilityRoundedIcon}
      badge="badge-qcout"
      title="Waiting on my review"
      kind="reviews"
      to="/reviews"
      linkLabel={`Review queue · ${report.prs.filter((pr) => !pr.bot).length} in it`}
      count={rows.length}
      empty="Nothing needs your review."
      summary={
        <ul className="mini-counts">
          {REVIEW_LANES.filter(
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
        {rows.slice(0, SHOWN).map(({ pr, idleDays, reason }) => (
          <li key={pr.url} className="mini-row">
            <span
              className={`pr-age chip-${agingTone(idleDays)}`}
              title={`last commit ${new Date(
                pr.lastCommitAt ?? pr.updatedAt,
              ).toLocaleString('en-GB')}`}
            >
              {idleDays === 0 ? 'today' : `${idleDays}d`}
            </span>
            <div className="mini-row-body">
              <a href={pr.url} target="_blank" rel="noopener noreferrer" title={pr.title}>
                {pr.repo} #{pr.num}
              </a>
              <span className="mini-row-meta">
                @{pr.author} · {reason}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && <p className="mini-rest">{rows.length - SHOWN} more</p>}
    </MiniPanel>
  );
};
