import { useMemo } from 'react';
import type { JiraReport, PrsReport } from '../types';
import { formatStatus } from '../jiraStatus';
import { TicketStatus } from './TicketStatus';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import { ReportAccordion } from './ReportAccordion';
import { RefreshButton } from './RefreshButton';
import { useTicketReader } from './useTicketReader';
import { prLabel, prMark } from '../format';
import { openPrIndex, reviewOf } from '../ticketPrs';

interface JiraReportViewProps {
  report: JiraReport;
  /** Refetch after a status change, so the list stops showing the old one. */
  onChanged?: () => void;
  /** Passed to the drawer, so a PR row can say what it is waiting for. */
  prs?: PrsReport | null;
}

export const JiraReportView = ({ report, onChanged, prs = null }: JiraReportViewProps) => {
  const { read, drawer } = useTicketReader({ report, prs, onChanged });
  const openPrs = useMemo(() => openPrIndex(prs), [prs]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-qc" aria-hidden="true">
            <ConfirmationNumberRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>All tickets</h2>
            <p className="panel-sub">Grouped by the status Jira reports</p>
          </div>
        </div>
        <span className="panel-meta">
          {report.date}
          <RefreshButton kind="jira" />
        </span>
      </div>

      {report.banner && (
        <p className={`banner banner-${report.banner.tone}`}>{report.banner.text}</p>
      )}

      {report.groups.map((group) => (
        <ReportAccordion
          key={group.title}
          title={formatStatus(group.title)}
          count={group.tickets.length}
        >
          <div className="list">
            {group.tickets.map((ticket) => (
              <article key={ticket.key} className="item">
                <span className="chip-status">
                  <TicketStatus ticket={ticket} onChanged={onChanged} />
                </span>
                <div className="item-body">
                  <div className="item-top">
                    <a className="key" href={ticket.url} target="_blank" rel="noopener">
                      {ticket.key}
                    </a>
                  </div>
                  {/* The same handle a board card has: the summary opens the ticket. */}
                  <button
                    type="button"
                    className="ticket-open"
                    onClick={() => read(ticket.key)}
                    title="read this ticket"
                  >
                    <p className="subj">{ticket.summary}</p>
                  </button>
                  {ticket.prs.length > 0 && (
                    <p className="prs">
                      {ticket.prs.map((pr) => {
                        // The full wording here: a list row has the room a card does not.
                        const review = reviewOf(pr, openPrs);
                        return (
                          <span key={pr.url} className={`pr pr-${pr.state}`}>
                            {prMark(pr.state)}{' '}
                            <a href={pr.url} target="_blank" rel="noopener">
                              {prLabel(pr)}
                            </a>
                            {review ? (
                              <span className={`chip chip-${review.tone}`}>{review.label}</span>
                            ) : (
                              pr.note && <em> ({pr.note})</em>
                            )}
                          </span>
                        );
                      })}
                    </p>
                  )}
                  {ticket.notes.map((note) => (
                    <p key={note} className="note">
                      {note}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </ReportAccordion>
      ))}

      {report.restNote && <p className="foot">{report.restNote}</p>}
      {report.footer && <p className="foot">{report.footer}</p>}
      {drawer}
    </section>
  );
};
