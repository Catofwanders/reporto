import type { JiraReport, Pr, Ticket } from '../types';
import { formatStatus, statusTone } from '../jiraStatus';
import { useHashTarget } from '../useHashTarget';
import { TicketStatus } from './TicketStatus';

interface JiraBoardProps {
  report: JiraReport;
  /** Refetch after a status change, so the card moves column on the next pull. */
  onChanged?: () => void;
}

/**
 * Workflow order, left to right — the order a ticket actually travels, which is what a
 * board is for. Jira returns groups in JQL order, and that is a ranking, not a pipeline.
 * A status not named here keeps its relative position after the ones that are, so an
 * unfamiliar column shows up on the right rather than vanishing.
 */
const COLUMN_ORDER = [
  'backlog',
  'next',
  'to do',
  'selected',
  'in progress',
  'in development',
  'code review',
  'in review',
  'qc ready',
  'qc failed',
  'qc approved',
  'cs ready',
  'cs approved',
  'release ready',
  'released to production',
  'done',
  'closed',
  'blocked',
  'on hold',
];

const rank = (title: string) => {
  const at = COLUMN_ORDER.indexOf(title.trim().toLowerCase());
  return at === -1 ? COLUMN_ORDER.length : at;
};

const prLabel = (pr: Pr) => `${pr.repo.split('/').pop()}#${pr.num}`;

/** Merged but no longer on deploy-qc: the one PR state a board card must not hide. */
const droppedFromQc = (ticket: Ticket) =>
  ticket.prs.filter((pr) => pr.state === 'merged' && pr.inQc === false);

const BoardCard = ({ ticket, onChanged }: { ticket: Ticket; onChanged?: () => void }) => {
  const dropped = droppedFromQc(ticket);
  return (
    // The id is what /jira#<KEY> scrolls to.
    <article className="board-card" id={ticket.key}>
      <p className="board-card-summary" title={ticket.summary}>
        {ticket.summary}
      </p>

      {ticket.prs.length > 0 && (
        <p className="board-card-prs">
          {ticket.prs.map((pr) => (
            <a
              key={pr.url}
              className={`pr pr-${pr.state}`}
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              title={pr.note ?? `${pr.state} pull request`}
            >
              {pr.state === 'merged' ? '✓' : '◌'} {prLabel(pr)}
            </a>
          ))}
        </p>
      )}

      {dropped.length > 0 && (
        <p className="board-card-warn">
          not on deploy-qc: {dropped.map((pr) => `#${pr.num}`).join(' ')}
        </p>
      )}

      <div className="board-card-foot">
        <a className="key" href={ticket.url} target="_blank" rel="noopener noreferrer">
          {ticket.key}
        </a>
        <TicketStatus ticket={ticket} onChanged={onChanged} />
      </div>
    </article>
  );
};

/**
 * The board a Jira user expects: one column per status, cards inside, scrolling sideways
 * when the workflow is wider than the screen. The status chip on a card is still the way
 * to move a ticket — dragging would need a drop target per column and a transition guess
 * per drop, and the chip already asks Jira what the workflow allows.
 */
export const JiraBoard = ({ report, onChanged }: JiraBoardProps) => {
  useHashTarget([report]);

  const columns = [...report.groups]
    .filter((group) => group.tickets.length > 0)
    .sort((a, b) => rank(a.title) - rank(b.title));

  if (columns.length === 0) return <p className="status">No tickets in this report.</p>;

  return (
    <div className="board" role="list">
      {columns.map((group) => (
        <section key={group.title} className="board-col" role="listitem">
          <header className="board-col-head">
            <span className={`board-col-dot dot-${statusTone(group.tickets[0])}`} aria-hidden="true" />
            <h3>{formatStatus(group.title)}</h3>
            <span className="count">{group.tickets.length}</span>
          </header>
          <div className="board-col-body">
            {group.tickets.map((ticket) => (
              <BoardCard key={ticket.key} ticket={ticket} onChanged={onChanged} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
