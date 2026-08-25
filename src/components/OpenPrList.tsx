import type { OpenPr, PrsReport } from '../types';
import { PR_STATE_LABEL, PR_STATE_TONE, prState, qcChip } from '../prState';
import { Chip } from './Chip';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import { ReportAccordion } from './ReportAccordion';
import { RefreshButton } from './RefreshButton';
import { PrSummary } from './PrSummary';
import { PrDraftToggle } from './PrDraftToggle';
import { PrRowActions } from './PrRowActions';

const staleDays = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

interface PrRowProps {
  repo: string;
  pr: OpenPr;
  onChanged: () => void;
}

const PrRow = ({ repo, pr, onChanged }: PrRowProps) => {
  const days = staleDays(pr.updatedAt);
  const state = prState(pr);
  const qc = qcChip(pr.deployQc);
  return (
    <article className="item">
      <div className="item-body">
        <div className="item-top">
          <a className="ref" href={pr.url} target="_blank" rel="noopener noreferrer">
            #{pr.num}
          </a>
          {pr.draft && <Chip tone="na">draft</Chip>}
          {(pr.unresolvedThreads ?? 0) > 0 && (
            <Chip tone="bad">
              {pr.unresolvedThreads} unresolved
            </Chip>
          )}
          {pr.ticket && pr.ticketUrl && (
            <a className="time" href={pr.ticketUrl} target="_blank" rel="noopener noreferrer">
              {pr.ticket}
            </a>
          )}
          <span className="time">{days === 0 ? 'today' : `${days}d idle`}</span>
          <PrDraftToggle repo={repo} pr={pr} onChanged={onChanged} />
        </div>
        <p className="subj">
          <a href={pr.url} target="_blank" rel="noopener noreferrer">
            {pr.title}
          </a>
        </p>
      </div>
      <span className={`chip-status${qc ? ' chip-status-split' : ''}`}>
        <span
          className={`chip chip-${PR_STATE_TONE[state]}`}
          title={PR_STATE_LABEL[state]}
        >
          {PR_STATE_LABEL[state]}
        </span>
        {qc && (
          <span className={`chip chip-${qc.tone}`} title={qc.title}>
            {qc.label}
          </span>
        )}
      </span>
      <PrRowActions repo={repo} pr={pr} onChanged={onChanged} />
    </article>
  );
};

interface OpenPrListProps {
  report: PrsReport;
  /** Refetch after a PR's state changes, so the list stops showing the old state. */
  onChanged: () => void;
}

export const OpenPrList = ({ report, onChanged }: OpenPrListProps) => {
  const total = report.repos.reduce((sum, group) => sum + group.prs.length, 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-open" aria-hidden="true">
            <AltRouteRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>My open PRs</h2>
            <p className="panel-sub">Review state and deploy-qc standing</p>
          </div>
        </div>
        <span className="panel-meta">
          {report.date} · {total} open in {report.repos.length} repos
          <RefreshButton kind="prs" />
        </span>
      </div>

      <PrSummary report={report} />

      <div className="pr-groups">
        {report.repos.map((group) => (
          <ReportAccordion key={group.repo} title={group.repo} count={group.prs.length}>
            <div className="list">
              {group.prs.map((pr) => (
                <PrRow key={pr.url} repo={group.repo} pr={pr} onChanged={onChanged} />
              ))}
            </div>
          </ReportAccordion>
        ))}
      </div>
    </section>
  );
};
