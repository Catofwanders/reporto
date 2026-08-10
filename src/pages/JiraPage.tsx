import { Link } from 'react-router-dom';
import type { JiraReport } from '../types';
import { JiraReportView } from '../components/JiraReportView';

interface JiraPageProps {
  report: JiraReport | null;
}

export const JiraPage = ({ report }: JiraPageProps) => (
  <main className="grid">
    <Link to="/" className="back-link">
      ← Home
    </Link>
    {report ? <JiraReportView report={report} /> : <p className="status">No jira report.</p>}
  </main>
);
