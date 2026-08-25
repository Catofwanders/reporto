import { Link } from 'react-router-dom';
import type { StatsMonth, StatsReport } from '../types';
import {
  DELIVERY_METRICS,
  LOAD_METRICS,
  PR_METRICS,
  chronological,
  delta,
  formatValue,
  type StatsMetric,
} from '../statsMetrics';
import { MonthBars } from '../components/MonthBars';
import { RefreshButton } from '../components/RefreshButton';

interface StatsPageProps {
  report: StatsReport | null;
}

const HEADLINE_IDS = ['deployed', 'merged', 'cycle', 'meetings'];

const Headline = ({
  metric,
  months,
}: {
  metric: StatsMetric;
  months: StatsMonth[];
}) => {
  const latest = months[months.length - 1];
  const change = delta(metric, months);
  return (
    <li>
      <span className="stat-tile-value">{formatValue(metric, metric.value(latest))}</span>
      <span className={`stat-tile-mark bar-${metric.tone}`} aria-hidden="true" />
      <span className="stat-tile-label">{metric.label}</span>
      {change && (
        <span className={`stat-tile-delta ${change.better ? 'is-better' : 'is-worse'}`}>
          {change.change === 0
            ? 'no change'
            : `${change.change > 0 ? '▲' : '▼'} ${Math.abs(change.change)} vs ${
                months[months.length - 2].month
              }`}
        </span>
      )}
    </li>
  );
};

const Group = ({
  title,
  metrics,
  months,
}: {
  title: string;
  metrics: StatsMetric[];
  months: StatsMonth[];
}) => (
  <section className="panel">
    <div className="panel-head">
      <h2>{title}</h2>
    </div>
    <div className="stats-charts">
      {metrics.map((metric) => (
        <MonthBars key={metric.id} metric={metric} months={months} />
      ))}
    </div>
  </section>
);

export const StatsPage = ({ report }: StatsPageProps) => {
  if (!report) {
    return (
      <main className="grid">
        <Link to="/" className="back-link">
          ← Home
        </Link>
        <p className="status">No stats yet — press ⚡ on the Stats card to pull them.</p>
      </main>
    );
  }

  const months = chronological(report);
  const latest = months[months.length - 1];
  const all = [...DELIVERY_METRICS, ...PR_METRICS, ...LOAD_METRICS];
  const headlines = HEADLINE_IDS.map((id) => all.find((m) => m.id === id)).filter(
    (metric): metric is StatsMetric => Boolean(metric),
  );
  const repos = latest?.prs?.byRepo ?? [];
  const repoPeak = Math.max(...repos.map((r) => r.merged), 1);

  return (
    <main className="grid stats-page">
      <Link to="/" className="back-link">
        ← Home
      </Link>

      <section className="panel">
        <div className="panel-head">
          <h2>📈 {latest?.month ?? 'Stats'}</h2>
          <span className="panel-meta">
            {months.length} months · pulled {report.date}
            <RefreshButton kind="stats" />
          </span>
        </div>
        <ul className="stat-tiles stat-tiles-wide">
          {headlines.map((metric) => (
            <Headline key={metric.id} metric={metric} months={months} />
          ))}
        </ul>
      </section>

      <Group title="Delivery" metrics={DELIVERY_METRICS} months={months} />
      <Group title="Pull requests" metrics={PR_METRICS} months={months} />
      <Group title="Load" metrics={LOAD_METRICS} months={months} />

      {repos.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Merged by repo</h2>
            <span className="panel-meta">{latest?.month}</span>
          </div>
          <ul className="repo-bars">
            {repos.map((repo) => (
              <li key={repo.repo}>
                <span className="repo-bars-name">{repo.repo}</span>
                <span className="repo-bars-track">
                  <span
                    className="repo-bars-fill"
                    style={{ width: `${(repo.merged / repoPeak) * 100}%` }}
                  />
                </span>
                <span className="repo-bars-value">{repo.merged}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The numbers are only as good as what the APIs can see, and two limits are easy to
          forget: Outlook meetings are invisible here, and cycle time is a median over a
          sample rather than every ticket. */}
      <section className="panel stats-caveats">
        <div className="panel-head">
          <h2>What these count</h2>
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
