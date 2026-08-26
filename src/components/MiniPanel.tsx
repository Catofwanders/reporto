import type { ReactNode } from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import type { ReportKind } from '../reportKinds';
import { RefreshButton } from './RefreshButton';

interface MiniPanelProps {
  icon: SvgIconComponent;
  /** One of the badge tones the shell already defines: badge-qc, badge-open, badge-qcout. */
  badge: string;
  title: string;
  /** The report this module reads, so the module can be refetched on its own. */
  kind: ReportKind;
  /** Where the full version lives, and what the link says. */
  to: string;
  linkLabel: string;
  /** How many rows the module found — 0 renders `empty` instead of the children. */
  count: number;
  empty: string;
  children: ReactNode;
  /** Rendered under the head: counts, a strip, whatever summarises the rest. */
  summary?: ReactNode;
}

/**
 * A dashboard module: one question, the few rows that answer it, and a link to the page
 * that carries the whole thing.
 *
 * The dashboard used to embed the Jira panel and the PR lanes whole, which meant scrolling
 * past everything twice — once here and once on their own page. A module shows only what is
 * worth acting on before breakfast; the page it links to stays the place to work.
 *
 * An empty module still renders, saying so. One that disappeared when there was nothing to
 * do would be indistinguishable from one whose report failed to load.
 */
export const MiniPanel = ({
  icon: Icon,
  badge,
  title,
  kind,
  to,
  linkLabel,
  count,
  empty,
  children,
  summary,
}: MiniPanelProps) => (
  <section className="panel panel-mini">
    <div className="mini-head">
      <span className={`panel-icon ${badge}`} aria-hidden="true">
        <Icon fontSize="small" />
      </span>
      <h2>{title}</h2>
      <RefreshButton kind={kind} />
    </div>

    {summary}

    {count === 0 ? <p className="mini-empty">{empty}</p> : children}

    <Link className="mini-more" to={to}>
      {linkLabel} →
    </Link>
  </section>
);
