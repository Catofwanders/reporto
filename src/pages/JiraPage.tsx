import { useState } from 'react';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import type { JiraReport, PrsReport } from '../types';
import { useRefresh } from '../refreshContext';
import { JiraBoard } from '../components/JiraBoard';
import { JiraReportView } from '../components/JiraReportView';
import { RefreshButton } from '../components/RefreshButton';

interface JiraPageProps {
  report: JiraReport | null;
  /** Passed through to the board's ticket drawer, for PR review state. */
  prs?: PrsReport | null;
}

type View = 'board' | 'list';

export const JiraPage = ({ report, prs = null }: JiraPageProps) => {
  const { run, running } = useRefresh();
  const [view, setView] = useState<View>('board');

  if (!report) {
    return (
      <main className="grid">
        <p className="status">No Jira report yet — press the update button beside Jira in the sidebar.</p>
      </main>
    );
  }

  const total = report.groups.reduce((n, group) => n + group.tickets.length, 0);

  return (
    <main className="grid">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-icon badge-qc" aria-hidden="true">
              <ConfirmationNumberRoundedIcon fontSize="small" />
            </span>
            <div>
              <h2>Board</h2>
              <p className="panel-sub">
                {total} tickets across {report.groups.length} statuses
                {/* Says what the shimmering cards are waiting for, so the gaps read as
                    "loading" rather than as "none". */}
                {report.partial && (
                  <span className="panel-pending">
                    {running.has('jira') ? ' · PRs and ages loading…' : ' · PRs and ages not fetched'}
                  </span>
                )}
              </p>
            </div>
          </div>
          <span className="panel-meta">
            {/* Toggle buttons, not tabs: `role="tab"` promises a tabpanel, `aria-controls` and
                arrow-key navigation, and this is one control that swaps a view. */}
            <span className="segmented" role="group" aria-label="Jira view">
              {(['board', 'list'] as View[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  className={view === option ? 'is-active' : ''}
                  onClick={() => setView(option)}
                >
                  {option === 'board' ? 'Board' : 'List'}
                </button>
              ))}
            </span>
            {report.date}
            <RefreshButton kind="jira" />
          </span>
        </div>

        {report.banner && (
          <p className={`banner banner-${report.banner.tone}`}>{report.banner.text}</p>
        )}

        {view === 'board' && (
          <JiraBoard report={report} prs={prs} onChanged={() => void run('jira')} />
        )}
      </section>

      {/* The list keeps the detail a board card cannot hold — every note, every PR remark. */}
      {view === 'list' && (
        <JiraReportView report={report} prs={prs} onChanged={() => void run('jira')} />
      )}
    </main>
  );
};
