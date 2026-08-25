import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import type { PrsReport } from '../types';
import { LANES, type LanePr, agingTone, nudgeLinks, toLanes } from '../prLanes';
import { PR_STATE_LABEL, prState, qcChip } from '../prState';
import { useHashTarget } from '../useHashTarget';
import { CopyPrLinks } from './CopyPrLinks';
import { PrDraftToggle } from './PrDraftToggle';
import { PrRowActions } from './PrRowActions';
import { RefreshButton } from './RefreshButton';

interface PrLanesProps {
  report: PrsReport;
  /** Refetch after a PR's state changes, so a row leaves its lane on the next pull. */
  onChanged: () => void;
}

const Row = ({ row, onChanged }: { row: LanePr; onChanged: () => void }) => {
  const { pr, repo, idleDays, reason, mergeReady } = row;
  const qc = qcChip(pr.deployQc);

  return (
    <article className={`pr-row${mergeReady ? ' is-merge-ready' : ''}`} id={`${repo}-${pr.num}`}>
      <span
        className={`pr-age chip-${agingTone(idleDays)}`}
        title={`last moved ${new Date(pr.updatedAt).toLocaleString('en-GB')}`}
      >
        {idleDays === 0 ? 'today' : `${idleDays}d`}
      </span>

      <div className="pr-row-body">
        <div className="pr-row-top">
          <a className="ref" href={pr.url} target="_blank" rel="noopener noreferrer">
            #{pr.num}
          </a>
          <span className="pr-row-repo">{repo}</span>
          {pr.ticket && pr.ticketUrl && (
            <a className="pr-row-ticket" href={pr.ticketUrl} target="_blank" rel="noopener noreferrer">
              {pr.ticket}
            </a>
          )}
          {/* The QC standing is the one fact the reason line cannot always carry. */}
          {qc && (
            <span className={`chip chip-${qc.tone}`} title={qc.title}>
              {qc.label}
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

      <div className="pr-row-actions">
        {/* Only the draft lane gets the button: elsewhere the flip is a menu item, so the
            rows are not five copies of the same control. */}
        {pr.draft && <PrDraftToggle repo={repo} pr={pr} onChanged={onChanged} />}
        <PrRowActions repo={repo} pr={pr} onChanged={onChanged} />
      </div>
    </article>
  );
};

/**
 * Open PRs sorted by who is holding the ball. Lanes with nothing in them are not rendered:
 * an empty "Changes requested" heading is a claim about the day that has to be read before
 * it can be dismissed.
 *
 * The state counts stay as a summary, but only the states that are not zero — six numbers
 * of equal weight, four of them zero, said nothing about what to do next.
 */
export const PrLanes = ({ report, onChanged }: PrLanesProps) => {
  useHashTarget([report]);

  const lanes = toLanes(report);
  const all = report.repos.flatMap((group) => group.prs);
  const counts = all.reduce<Record<string, number>>((acc, pr) => {
    const key = pr.draft ? 'draft' : prState(pr);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const links = nudgeLinks(lanes);

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-open" aria-hidden="true">
            <AltRouteRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>Open PRs</h2>
            <p className="panel-sub">
              {all.length} open in {report.repos.length}{' '}
              {report.repos.length === 1 ? 'repo' : 'repos'}
            </p>
          </div>
        </div>
        <span className="panel-meta">
          <ul className="pr-counts">
            {Object.entries(counts).map(([key, value]) => (
              <li key={key}>
                <span className="pr-count">{value}</span>
                <span className="pr-count-label">
                  {key === 'draft' ? 'draft' : PR_STATE_LABEL[key as ReturnType<typeof prState>]}
                </span>
              </li>
            ))}
          </ul>
          {report.date}
          <RefreshButton kind="prs" />
        </span>
      </div>

      {all.length === 0 && <p className="status">No open PRs.</p>}

      {LANES.map((lane) => {
        const rows = lanes.get(lane.id) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={lane.id} className={`pr-lane pr-lane-${lane.id}`}>
            <header className="pr-lane-head">
              <h3>{lane.title}</h3>
              <span className="count">{rows.length}</span>
              <p className="pr-lane-hint">{lane.hint}</p>
              {lane.id === 'waiting' && <CopyPrLinks links={links} />}
            </header>
            <div className="pr-lane-rows">
              {rows.map((row) => (
                <Row key={row.pr.url} row={row} onChanged={onChanged} />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
};
