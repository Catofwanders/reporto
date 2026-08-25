import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { JiraReport, Ticket } from '../types';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import { Chip } from './Chip';
import { TicketStatus } from './TicketStatus';
import { RefreshButton } from './RefreshButton';

// "cs approved" is the board's "Waiting for Merge (CS Approved)" column — the skill writes
// the short name, so match that.
const ACTIVE_STATUSES = ['in progress', 'code review', 'qc ready', 'qc failed', 'cs approved'];

const isActiveStatus = (status: string) => ACTIVE_STATUSES.includes(status.toLowerCase());

const isActive = (ticket: Ticket) => isActiveStatus(ticket.status);

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

interface JiraActiveListProps {
  report: JiraReport;
  /** Refetch after a status change, so the card stops showing the old one. */
  onChanged?: () => void;
}

export const JiraActiveList = ({ report, onChanged }: JiraActiveListProps) => {
  /**
   * Ticket key → the status it was moved away from, for transitions that leave this list.
   * A transition only shows up here once the refresh has rewritten the report, and a
   * background pull in between hands back the old status again, so the card would sit there
   * looking untouched for as long as that takes. Keying on the old status rather than on a
   * timer means the entry stops matching the moment the report carries anything else — no
   * guess about where the workflow actually landed, and nothing to clear.
   */
  const [movedFrom, setMovedFrom] = useState<Record<string, string>>({});

  const tickets = report.groups
    // Umbrella tickets carry no PR of their own — the child tickets below them do.
    .filter((group) => !group.title.toLowerCase().startsWith('umbrella'))
    .flatMap((group) => group.tickets)
    .filter(isActive)
    .filter((ticket) => movedFrom[ticket.key] !== ticket.status);

  const handleChanged = (ticket: Ticket, nextStatus: string) => {
    if (!isActiveStatus(nextStatus)) {
      setMovedFrom((prev) => ({ ...prev, [ticket.key]: ticket.status }));
    }
    onChanged?.();
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-qc" aria-hidden="true">
            <ConfirmationNumberRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>Active tickets</h2>
            <p className="panel-sub">In progress, in review, or waiting on QC</p>
          </div>
        </div>
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
              <TicketStatus
                ticket={ticket}
                onChanged={onChanged && ((next) => handleChanged(ticket, next))}
              />
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
