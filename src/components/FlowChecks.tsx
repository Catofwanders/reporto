import { useState } from 'react';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import type { JiraReport, PrsReport, SlackReport } from '../types';
import { flowFindings } from '../flowChecks';

/**
 * How many findings the card shows before folding.
 *
 * Seven PRs missing a ticket key are seven cards saying the same sentence, and they pushed
 * every module below the fold — a card meant to catch the eye instead became the page. The
 * serious ones come first, so what is folded away is the tail rather than the point.
 */
const SHOWN = 3;

interface FlowChecksProps {
  jira: JiraReport | null;
  prs: PrsReport | null;
  /** Optional: with it, the checks can also see questions nobody answered. */
  slack?: SlackReport | null;
  /**
   * Start folded, showing only the count. On the dashboard a contradiction is worth knowing
   * about rather than worth reading through, and the strip above already carries the number.
   */
  collapsed?: boolean;
}

/**
 * Where Jira and GitHub disagree. Renders nothing when they agree — a permanent "0 issues"
 * card trains you to stop reading it, and then it is worthless on the day it has something.
 */
export const FlowChecks = ({ jira, prs, slack = null, collapsed = false }: FlowChecksProps) => {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(!collapsed);
  const findings = flowFindings(jira, prs, slack);
  if (findings.length === 0) return null;

  const serious = findings.filter((finding) => finding.severity === 'bad').length;
  const shown = expanded ? findings : findings.slice(0, SHOWN);
  const hidden = findings.length - shown.length;

  // Folded: one line that says how many and how bad, and opens on a click.
  if (!open) {
    return (
      <button type="button" className="flow-folded" onClick={() => setOpen(true)}>
        <span className="panel-icon badge-bad" aria-hidden="true">
          <ReportProblemRoundedIcon fontSize="small" />
        </span>
        <strong>{findings.length}</strong>
        <span className="flow-folded-label">
          {findings.length === 1 ? 'conflict' : 'conflicts'}
          {serious > 0 && `, ${serious} serious`}
        </span>
        <span className="flow-folded-open">show</span>
      </button>
    );
  }

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
              {findings.length} place{findings.length === 1 ? '' : 's'} where Jira, GitHub and
              Slack disagree{serious > 0 && `, ${serious} of them serious`}
            </p>
          </div>
        </div>
      </div>

      <ul className="flow-list">
        {shown.map((finding) => (
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

      <p className="flow-actions">
        {(hidden > 0 || expanded) && (
          <button type="button" className="module-more" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer' : `${hidden} more`}
          </button>
        )}
        {collapsed && (
          <button type="button" className="module-more" onClick={() => setOpen(false)}>
            Hide
          </button>
        )}
      </p>
    </section>
  );
};
