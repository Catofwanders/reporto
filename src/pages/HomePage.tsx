import type { CalendarReport, JiraReport, PrsReport } from '../types';
import { useRefresh } from '../refreshContext';
import { CalendarWidget } from '../components/CalendarWidget';
import { JiraActiveList } from '../components/JiraActiveList';
import { OpenPrList } from '../components/OpenPrList';

interface HomePageProps {
  jira: JiraReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

export const HomePage = ({ jira, calendar, prs }: HomePageProps) => {
  const { run } = useRefresh();

  return (
    <main className="home">
      <div className="home-content">
        {prs && <OpenPrList report={prs} onChanged={() => void run('prs')} />}
        {jira && <JiraActiveList report={jira} onChanged={() => void run('jira')} />}
      </div>

      <div className="home-widgets">{calendar && <CalendarWidget report={calendar} />}</div>
    </main>
  );
};
