import type { OpenPr, PrsReport, ReviewDecision } from '../types';
import { Chip } from './Chip';
import { ReportAccordion } from './ReportAccordion';
import { RefreshButton } from './RefreshButton';
import { PrSummary } from './PrSummary';

const REVIEW_LABEL: Record<ReviewDecision, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes requested',
  REVIEW_REQUIRED: 'awaiting review',
  COMMENTED: 'commented',
  NONE: 'no review',
};

const reviewTone = (review: ReviewDecision) => {
  if (review === 'APPROVED') return 'ok';
  if (review === 'CHANGES_REQUESTED' || review === 'COMMENTED') return 'bad';
  return 'open';
};

const staleDays = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const PrRow = ({ pr }: { pr: OpenPr }) => {
  const days = staleDays(pr.updatedAt);
  return (
    <article className="item">
      <span className="chip-status">
        <Chip tone={reviewTone(pr.review)}>{REVIEW_LABEL[pr.review]}</Chip>
      </span>
      <div className="item-body">
        <div className="item-top">
          <a className="ref" href={pr.url} target="_blank" rel="noopener noreferrer">
            #{pr.num}
          </a>
          {pr.draft && <Chip tone="na">draft</Chip>}
          {pr.ticket && pr.ticketUrl && (
            <a className="time" href={pr.ticketUrl} target="_blank" rel="noopener noreferrer">
              {pr.ticket}
            </a>
          )}
          <span className="time">{days === 0 ? 'today' : `${days}d idle`}</span>
        </div>
        <p className="subj">
          <a href={pr.url} target="_blank" rel="noopener noreferrer">
            {pr.title}
          </a>
        </p>
      </div>
    </article>
  );
};

export const OpenPrList = ({ report }: { report: PrsReport }) => {
  const total = report.repos.reduce((sum, group) => sum + group.prs.length, 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>🔀 My open PRs</h2>
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
                <PrRow key={pr.url} pr={pr} />
              ))}
            </div>
          </ReportAccordion>
        ))}
      </div>
    </section>
  );
};
