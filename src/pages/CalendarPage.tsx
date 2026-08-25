import type { CalendarReport } from '../types';
import { CalendarReportView } from '../components/CalendarReportView';

interface CalendarPageProps {
  report: CalendarReport | null;
}

export const CalendarPage = ({ report }: CalendarPageProps) => (
  <main className="grid">
    {report ? <CalendarReportView report={report} /> : <p className="status">No calendar report.</p>}
  </main>
);
