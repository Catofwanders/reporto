import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import type { JiraReport, PrsReport } from '../types';
import { flowFindings } from '../flowChecks';

interface FlowChecksProps {
  jira: JiraReport | null;
  prs: PrsReport | null;
}

/**
 * Where Jira and GitHub disagree. Renders nothing when they agree — a permanent "0 issues"
 * card trains you to stop reading it, and then it is worthless on the day it has something.
 */
export const FlowChecks = ({ jira, prs }: FlowChecksProps) => {
  const findings = flowFindings(jira, prs);
  if (findings.length === 0) return null;

  const serious = findings.filter((finding) => finding.severity === 'bad').length;

  return (
    <section className="panel flow-checks">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-icon badge-bad" aria-hidden="true">
            <ReportProblemRoundedIcon fontSize="small" />
          </span>
          <div>
            <h2>Worth a look</h2>
            <p className="panel-sub">
              {findings.length} place{findings.length === 1 ? '' : 's'} where Jira and GitHub
              disagree{serious > 0 && `, ${serious} of them serious`}
            </p>
          </div>
        </div>
      </div>

      <ul className="flow-list">
        {findings.map((finding) => (
          <li key={finding.id} className={`flow-item flow-${finding.severity}`}>
            <div className="flow-item-head">
              <p className="flow-title">{finding.title}</p>
              {finding.ticket && (
                <a
                  className="key"
                  href={finding.ticket.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {finding.ticket.key}
                </a>
              )}
            </div>
            <p className="flow-detail">{finding.detail}</p>
            {finding.prs && finding.prs.length > 0 && (
              <p className="flow-prs">
                {finding.prs.map((pr) => (
                  <a key={pr.url} href={pr.url} target="_blank" rel="noopener noreferrer">
                    {pr.label}
                  </a>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
