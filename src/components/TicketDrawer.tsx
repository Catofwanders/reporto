import { useEffect, useRef, useState } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import type { Pr, PrsReport, Ticket } from '../types';
import { formatStatus } from '../jiraStatus';
import { laneOf, LANES } from '../prLanes';
import { openPrIndex, reviewOf, type TicketPrReview } from '../ticketPrs';
import { prMark } from '../format';
import { fetchTicketDetail, type TicketDetail } from '../ticketDetail';
import { timeAgo } from '../timeAgo';
import { Adf } from './Adf';
import { TicketStatus } from './TicketStatus';

interface TicketDrawerProps {
  /** The board's own copy: enough to draw the drawer before the fetch answers. */
  ticket: Ticket;
  /** Open PRs, so a PR on this ticket can say its review state rather than just "open". */
  prs: PrsReport | null;
  onClose: () => void;
  /** A transition made from here moves the card behind, once the board refetches. */
  onChanged?: () => void;
}

const laneTitle = (id: string) => LANES.find((lane) => lane.id === id)?.title ?? id;

/**
 * What a PR on this ticket is waiting for, said with the same logic the PR page uses.
 *
 * The board card can only say open or merged, which is the least interesting half: "open" on
 * a ticket in a review column is either "nobody has looked" or "changes requested and it is on
 * you". That state already exists in `prState`/`laneOf`, so this looks the PR up in the open-PR
 * report and reuses it rather than deriving a second opinion here.
 */
const PrRow = ({
  pr,
  open,
  review,
}: {
  pr: Pr;
  open?: PrsReport['repos'][number]['prs'][number];
  /** From `ticketPrs`, so the drawer, the board and the list say the same thing. */
  review: TicketPrReview | null;
}) => {
  return (
    <li className="drawer-pr">
      <a href={pr.url} target="_blank" rel="noopener noreferrer">
        <span className={`pr pr-${pr.state}`}>
          {prMark(pr.state)} {pr.repo.split('/').pop()}#{pr.num}
        </span>
        {review ? (
          <span className={`chip chip-${review.tone}`}>{review.label}</span>
        ) : (
          <span className="chip chip-na">{pr.note ?? pr.state}</span>
        )}
        {open && <span className="drawer-pr-lane">{laneTitle(laneOf(open))}</span>}
      </a>
      {pr.state === 'merged' && pr.inQc === false && (
        <span className="drawer-pr-warn">not on deploy-qc</span>
      )}
    </li>
  );
};

/**
 * A ticket, read in place.
 *
 * A drawer rather than a route on purpose: the board stays behind it, Esc puts you back on
 * the card you clicked, and nothing about where you were is lost. The card's own facts are
 * drawn immediately from the report already in memory, and the description, comments and
 * fields arrive from `/api/jira/<KEY>` behind them — so opening a ticket never shows an empty
 * panel, only a filling one.
 *
 * Read-only for now. Commenting from here is a write to a shared board with no undo, and it
 * wants the same confirmation the PR close action got; the status control is the one already
 * on the card, which has that confirmation.
 */
