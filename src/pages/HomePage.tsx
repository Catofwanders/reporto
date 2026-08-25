import type { CalendarReport, JiraReport, PrsReport, StatsReport } from '../types';
import { useRefresh } from '../refreshContext';
import { CalendarWidget } from '../components/CalendarWidget';
import { FlowChecks } from '../components/FlowChecks';
import { StandupCard } from '../components/StandupCard';
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
          {/* Contradictions first: they are the only thing here that is silently wrong. */}
          <FlowChecks jira={jira} prs={prs} />
          {jira && <JiraActiveList report={jira} onChanged={() => void run('jira')} />}
          {prs && <PrLanes report={prs} onChanged={() => void run('prs')} />}
        </div>

        <div className="home-widgets">{calendar && <CalendarWidget report={calendar} />}</div>
      </div>

      <StandupCard jira={jira} prs={prs} calendar={calendar} />

      {stats && <HomeKpis report={stats} />}
    </main>
  );
};
