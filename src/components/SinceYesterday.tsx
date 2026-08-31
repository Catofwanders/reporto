import { useState } from 'react';
import { Link } from 'react-router-dom';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import type { SinceReport } from '../sinceYesterday';
import { plural } from '../format';

interface SinceYesterdayProps {
  report: SinceReport;
  /** Folded by default on the dashboard; a story opens it. */
  open?: boolean;
}

/** Same weekday-and-date wording the calendar panel uses, so two panels do not disagree. */
const dayLabel = (date: string) => {
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return date;
  return at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
};

/**
 * What moved since the last day there is a report for.
 *
 * Folded by default: this answers a question you have on a Monday or after a day off, not one
 * you have every morning, and the dashboard's first screen belongs to what is waiting now. The
 * summary line carries the count, so opening it is a decision rather than a search.
 *
 * It costs nothing to produce — the reports are dated files and yesterday's is still on disk —
 * which is why it can be here at all rather than behind a fetch.
 */
export const SinceYesterday = ({ report, open = false }: SinceYesterdayProps) => {
  const [shown, setShown] = useState(open);

  // No earlier report at all: a fresh clone, or one day of history. Nothing to compare, and
  // saying "nothing changed" would be a claim rather than a reading.
  if (!report.date) return null;

  return (
    <section className="panel since">
      <div className="mini-head">
        <span className="panel-icon badge-na" aria-hidden="true">
          <HistoryRoundedIcon fontSize="small" />
        </span>
        <h2>Since {dayLabel(report.date)}</h2>
        <span className="needs-count">{report.changes.length}</span>
        {report.changes.length > 0 && (
          <button
            type="button"
            className="needs-snoozed-toggle since-toggle"
            aria-expanded={shown}
            onClick={() => setShown((on: boolean) => !on)}
          >
            {shown ? 'hide' : 'show'}
          </button>
        )}
      </div>

      {report.changes.length === 0 ? (
        <p className="mini-empty">Nothing moved on the board or in your PRs.</p>
      ) : (
        !shown && (
          <p className="mini-empty">
            {plural(report.changes.length, 'change')} on the board and in your PRs.
          </p>
        )
      )}

      {shown && report.changes.length > 0 && (
        <ul className="needs-list since-list">
          {report.changes.map((change) => {
            const Icon = change.source === 'pr' ? AltRouteRoundedIcon : ConfirmationNumberRoundedIcon;
            return (
              <li key={change.id} className={`needs-row is-${change.tone === 'ok' ? 'na' : change.tone}`}>
                <Link to={change.to}>
                  <Icon className={`needs-icon is-${change.source === 'pr' ? 'pr' : 'ticket'}`} fontSize="small" />
                  <span className="needs-body">
                    <span className="needs-label">{change.label}</span>
                    <span className="needs-why">{change.what}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