export const TicketDrawer = ({ ticket, prs, onClose, onChanged }: TicketDrawerProps) => {
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    let live = true;
    fetchTicketDetail(ticket.key).then(
      (next) => live && setDetail(next),
      (err: Error) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, [ticket.key]);

  useEffect(() => {
    // Esc closes, and focus goes back to whatever opened this — the card, usually — so the
    // keyboard is not dumped at the top of the board.
    returnTo.current = document.activeElement;
    closeRef.current?.focus();

    /*
     * `aria-modal="true"` is a promise: everything behind this is unavailable. Without a trap
     * it was only a label — Tab walked straight out into the board and kept going, while the
     * screen reader was still told the board did not exist. Cycling at both ends is the whole
     * fix; the drawer is small enough that the focusable set can be read on each Tab.
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((node) => node.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (active instanceof Node && !panel.current?.contains(active)) {
        // Focus escaped some other way — a click on the page behind, say. Bring it back.
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    // The page behind must not scroll under an open drawer.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  // "Fetching" and "the fetch failed" must not look the same: a shimmer that never resolves
  // claims something is still on its way.
  const pending = !detail && !error;

  const openPrs = openPrIndex(prs);

  return (
    <div
      className="drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${ticket.key} — ${ticket.summary}`}
      >
        <header className="drawer-head">
          <a className="key" href={ticket.url} target="_blank" rel="noopener noreferrer">
            {ticket.key}
          </a>
          <span className={`chip chip-${detail?.chip ?? ticket.chip}`}>
            {formatStatus(detail?.status ?? ticket.status)}
          </span>
          {detail?.type && <span className="drawer-type">{detail.type}</span>}
          <button
            ref={closeRef}
            type="button"
            className="drawer-close"
            onClick={onClose}
            aria-label="close"
            title="close (esc)"
          >
            <CloseRoundedIcon fontSize="small" />
          </button>
        </header>

        <h2 className="drawer-summary">{detail?.summary || ticket.summary}</h2>

        <dl className="drawer-meta">
          <div>
            <dt>Assignee</dt>
            <dd>{detail ? (detail.assignee?.name ?? 'unassigned') : pending ? <Shimmer /> : '—'}</dd>
          </div>
          <div>
            <dt>Reporter</dt>
            <dd>{detail ? (detail.reporter?.name ?? 'unknown') : pending ? <Shimmer /> : '—'}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{detail ? (detail.priority ?? '—') : pending ? <Shimmer /> : '—'}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{detail ? timeAgo(detail.updated) : pending ? <Shimmer /> : '—'}</dd>
          </div>
        </dl>

        {detail?.parent && (
          <p className="drawer-parent">
            part of <strong>{detail.parent.key}</strong> — {detail.parent.summary}
          </p>
        )}

        {detail && detail.labels.length > 0 && (
          <ul className="drawer-labels">
            {detail.labels.map((label) => (
              <li key={label} className="chip chip-na">
                {label}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="status error">
            Could not read {ticket.key}: {error}
          </p>
        )}

        <section className="drawer-section">
          <h3>Description</h3>
          {pending && <Shimmer lines={3} />}
          {detail && (detail.description ? <Adf doc={detail.description} /> : <p className="mini-empty">No description.</p>)}
        </section>

        {ticket.prs.length > 0 && (
          <section className="drawer-section">
            <h3>Pull requests</h3>
            <ul className="drawer-prs">
              {ticket.prs.map((pr) => (
                <PrRow
                  key={pr.url}
                  pr={pr}
                  open={openPrs.get(`${pr.repo}#${pr.num}`)}
                  review={reviewOf(pr, openPrs)}
                />
              ))}
            </ul>
          </section>
        )}

        {ticket.notes.length > 0 && (
          <section className="drawer-section">
            <h3>Notes from the pull</h3>
            <ul className="drawer-notes">
              {ticket.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="drawer-section">
          <h3>
            Comments
            {detail && detail.comments.length > 0 && (
              <span className="drawer-count">last {detail.comments.length}</span>
            )}
          </h3>
          {pending && <Shimmer lines={2} />}
          {detail &&
            (detail.comments.length === 0 ? (
              <p className="mini-empty">No comments.</p>
            ) : (
              <ul className="drawer-comments">
                {detail.comments.map((comment) => (
                  <li key={comment.id}>
                    <p className="drawer-comment-head">
                      <strong>{comment.author?.name ?? 'someone'}</strong>
                      <span>{timeAgo(comment.at)}</span>
                    </p>
                    <Adf doc={comment.body} />
                  </li>
                ))}
              </ul>
            ))}
        </section>

        <footer className="drawer-foot">
          <TicketStatus ticket={ticket} onChanged={onChanged} />
          <a
            className="drawer-out"
            href={ticket.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Jira <OpenInNewRoundedIcon fontSize="inherit" />
          </a>
        </footer>
      </aside>
    </div>
  );
};

/** A placeholder that says "still fetching" without claiming a value. */
const Shimmer = ({ lines = 1 }: { lines?: number }) => (
  <>
    {Array.from({ length: lines }, (_, i) => (
      <span key={i} className="skeleton skeleton-line" role="img" aria-label="loading" />
    ))}
  </>
);
