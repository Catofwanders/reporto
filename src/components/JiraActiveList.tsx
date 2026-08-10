import { Link } from 'react-router-dom';
import type { JiraReport, Ticket } from '../types';
import { Chip } from './Chip';
import { RefreshButton } from './RefreshButton';

const ACTIVE_STATUSES = ['in progress', 'code review', 'qc ready'];

const isActive = (ticket: Ticket) => ACTIVE_STATUSES.includes(ticket.status.toLowerCase());

const prSummary = (ticket: Ticket) => {
  if (ticket.prs.length === 0) return 'no PR';
  const merged = ticket.prs.filter((pr) => pr.state === 'merged').length;
  const open = ticket.prs.filter((pr) => pr.state === 'open').length;
  return [merged && `${merged} merged`, open && `${open} open`].filter(Boolean).join(' · ');
};

export const JiraActiveList = ({ report }: { report: JiraReport }) => {
  const tickets = report.groups
    // Umbrella tickets carry no PR of their own — the child tickets below them do.
    .filter((group) => !group.title.toLowerCase().startsWith('umbrella'))
    .flatMap((group) => group.tickets)
    .filter(isActive);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>🎫 Jira</h2>
        <span className="panel-meta">
          <Link to="/jira">
            {report.date} · {tickets.length} active →
          </Link>
          <RefreshButton kind="jira" />
        </span>
      </div>

      <div className="list ticket-list">
        {tickets.length === 0 && <div className="empty">No active tickets.</div>}
        {tickets.map((ticket) => {
          const missingFromQc = ticket.prs.some((pr) => pr.inQc === false);
          return (
            <article key={ticket.key} className="item">
              <span className="chip-status">
                <Chip tone={ticket.chip}>{ticket.status}</Chip>
              </span>
              <div className="item-body">
                <div className="item-top">
                  <a className="key" href={ticket.url} target="_blank" rel="noopener noreferrer">
                    {ticket.key}
                  </a>
                  <span className="time">{prSummary(ticket)}</span>
                  {missingFromQc && <Chip tone="bad">missing from deploy-qc</Chip>}
                </div>
                <p className="subj">{ticket.summary}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
