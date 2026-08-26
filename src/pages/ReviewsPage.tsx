import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import Button from '@mui/material/Button';
import type { JiraReport, ReviewsReport } from '../types';
import type { ReviewLaneId, ReviewRow } from '../reviewLanes';
import { REVIEW_LANES, toReviewLanes } from '../reviewLanes';
import { CopyPrLinks } from '../components/CopyPrLinks';
import { RefreshButton } from '../components/RefreshButton';
import { ReviewTable } from '../components/ReviewTable';
import { useHashTarget } from '../useHashTarget';

interface ReviewsPageProps {
  report: ReviewsReport | null;
  jira: JiraReport | null;
}

/**
 * The review queue, sorted by what it needs from me.
 *
 * GitHub's own notion is "review requested", which drops a PR the moment a review is
 * submitted — so the thing you most want to see, a PR you approved and the author then
 * pushed to, is exactly what it hides. That case gets the top lane here.
 *
 * The rows are selectable because the queue is an input to something else: tick the PRs
 * worth a session and hand the urls to an agent. Selection is by url, so it survives a
 * background refresh and a lane change — a PR that moves from "never looked at" to
 * "changed since you looked" stays ticked.
 */
export const ReviewsPage = ({ report, jira }: ReviewsPageProps) => {
  const [hideBots, setHideBots] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useHashTarget([report]);

  const lanes = useMemo<Map<ReviewLaneId, ReviewRow[]>>(
    () => (report ? toReviewLanes(report, jira) : new Map()),
    [report, jira],
  );

  const toggle = (url: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(url)) next.add(url);
      return next;
    });

  const toggleAll = (urls: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const url of urls) {
        if (on) next.add(url);
        else next.delete(url);
      }
      return next;
    });

  if (!report) {
    return (
      <main className="grid">
        <p className="status">
          No review report yet — press the update button beside Reviews in the sidebar.
        </p>
      </main>
    );
  }

  const bots = (lanes.get('bots') ?? []).length;
  const mine = report.prs.filter((pr) => !pr.bot).length;

  // Only what is on screen can be copied: a tick left over from a PR that has since merged,
  // or one hidden by "hide bots", would otherwise ride along invisibly.
  const shown = REVIEW_LANES.filter((lane) => !(lane.id === 'bots' && hideBots)).flatMap(
    (lane) => lanes.get(lane.id) ?? [],
  );
  const picked = shown.filter((row) => selected.has(row.pr.url)).map((row) => row.pr.url);

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

        {/* The one action the ticks feed. It appears with the first tick rather than sitting
            there disabled, and says how many it would copy. */}
        {picked.length > 0 && (
          <div className="review-selection">
            <span>
              {picked.length} selected
            </span>
            <CopyPrLinks
              links={picked}
              label={`Copy ${picked.length} PR url${picked.length === 1 ? '' : 's'}`}
            />
            <Button
              size="small"
              onClick={() => setSelected(new Set())}
              sx={{ textTransform: 'none', color: 'var(--ink-2)' }}
            >
              Clear
            </Button>
          </div>
        )}

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
              </header>
              <ReviewTable
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
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
