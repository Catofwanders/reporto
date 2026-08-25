import type { CalendarReport, JiraReport, PrsReport, StatsReport } from '../types';
import { useRefresh } from '../refreshContext';
import { CalendarWidget } from '../components/CalendarWidget';
import { HomeKpis } from '../components/HomeKpis';
import { JiraActiveList } from '../components/JiraActiveList';
import { PrLanes } from '../components/PrLanes';

interface HomePageProps {
  jira: JiraReport | null;
  stats: StatsReport | null;
  calendar: CalendarReport | null;
  prs: PrsReport | null;
}

/**
 * Today's work first, the month's numbers last: the tickets and PRs are what the dashboard
 * is opened for, and the statistics are context you scroll to rather than act on.
 */
export const HomePage = ({ jira, calendar, prs, stats }: HomePageProps) => {
  const { run } = useRefresh();

  return (
    <main className="home">
      <div className="home-split">
        <div className="home-content">
          {jira && <JiraActiveList report={jira} onChanged={() => void run('jira')} />}
          {prs && <PrLanes report={prs} onChanged={() => void run('prs')} />}
        </div>

        <div className="home-widgets">{calendar && <CalendarWidget report={calendar} />}</div>
      </div>

      {stats && <HomeKpis report={stats} />}
    </main>
  );
};
