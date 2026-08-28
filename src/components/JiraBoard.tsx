import type { JiraReport, PrsReport, Ticket } from '../types';
import { formatStatus, statusTone } from '../jiraStatus';
import { useHashTarget } from '../useHashTarget';
import { TicketStatus } from './TicketStatus';
import { agingOf } from '../ticketAging';
import { useCapabilities } from '../capabilitiesContext';
import { statusRank } from '../statusVocab';
import { useRefresh } from '../refreshContext';
import { useTicketReader } from './useTicketReader';
import { plural, prLabel } from '../format';

interface JiraBoardProps {
  report: JiraReport;
  /** Refetch after a status change, so the card moves column on the next pull. */
  onChanged?: () => void;
  /** Open PRs, so the drawer can say a PR's review state rather than just open or merged. */
  prs?: PrsReport | null;
}

/*
 * Column order is the order a ticket actually travels, which is what a board is for — Jira
 * returns groups in JQL order, and that is a ranking, not a pipeline. The sequence comes from
 * the status vocabulary in config, because a workflow's column names belong to whoever owns
 * the board. A status the vocabulary does not name keeps its relative position after the ones
 * it does, so an unfamiliar column shows up on the right rather than vanishing.
 */

/** Merged but no longer on deploy-qc: the one PR state a board card must not hide. */
const droppedFromQc = (ticket: Ticket) =>
  ticket.prs.filter((pr) => pr.state === 'merged' && pr.inQc === false);

/**
 * Where a fact is still being fetched, a shimmer rather than an empty space.
 *
 * Empty and "not loaded yet" look identical, and the wrong reading is the dangerous one: a
 * card with no PR chip means "no PR on this ticket", which is one of the things the flow
 * checks are about. Only cards that could plausibly have one get a placeholder — a backlog
 * item with no PR is not a gap.
 */
const PrSkeleton = ({ loading }: { loading: boolean }) => (
  <p className="board-card-prs">
    <span
      // A shimmer claims something is in flight. When the second pass is not running — it
      // failed, or the page was opened on a partial report — the placeholder holds still, so
      // the gap reads as "not fetched" rather than as "any moment now".
      className={`skeleton skeleton-chip${loading ? '' : ' is-idle'}`}
      // `role="img"` so the label counts at all: an `aria-label` on a bare span is ignored, so
      // the careful "loading" vs "not fetched" distinction reached sighted users only.
      role="img"
      aria-label={loading ? 'pull requests still loading' : 'pull requests not fetched'}
    />
  </p>
);

const BoardCard = ({
  ticket,
  onChanged,
  onOpen,
  pendingPrs = false,
}: {
  ticket: Ticket;
  onChanged?: () => void;
  /** Ask for the drawer on this ticket. */
  onOpen: () => void;
  /** The report is the fast half of a pull, so PRs are not absent — just not here yet. */
  pendingPrs?: boolean;
}) => {
  const { running } = useRefresh();
  const { statusAging, statuses } = useCapabilities();
  const dropped = droppedFromQc(ticket);
  // Only shown once it is over the limit for its status: a pill on every card is wallpaper,
  // and the number that matters is the one somebody should act on.
  const age = agingOf(ticket, statusAging);
  return (
    // The id is what /jira#<KEY> scrolls to.
    <article className="board-card" id={ticket.key}>
      {/* The summary is the handle: reading a ticket is what a card click means, and the key
          link beside it still goes to Jira for anybody who wants the real thing. */}
      <button type="button" className="ticket-open" onClick={onOpen} title="read this ticket">
        <p className="board-card-summary" title={ticket.summary}>
          {ticket.summary}
        </p>
      </button>

      {ticket.prs.length === 0 && pendingPrs && statusTone(ticket, statuses) !== 'na' && (
        <PrSkeleton loading={running.has('jira')} />
      )}

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
        {age?.over && (
          <span className={`pr-age chip-${age.tone}`} title={age.title}>
            {age.label}
          </span>
        )}
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
export const JiraBoard = ({ report, onChanged, prs = null }: JiraBoardProps) => {
  useHashTarget([report]);
  const { statuses } = useCapabilities();
  const pendingPrs = Boolean(report.partial && report.pending?.includes('prs'));
  const { read, drawer } = useTicketReader({ report, prs, onChanged });

  const columns = [...report.groups]
    .filter((group) => group.tickets.length > 0)
    .sort((a, b) => statusRank(statuses, a.title) - statusRank(statuses, b.title));

  if (columns.length === 0) return <p className="status">No tickets in this report.</p>;

  return (
    <>
      {/*
        * Not `role="list"`: the columns were announced as "list, 6 items" while the cards inside
        * them are articles, which describes the wrong structure. Each column is a region with a
        * name, which is what somebody navigating by landmark actually wants.
        */}
      <div className="board" tabIndex={0} aria-label="Board columns, scrolls sideways">
        {columns.map((group) => (
          <section
          key={group.title}
          className="board-col"
          aria-label={`${formatStatus(group.title)}, ${plural(group.tickets.length, 'ticket')}`}
        >
            <header className="board-col-head">
              <span
                className={`board-col-dot dot-${statusTone(group.tickets[0], statuses)}`}
                aria-hidden="true"
              />
              <h3>{formatStatus(group.title)}</h3>
              <span className="count">{group.tickets.length}</span>
            </header>
            <div className="board-col-body">
              {group.tickets.map((ticket) => (
                <BoardCard
                  key={ticket.key}
                  ticket={ticket}
                  onChanged={onChanged}
                  onOpen={() => read(ticket.key)}
                  pendingPrs={pendingPrs}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {drawer}
    </>
  );
};
