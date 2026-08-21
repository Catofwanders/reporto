import { Link } from 'react-router-dom';
import type { JiraReport, Ticket } from '../types';
import { statusTone } from '../jiraStatus';
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

/**
 * Merged PRs whose commit is no longer reachable from deploy-qc — a QC reset dropped them,
 * which is invisible everywhere else: the PR still reads as merged and the ticket still
 * reads as done. `inQc` is undefined when unknown, so only an explicit false counts.
 */
const droppedFromQc = (ticket: Ticket) =>
  ticket.prs.filter((pr) => pr.state === 'merged' && pr.inQc === false);

const QcWarning = ({ ticket }: { ticket: Ticket }) => {
  const dropped = droppedFromQc(ticket);
  if (dropped.length === 0) return null;
  return (
    <span
      className="ticket-card-qc"
      title={`Merged but missing from deploy-qc: ${dropped
        .map((pr) => `${pr.repo}#${pr.num}`)
        .join(', ')}`}
    >
      <Chip tone="bad">not on deploy-qc: {dropped.map((pr) => `#${pr.num}`).join(' ')}</Chip>
    </span>
  );
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
              <Chip tone={statusTone(ticket)}>{ticket.status}</Chip>
            </div>
            {/* Two lines keeps every card the same height; the rest is one hover away. */}
            <p className="ticket-card-summary" title={ticket.summary}>
              {ticket.summary}
            </p>
            <span className="time">{prSummary(ticket)}</span>
            <QcWarning ticket={ticket} />
          </article>
        ))}
      </div>
    </section>
  );
};
