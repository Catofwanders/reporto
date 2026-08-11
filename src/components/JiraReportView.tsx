import type { JiraReport, Pr } from '../types';
import { Chip } from './Chip';
import { ReportAccordion } from './ReportAccordion';
import { RefreshButton } from './RefreshButton';

interface JiraReportViewProps {
  report: JiraReport;
}

const prLabel = (pr: Pr) => `${pr.repo.split('/').pop()}#${pr.num}`;

export const JiraReportView = ({ report }: JiraReportViewProps) => (
  <section className="panel">
    <div className="panel-head">
      <h2>🎫 Jira</h2>
      <span className="panel-meta">
        {report.date}
        <RefreshButton kind="jira" />
      </span>
    </div>

    {report.banner && (
      <p className={`banner banner-${report.banner.tone}`}>{report.banner.text}</p>
    )}

    {report.groups.map((group) => (
      <ReportAccordion
        key={group.title}
        title={group.title}
        count={group.tickets.length}
      >
        <div className="list">
          {group.tickets.map((ticket) => (
            <article key={ticket.key} className="item">
              <span className="chip-status">
                <Chip tone={ticket.chip}>{ticket.status}</Chip>
              </span>
              <div className="item-body">
                <div className="item-top">
                  <a className="key" href={ticket.url} target="_blank" rel="noopener">
                    {ticket.key}
                  </a>
                </div>
                <p className="subj">{ticket.summary}</p>
                {ticket.prs.length > 0 && (
                  <p className="prs">
                    {ticket.prs.map((pr) => (
                      <span key={pr.url} className={`pr pr-${pr.state}`}>
                        {pr.state === 'merged' ? '✓' : '◌'}{' '}
                        <a href={pr.url} target="_blank" rel="noopener">
                          {prLabel(pr)}
                        </a>
                        {pr.note && <em> ({pr.note})</em>}
                      </span>
                    ))}
                  </p>
                )}
                {ticket.notes.map((note) => (
                  <p key={note} className="note">
                    {note}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </ReportAccordion>
    ))}

    {report.restNote && <p className="foot">{report.restNote}</p>}
    {report.footer && <p className="foot">{report.footer}</p>}
  </section>
);
