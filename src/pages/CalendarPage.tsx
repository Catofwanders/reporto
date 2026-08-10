import { Link } from 'react-router-dom';
import type { CalendarReport } from '../types';
import { CalendarReportView } from '../components/CalendarReportView';

interface CalendarPageProps {
  report: CalendarReport | null;
}

export const CalendarPage = ({ report }: CalendarPageProps) => (
  <main className="grid">
    <Link to="/" className="back-link">
      ← Home
    </Link>
    {report ? <CalendarReportView report={report} /> : <p className="status">No calendar report.</p>}
  </main>
);
