import { useState } from 'react';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import Button from '@mui/material/Button';
import type { PrsReport } from '../types';
import { LANES, toLanes } from '../prLanes';
import { PR_STATE_LABEL, prState } from '../prState';
import { useHashTarget } from '../useHashTarget';
import { CopyPrLinks } from './CopyPrLinks';
import { PrTable } from './PrTable';
import { RefreshButton } from './RefreshButton';

interface PrLanesProps {
  report: PrsReport;
  /** Refetch after a PR's state changes, so a row leaves its lane on the next pull. */
  onChanged: () => void;
}

/**
 * Open PRs sorted by who is holding the ball. Lanes with nothing in them are not rendered:
 * an empty "Changes requested" heading is a claim about the day that has to be read before
 * it can be dismissed.
 *
 * The state counts stay as a summary, but only the states that are not zero — six numbers
 * of equal weight, four of them zero, said nothing about what to do next.
 *
 * Rows are selectable because the list is an input to something else: tick the PRs that
 * need a nudge, or the ones to hand an agent, and copy their urls in one go. Selection is
 * keyed by url, so a refresh that moves a PR between lanes keeps it ticked.
 */
export const PrLanes = ({ report, onChanged }: PrLanesProps) => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useHashTarget([report]);

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

  const lanes = toLanes(report);
  const all = report.repos.flatMap((group) => group.prs);
  const counts = all.reduce<Record<string, number>>((acc, pr) => {
    const key = pr.draft ? 'draft' : prState(pr);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  // Only rows still on screen can be copied: a tick left over from a PR that has since
  // merged would otherwise ride along invisibly.
  const picked = LANES.flatMap((lane) => lanes.get(lane.id) ?? [])
    .filter((row) => selected.has(row.pr.url))
    .map((row) => row.pr.url);

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

      {/* The one action the ticks feed. It appears with the first tick rather than sitting
          there disabled, and says how many it would copy. */}
      {picked.length > 0 && (
        <div className="review-selection">
          <span>{picked.length} selected</span>
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
            </header>
            <PrTable
              rows={rows}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onChanged={onChanged}
            />
          </section>
        );
      })}
    </section>
  );
};
