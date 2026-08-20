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

      {tickets.length === 0 && <div className="empty">No active tickets.</div>}
      <div className="ticket-cards">
        {tickets.map((ticket) => (
          <article key={ticket.key} className="ticket-card">
            <div className="ticket-card-top">
              <a className="key" href={ticket.url} target="_blank" rel="noopener noreferrer">
                {ticket.key}
              </a>
              <Chip tone={ticket.chip}>{ticket.status}</Chip>
            </div>
            {/* Two lines keeps every card the same height; the rest is one hover away. */}
            <p className="ticket-card-summary" title={ticket.summary}>
              {ticket.summary}
            </p>
            <span className="time">{prSummary(ticket)}</span>
          </article>
        ))}
      </div>
    </section>
  );
};
