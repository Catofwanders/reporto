import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface MixPart {
  id: string;
  title: string;
  count: number;
  /** Said on hover. Carries the lane names when a segment folds several of them together. */
  detail?: string;
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

/**
 * One pile of work as a single bar.
 *
 * Four numbers in a row is a list to read; the same four as segments is a shape to glance at —
 * whether the pile is mostly waiting on other people or mostly waiting on me is the question,
 * and proportion answers it faster than arithmetic. The counts stay as labels underneath,
 * because a segment nobody can measure is decoration.
 *
 * Deliberately not a donut: these are parts of one pile, and a bar compares lengths, which is
 * the comparison people read accurately.
 */
export const MixCard = ({ icon, badge, title, to, linkLabel, parts, empty }: MixCardProps) => {
  const total = parts.reduce((sum, part) => sum + part.count, 0);
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
            title={part.detail ?? `${part.count} ${part.title.toLowerCase()}`}
          />
        ))}
      </div>

      <ul className="mix-legend">
        {parts.map((part) => (
          <li key={part.id} title={part.detail}>
            <span className="mix-swatch" style={{ background: part.ink }} aria-hidden="true" />
            <strong>{part.count}</strong>
            <span>{part.title.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
