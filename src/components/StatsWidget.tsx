import { Link } from 'react-router-dom';
import type { StatsReport } from '../types';
import { DELIVERY_METRICS, LOAD_METRICS, PR_METRICS, chronological, delta, formatValue } from '../statsMetrics';
import { RefreshButton } from './RefreshButton';

interface StatsWidgetProps {
  report: StatsReport;
}

const TILE_IDS = ['deployed', 'merged', 'cycle', 'meetings'];

const ALL = [...DELIVERY_METRICS, ...PR_METRICS, ...LOAD_METRICS];

/**
 * This month at a glance, with the change against last month. Four numbers only: the
 * dashboard is for today's work, and anybody who wants the trend clicks through.
 */
export const StatsWidget = ({ report }: StatsWidgetProps) => {
  const months = chronological(report);
  const latest = months[months.length - 1];
  if (!latest) return null;

  const tiles = TILE_IDS.map((id) => ALL.find((metric) => metric.id === id)).filter(
    (metric): metric is NonNullable<typeof metric> => Boolean(metric),
  );

  return (
    <section className="panel widget">
      <div className="panel-head">
        <h2>📈 This month</h2>
        <span className="panel-meta">
          <Link to="/stats">{latest.month} →</Link>
          <RefreshButton kind="stats" />
        </span>
      </div>

      <ul className="stat-tiles">
        {tiles.map((metric) => {
          const value = metric.value(latest);
          const change = delta(metric, months);
          return (
            <li key={metric.id}>
              <span className="stat-tile-value">{formatValue(metric, value)}</span>
              <span className={`stat-tile-mark bar-${metric.tone}`} aria-hidden="true" />
              <span className="stat-tile-label">{metric.label}</span>
              {change && (
                <span className={`stat-tile-delta ${change.better ? 'is-better' : 'is-worse'}`}>
                  {change.change === 0
                    ? 'no change'
                    : `${change.change > 0 ? '▲' : '▼'} ${Math.abs(change.change)} vs last`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
