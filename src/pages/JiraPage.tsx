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
      {report ? (
        <JiraReportView report={report} onChanged={() => void run('jira')} />
      ) : (
        <p className="status">No jira report.</p>
      )}
    </main>
  );
};
