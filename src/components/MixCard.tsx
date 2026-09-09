import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** One row of a segment's popup: what it is, whose it is, and why it is in this segment. */
export interface MixItem {
  id: string;
  /** repo#num — the handle people actually paste at each other. */
  name: string;
  title: string;
  /** Whose PR it is. Left out where every row has the same answer, as on my own PRs. */
  author?: string;
  note: string;
}

export interface MixPart {
  id: string;
  title: string;
  count: number;
  /** The lanes behind the number, when a segment folds several of them together. */
  detail?: string;
  items: MixItem[];
  ink: string;
}

interface MixCardProps {
  icon: ReactNode;
  /** The head badge's tone class, e.g. `badge-open`. */
  badge: string;
  title: string;
  /** Where the full list lives. */
  to: string;
  /** The link's own words — "4 open" reads differently from "4 to review". */
  linkLabel: string;
  parts: MixPart[];
  /** Said rather than rendered as an absence: a missing card and an empty pile look alike. */
  empty: string;
}

/** Enough to see what the segment is made of; past that the page it links to is the answer. */
const SHOWN = 6;

/**
 * One pile of work as a single bar.
 *
 * Four numbers in a row is a list to read; the same four as segments is a shape to glance at —
 * whether the pile is mostly waiting on other people or mostly waiting on me is the question,
 * and proportion answers it faster than arithmetic. The counts stay as labels underneath,
 * because a segment nobody can measure is decoration.
 *
 * Hovering a segment names the rows behind it. A native `title` was already doing that with
 * the counts, which the legend prints anyway — the useful answer to "1 needs you" is *which
 * one*, and that needs real markup rather than a tooltip attribute.
 *
 * Deliberately not a donut: these are parts of one pile, and a bar compares lengths, which is
 * the comparison people read accurately.
 */
export const MixCard = ({ icon, badge, title, to, linkLabel, parts, empty }: MixCardProps) => {
  const [open, setOpen] = useState<string | null>(null);
  const popId = useId();
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  const shown = parts.find((part) => part.id === open);

  const head = (
    <div className="mini-head">
      <span className={`panel-icon ${badge}`} aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      {total > 0 && (
        <Link className="day-more" to={to}>
          {linkLabel}
        </Link>
      )}
    </div>
  );

  if (total === 0) {
    return (
      <section className="panel mix-card">
        {head}
        <p className="mini-empty">{empty}</p>
      </section>
    );
  }

  return (
    <section className="panel mix-card">
      {head}

      <div
        className="mix-bar"
        role="img"
        aria-label={parts.map((part) => `${part.count} ${part.title}`).join(', ')}
      >
        {parts.map((part) => (
          <span
            key={part.id}
            className="mix-part"
            style={{ flexGrow: part.count, background: part.ink }}
            onMouseEnter={() => setOpen(part.id)}
            onMouseLeave={() => setOpen(null)}
          />
        ))}
      </div>

      <ul className="mix-legend">
        {parts.map((part) => (
          <li key={part.id}>
            {/*
              A button rather than a hover-only span: the popup is the only place the rows are
              named, so it has to be reachable by keyboard as well as by pointer.
            */}
            <button
              type="button"
              className="mix-legend-btn"
              aria-describedby={open === part.id ? popId : undefined}
              aria-expanded={open === part.id}
              onMouseEnter={() => setOpen(part.id)}
              onMouseLeave={() => setOpen(null)}
              onFocus={() => setOpen(part.id)}
              onBlur={() => setOpen(null)}
              onClick={() => setOpen((id) => (id === part.id ? null : part.id))}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(null);
              }}
            >
              <span className="mix-swatch" style={{ background: part.ink }} aria-hidden="true" />
              <strong>{part.count}</strong>
              <span>{part.title.toLowerCase()}</span>
            </button>
          </li>
        ))}
      </ul>

      {/*
        One popup per card, anchored to the card rather than to the swatch it came from: a
        popup measured from the last legend entry hangs off the right edge of the screen, and
        this panel is narrow enough that the card's own width is the only sane width.
      */}
      {shown && (
        <div className="mix-pop" role="tooltip" id={popId}>
          <p className="mix-pop-head">
            <span className="mix-swatch" style={{ background: shown.ink }} aria-hidden="true" />
            {shown.detail ?? `${shown.count} ${shown.title.toLowerCase()}`}
          </p>
          <ul className="mix-pop-list">
            {shown.items.slice(0, SHOWN).map((item) => (
              <li key={item.id}>
                <p className="mix-pop-name">
                  <strong>{item.name}</strong>
                  {item.author && <span className="mix-pop-author">@{item.author}</span>}
                </p>
                <p className="mix-pop-title">{item.title}</p>
                <p className="mix-pop-note">{item.note}</p>
              </li>
            ))}
          </ul>
          {shown.items.length > SHOWN && (
            <p className="mix-pop-more">
              {shown.items.length - SHOWN} more on the {title.toLowerCase()} page
            </p>
          )}
        </div>
      )}
    </section>
  );
};
