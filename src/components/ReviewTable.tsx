import type { ReviewRow } from '../reviewLanes';
import { sizeLabel, sizeTone } from '../reviewLanes';
import { agingTone } from '../prLanes';
import { formatStatus } from '../jiraStatus';

interface ReviewTableProps {
  rows: ReviewRow[];
  selected: ReadonlySet<string>;
  onToggle: (url: string) => void;
  /** Select or clear the whole lane in one click — the usual way a batch starts. */
  onToggleAll: (urls: string[], next: boolean) => void;
}

/**
 * One lane of the review queue as a table.
 *
 * A table rather than cards because the rows are now a work list rather than a feed: the
 * point is to tick several and hand them to an agent, and that needs a checkbox column
 * that lines up, an age column that compares at a glance, and one row per PR.
 */
export const ReviewTable = ({ rows, selected, onToggle, onToggleAll }: ReviewTableProps) => {
  const urls = rows.map((row) => row.pr.url);
  const picked = urls.filter((url) => selected.has(url)).length;
  const all = picked === urls.length && urls.length > 0;

  return (
    <div className="review-table-wrap">
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
            <th>Age</th>
            <th>PR</th>
            <th>What it needs</th>
            <th className="review-col-ticket">Ticket</th>
            <th className="review-col-size">Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pr, idleDays, openDays, reason, ticketStatus }) => {
            const on = selected.has(pr.url);
            return (
              <tr
                key={pr.url}
                id={`${pr.repo}-${pr.num}`}
                className={`${on ? 'is-selected' : ''} ${pr.draft ? 'is-draft' : ''}`}
              >
                <td className="review-pick">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(pr.url)}
                    aria-label={`Select ${pr.repo} #${pr.num}`}
                  />
                </td>
                <td>
                  <span
                    className={`pr-age chip-${agingTone(idleDays)}`}
                    title={`last commit ${new Date(
                      pr.lastCommitAt ?? pr.updatedAt,
                    ).toLocaleString('en-GB')} · opened ${openDays}d ago`}
                  >
                    {idleDays === 0 ? 'today' : `${idleDays}d`}
                  </span>
                </td>
                <td className="review-cell-pr">
                  <a className="ref" href={pr.url} target="_blank" rel="noopener noreferrer">
                    #{pr.num}
                  </a>
                  <span className="pr-row-repo">{pr.repo}</span>
                  {/* Whose work it is: a review queue is a list of people waiting. */}
                  <span className="review-author">@{pr.author}</span>
                </td>
                <td className="review-cell-what">
                  <a href={pr.url} target="_blank" rel="noopener noreferrer">
                    {pr.title}
                  </a>
                  <span className="pr-row-reason">{reason}</span>
                </td>
                <td className="review-cell-ticket">
                  {pr.ticket && <span className="pr-row-ticket">{pr.ticket}</span>}
                  {ticketStatus && (
                    <span className="chip chip-na" title="status of the linked ticket">
                      {formatStatus(ticketStatus)}
                    </span>
                  )}
                  {pr.draft && <span className="chip chip-na">draft</span>}
                </td>
                <td className="review-cell-size">
                  {/* Size decides whether this fits in the gap before the next meeting. */}
                  <span className={`chip chip-${sizeTone(pr)}`} title="how much there is to read">
                    {sizeLabel(pr)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
