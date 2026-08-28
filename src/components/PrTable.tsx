import type { LanePr } from '../prLanes';
import { agingTone } from '../prLanes';
import { qcChip } from '../prState';
import { PrDraftToggle } from './PrDraftToggle';
import { PrRowActions } from './PrRowActions';

interface PrTableProps {
  rows: LanePr[];
  selected: ReadonlySet<string>;
  onToggle: (url: string) => void;
  /** Select or clear the whole lane in one click — the usual way a batch starts. */
  onToggleAll: (urls: string[], next: boolean) => void;
  onChanged: () => void;
}

/**
 * One lane of open PRs as a table.
 *
 * Same shape as the review queue: a checkbox column that lines up, so several rows can be
 * ticked and their urls handed to an agent or a message in one go. The per-row menu keeps
 * its own column at the end rather than sharing a cell with the data.
 */
export const PrTable = ({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onChanged,
}: PrTableProps) => {
  const urls = rows.map((row) => row.pr.url);
  const picked = urls.filter((url) => selected.has(url)).length;
  const all = picked === urls.length && urls.length > 0;

  return (
    <div className="review-table-wrap" tabIndex={0} aria-label="Pull request table, scrolls sideways">
      <table className="review-table">
        <thead>
          <tr>
            <th className="review-pick">
              <input
                type="checkbox"
                checked={all}
                // Partly selected is its own state: a bare unchecked box invites a click
                // that would silently drop the rows already ticked.
                ref={(el) => {
                  if (el) el.indeterminate = picked > 0 && !all;
                }}
                onChange={() => onToggleAll(urls, !all)}
                aria-label={all ? 'Clear this lane' : 'Select every PR in this lane'}
              />
            </th>
            <th>Idle</th>
            <th>PR</th>
            <th>What it needs</th>
            <th className="review-col-qc">QC</th>
            <th className="review-col-actions" aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pr, repo, idleDays, reason, mergeReady, tone }) => {
            const qc = qcChip(pr.deployQc);
            const on = selected.has(pr.url);
            const classes = [
              on ? 'is-selected' : '',
              tone ? `is-${tone}` : '',
              mergeReady ? 'is-merge-ready' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr key={pr.url} id={`${repo}-${pr.num}`} className={classes}>
                <td className="review-pick">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(pr.url)}
                    aria-label={`Select ${repo} #${pr.num}`}
                  />
                </td>
                <td>
                  <span
                    className={`pr-age chip-${agingTone(idleDays)}`}
                    title={`last moved ${new Date(pr.updatedAt).toLocaleString('en-GB')}`}
                  >
                    {idleDays === 0 ? 'today' : `${idleDays}d`}
                  </span>
                </td>
                <td className="review-cell-pr">
                  <a className="ref" href={pr.url} target="_blank" rel="noopener noreferrer">
                    #{pr.num}
                  </a>
                  <span className="pr-row-repo">{repo}</span>
                  {pr.ticket && pr.ticketUrl && (
                    <a
                      className="pr-row-ticket"
                      href={pr.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {pr.ticket}
                    </a>
                  )}
                </td>
                <td className="review-cell-what">
                  <a href={pr.url} target="_blank" rel="noopener noreferrer">
                    {pr.title}
                  </a>
                  <span className="pr-row-reason">{reason}</span>
                </td>
                <td className="review-cell-ticket">
                  {/* The QC standing is the one fact the reason line cannot always carry. */}
                  {qc && (
                    <span className={`chip chip-${qc.tone}`} title={qc.title}>
                      {qc.label}
                    </span>
                  )}
                </td>
                <td className="pr-cell-actions">
                  {/* Only the draft lane gets the button: elsewhere the flip is a menu item,
                      so the rows are not five copies of the same control. */}
                  {pr.draft && <PrDraftToggle repo={repo} pr={pr} onChanged={onChanged} />}
                  <PrRowActions repo={repo} pr={pr} onChanged={onChanged} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
