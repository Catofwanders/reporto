import { useState } from 'react';
import { Link } from 'react-router-dom';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import type { JiraReport, ReviewsReport } from '../types';
import {
  REVIEW_LANES,
  type ReviewRow,
  reviewLinks,
  sizeLabel,
  sizeTone,
  toReviewLanes,
} from '../reviewLanes';
import { agingTone } from '../prLanes';
import { formatStatus } from '../jiraStatus';
import { CopyPrLinks } from '../components/CopyPrLinks';
import { RefreshButton } from '../components/RefreshButton';
import { useHashTarget } from '../useHashTarget';

interface ReviewsPageProps {
  report: ReviewsReport | null;
  jira: JiraReport | null;
}

const Row = ({ row }: { row: ReviewRow }) => {
  const { pr, idleDays, openDays, reason, ticketStatus } = row;
  return (
    <article className="pr-row" id={`${pr.repo}-${pr.num}`}>
      <span
        className={`pr-age chip-${agingTone(idleDays)}`}
        title={`last commit ${new Date(
          pr.lastCommitAt ?? pr.updatedAt,
        ).toLocaleString('en-GB')} · opened ${openDays}d ago`}
      >
        {idleDays === 0 ? 'today' : `${idleDays}d`}
      </span>

      <div className="pr-row-body">
        <div className="pr-row-top">
          <a className="ref" href={pr.url} target="_blank" rel="noopener noreferrer">
            #{pr.num}
          </a>
          <span className="pr-row-repo">{pr.repo}</span>
          {/* Whose work it is: a review queue is a list of people waiting, not of branches. */}
          <span className="review-author">@{pr.author}</span>
          {pr.ticket && <span className="pr-row-ticket">{pr.ticket}</span>}
          {ticketStatus && (
            <span className="chip chip-na" title="status of the linked ticket">
              {formatStatus(ticketStatus)}
            </span>
          )}
          {pr.draft && <span className="chip chip-na">draft</span>}
          {/* Size decides whether this fits in the gap before the next meeting. */}
          <span className={`chip chip-${sizeTone(pr)}`} title="how much there is to read">
            {sizeLabel(pr)}
          </span>
          {pr.unresolvedThreads > 0 && (
            <span className="chip chip-bad" title="unresolved review threads, from anyone">
              {pr.unresolvedThreads} open
            </span>
          )}
        </div>

        <p className="pr-row-title">
          <a href={pr.url} target="_blank" rel="noopener noreferrer">
            {pr.title}
          </a>
        </p>

        <p className="pr-row-reason">{reason}</p>
      </div>
    </article>
  );
};

/**
 * The review queue, sorted by what it needs from me.
 *
 * GitHub's own notion is "review requested", which drops a PR the moment a review is
 * submitted — so the thing you most want to see, a PR you approved and the author then
 * pushed to, is exactly what it hides. That case gets the top lane here.
 */
export const ReviewsPage = ({ report, jira }: ReviewsPageProps) => {
  const [hideBots, setHideBots] = useState(true);
  useHashTarget([report]);

  if (!report) {
    return (
      <main className="grid">
        <p className="status">
          No review report yet — press the bolt beside Reviews in the sidebar.
        </p>
      </main>
    );
  }

  const lanes = toReviewLanes(report, jira);
  const links = reviewLinks(lanes);
  const bots = (lanes.get('bots') ?? []).length;
  const mine = report.prs.filter((pr) => !pr.bot).length;

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-qcout" aria-hidden="true">
              <VisibilityRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>Your review queue</h2>
              <p className="panel-sub">
                {mine} from people{bots > 0 && `, ${bots} from bots`} · reviewing as{' '}
                {report.reviewer}
              </p>
            </div>
          </div>
          <span className="panel-meta">
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={hideBots}
                onChange={() => setHideBots(!hideBots)}
              />
              hide bots
            </label>
            {report.date}
            <RefreshButton kind="reviews" />
          </span>
        </div>

        {report.prs.length === 0 && <p className="status">Nothing waiting on your review.</p>}

        {REVIEW_LANES.map((lane) => {
          if (lane.id === 'bots' && hideBots) return null;
          const rows = lanes.get(lane.id) ?? [];
          if (rows.length === 0) return null;
          return (
            <section key={lane.id} className={`pr-lane pr-lane-${lane.id}`}>
              <header className="pr-lane-head">
                <h3>{lane.title}</h3>
                <span className="count">{rows.length}</span>
                <p className="pr-lane-hint">{lane.hint}</p>
                {lane.id === 'unseen' && <CopyPrLinks links={links} />}
              </header>
              <div className="pr-lane-rows">
                {rows.map((row) => (
                  <Row key={row.pr.url} row={row} />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      <p className="status">
        Only open PRs, and only this org. Your own PRs live on{' '}
        <Link to="/prs">Pull requests</Link>.
      </p>
    </main>
  );
};
