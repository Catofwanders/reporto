import { Link } from 'react-router-dom';
import type { JiraReport } from '../types';
import { useRefresh } from '../refreshContext';
import { JiraReportView } from '../components/JiraReportView';

interface JiraPageProps {
  report: JiraReport | null;
}

export const JiraPage = ({ report }: JiraPageProps) => {
  const { run } = useRefresh();
  return (
    <main className="grid">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      {report ? (
        <JiraReportView report={report} onChanged={() => void run('jira')} />
      ) : (
        <p className="status">No jira report.</p>
      )}
    </main>
  );
};
