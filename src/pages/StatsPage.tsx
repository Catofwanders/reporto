import type { StatsReport } from '../types';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import TimerRoundedIcon from '@mui/icons-material/TimerRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import {
  DELIVERY_METRICS,
  LOAD_METRICS,
  PR_METRICS,
  chronological,
  type StatsMetric,
} from '../statsMetrics';
import { MonthTable } from '../components/MonthTable';
import { RepoDonut } from '../components/RepoDonut';
import { SparkCard } from '../components/SparkCard';
import { TrendCard } from '../components/TrendCard';

interface StatsPageProps {
  report: StatsReport | null;
}

const ALL = [...DELIVERY_METRICS, ...PR_METRICS, ...LOAD_METRICS];

/** The four numbers worth a card of their own, with the badge each one wears. */
const HEADLINES = [
  { id: 'deployed', icon: RocketLaunchRoundedIcon },
  { id: 'merged', icon: AltRouteRoundedIcon },
  { id: 'cycle', icon: TimerRoundedIcon },
  { id: 'meetings', icon: EventRoundedIcon },
];

type Badge = React.ComponentType<{ fontSize?: 'small' }>;

const pick = (ids: { id: string; icon: Badge }[]) =>
  ids
    .map(({ id, icon }) => ({ metric: ALL.find((m) => m.id === id), icon }))
    .filter((entry): entry is { metric: StatsMetric; icon: Badge } => Boolean(entry.metric));

export const StatsPage = ({ report }: StatsPageProps) => {
  if (!report) {
    return (
      <main className="grid">
        <p className="status">
          No statistics yet — press the update button beside Statistics in the sidebar.
        </p>
      </main>
    );
  }

  const months = chronological(report);
  const latest = months[months.length - 1];

  return (
    <main className="grid">
      <div className="kpi-grid">
        {pick(HEADLINES).map(({ metric, icon }) => (
          <SparkCard key={metric.id} metric={metric} months={months} icon={icon} />
        ))}
      </div>

      <div className="stats-split">
        <TrendCard
          title="Delivery"
          subtitle="Tickets through the workflow, by month"
          metrics={DELIVERY_METRICS}
          months={months}
        />

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Merged by repo</h2>
              <p className="panel-sub">Share of {latest?.month} merges</p>
            </div>
          </div>
          <RepoDonut slices={latest?.prs?.byRepo ?? []} month={latest?.month ?? ''} />
        </section>
      </div>

      <TrendCard
        title="Pull requests"
        subtitle="Throughput and review turnaround, by month"
        metrics={PR_METRICS}
        months={months}
      />

      <TrendCard
        title="Load"
        subtitle="What arrived, and what the calendar took"
        metrics={LOAD_METRICS}
        months={months}
      />

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Every month</h2>
            <p className="panel-sub">The same numbers, exact</p>
          </div>
          <span className="panel-meta">pulled {report.date}</span>
        </div>
        <MonthTable months={months} metrics={ALL} />
      </section>

      {/* The limits are easy to forget once the numbers are drawn as a smooth area. */}
      <section className="panel stats-caveats">
        <div className="panel-head">
          <div>
            <h2>What these count</h2>
            <p className="panel-sub">Read this before quoting any of it</p>
          </div>
        </div>
        <ul>
          <li>
            Jira counts are transitions <em>into</em> a status during the month, for tickets
            assigned to me: {report.statuses.deployed} for deployed,{' '}
            {report.statuses.releaseReady} for release ready.
          </li>
          <li>
            Cycle time is a median over {latest?.cycle?.sampled ?? 0} of the{' '}
            {latest?.jira?.releaseReady ?? 0} tickets that landed this month.
          </li>
          <li>Meeting hours cover Google calendars only — Outlook is not readable here.</li>
          <li>
            “PRs I reviewed” is dated by when the PR last moved, not by when the review was
            left; GitHub search cannot answer the second question.
          </li>
        </ul>
        {report.notes.length > 0 && (
          <ul className="stats-notes">
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};
