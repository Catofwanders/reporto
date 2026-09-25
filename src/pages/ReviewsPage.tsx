import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import Button from '@mui/material/Button';
import type { JiraReport, ReviewsReport } from '../types';
import type { ReviewLaneId, ReviewRow } from '../reviewLanes';
import { REVIEW_LANES, toReviewLanes } from '../reviewLanes';
import {
  KEEP_DAYS,
  ignoreReview,
  readIgnored,
  splitIgnored,
  unignoreReview,
  writeIgnored,
} from '../reviewIgnore';
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
  /** Read once on mount, like the other local marks; the writes go back through setState. */
  const [ignores, setIgnores] = useState(readIgnored);
  const [showIgnored, setShowIgnored] = useState(false);
  useHashTarget([report]);

  /*
   * The lanes are built from the report with the ignored PRs taken out, so every count on the
   * page — the lane counts, the subtitle, what "select all" picks up — comes from the same
   * list. The ignored ones are kept separately rather than dropped, because a hidden row that
   * nothing on the page mentions is indistinguishable from a row that never existed.
   */
  const { kept, ignored } = useMemo(
    () => (report ? splitIgnored(report, ignores) : { kept: null, ignored: [] }),
    [report, ignores],
  );

  const lanes = useMemo<Map<ReviewLaneId, ReviewRow[]>>(
    () => (kept ? toReviewLanes(kept, jira) : new Map()),
    [kept, jira],
  );

  const ignoredRows = useMemo<ReviewRow[]>(
    () =>
      report && ignored.length > 0
        ? [...toReviewLanes({ ...report, prs: ignored }, jira).values()].flat()
        : [],
    [report, ignored, jira],
  );

  const setIgnore = (url: string, next: boolean) => {
    const marks = next ? ignoreReview(url, ignores) : unignoreReview(url, ignores);
    writeIgnored(marks);
    setIgnores(marks);
    // A row that has left the queue must not stay ticked: the copy button would hand out a
    // url that is no longer on screen.
    if (next) {
      setSelected((prev) => {
        const rest = new Set(prev);
        rest.delete(url);
        return rest;
      });
    }
  };

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
  const mine = (kept?.prs ?? []).filter((pr) => !pr.bot).length;

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
                {mine} from people{bots > 0 && `, ${bots} from bots`}
                {ignored.length > 0 && `, ${ignored.length} ignored`} · reviewing as{' '}
                {report.reviewer}
                {/* Said in the subtitle rather than a banner: it qualifies the count beside it. */}
                {report.incomplete?.length ? (
                  <span className="panel-pending"> · {report.incomplete.join('; ')}</span>
                ) : null}
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
                onIgnore={setIgnore}
              />
            </section>
          );
        })}

        {/*
          Folded, and stated: the count is in the subtitle either way, so an ignored PR is
          hidden from the queue without being lost from the page. The mark expires after a
          month, which is why this list is worth being able to open.
        */}
        {ignored.length > 0 && (
          <section className="pr-lane pr-lane-ignored">
            <header className="pr-lane-head">
              <h3>Ignored</h3>
              <span className="count">{ignored.length}</span>
              <p className="pr-lane-hint">
                Not yours to review. They come back after {KEEP_DAYS} days if still open.
              </p>
              <button
                type="button"
                className="needs-snoozed-toggle"
                aria-expanded={showIgnored}
                onClick={() => setShowIgnored((on: boolean) => !on)}
              >
                {showIgnored ? 'hide' : 'show'}
              </button>
            </header>
            {showIgnored && (
              <ReviewTable
                rows={ignoredRows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onIgnore={setIgnore}
                ignored
              />
            )}
          </section>
        )}
      </section>

      <p className="status">
        Only open PRs, and only this org. Your own PRs live on{' '}
        <Link to="/prs">Pull requests</Link>.
      </p>
    </main>
  );
};
