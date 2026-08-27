import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import type { JiraReport } from '../types';
import { activeTickets } from '../jiraActive';
import { agingOf } from '../ticketAging';
import { useCapabilities } from '../capabilitiesContext';
import { formatStatus, statusTone } from '../jiraStatus';
import { MiniPanel } from './MiniPanel';

interface HomeTicketsProps {
  report: JiraReport;
}

const SHOWN = 5;

/**
 * The tickets in flight, as a list rather than a card wall. Status is the only metadata a
 * module needs — the PR counts and the QC warning are a click away on the board, and this
 * has to be readable in the two seconds before deciding where the morning goes.
 */
export const HomeTickets = ({ report }: HomeTicketsProps) => {
  const { statusAging } = useCapabilities();
  const tickets = activeTickets(report);
  const overdue = tickets.filter((ticket) => agingOf(ticket, statusAging)?.over).length;

  return (
    <MiniPanel
      icon={ConfirmationNumberRoundedIcon}
      badge="badge-qc"
      title="Active tickets"
      kind="jira"
      to="/jira"
      linkLabel={`Board · ${tickets.length} active`}
      summary={
        overdue > 0 ? (
          <ul className="mini-counts">
            <li>
              <span className="mini-count">{overdue}</span>
              <span className="mini-count-label">stuck too long</span>
            </li>
          </ul>
        ) : undefined
      }
      count={tickets.length}
      empty="Nothing in flight."
    >
      <ul className="mini-rows">
        {tickets.slice(0, SHOWN).map((ticket) => (
          <li key={ticket.key} className="mini-row">
            <span className={`chip chip-${statusTone(ticket)}`}>
              {formatStatus(ticket.status)}
            </span>
            <div className="mini-row-body">
              <a href={ticket.url} target="_blank" rel="noopener noreferrer">
                {ticket.key}
              </a>
              <span className="mini-row-meta" title={ticket.summary}>
                {(() => {
                  const age = agingOf(ticket, statusAging);
                  return age?.over ? `${age.days}d in status · ${ticket.summary}` : ticket.summary;
                })()}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {tickets.length > SHOWN && (
        <p className="mini-rest">{tickets.length - SHOWN} more on the board</p>
      )}
    </MiniPanel>
  );
};
