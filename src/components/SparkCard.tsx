import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import type { StatsMonth } from '../types';
import { MONTH_LABEL, delta, formatValue, type StatsMetric } from '../statsMetrics';

interface SparkCardProps {
  metric: StatsMetric;
  /** Oldest first — the spark runs left to right in time. */
  months: StatsMonth[];
  /** Icon component for the badge, e.g. a MUI icon. */
  icon: React.ComponentType<{ fontSize?: 'small' }>;
}

/**
 * A headline number with its own six-month shape underneath, the spark running into the
 * card's bottom edge. One metric per card, so the area needs no axes: the number says the
 * level and the shape says the direction, which is all a card this size can carry.
 *
 * Colours come from CSS custom properties rather than props, so the four palettes and
 * dark mode keep working without re-rendering the chart.
 */
export const SparkCard = ({ metric, months, icon: Icon }: SparkCardProps) => {
  const data = months.map((month) => ({
    month: MONTH_LABEL(month.month),
    value: metric.value(month) ?? 0,
  }));
  const latest = months.length ? metric.value(months[months.length - 1]) : null;
  const change = delta(metric, months);
  // Unique per instance: two cards sharing a gradient id would share the first one's hue.
  const gradient = `${useId()}-spark`;

  return (
    <article className="spark-card">
      <div className="spark-card-head">
        <span className="spark-card-label">{metric.label}</span>
        <span className={`spark-card-badge badge-${metric.tone}`} aria-hidden="true">
          <Icon fontSize="small" />
        </span>
      </div>

      <strong className="spark-card-value">{formatValue(metric, latest)}</strong>

      {change ? (
        <span className={`spark-card-delta ${change.better ? 'is-better' : 'is-worse'}`}>
          {change.change === 0
            ? 'no change'
            : `${change.change > 0 ? '▲' : '▼'} ${Math.abs(change.change)}`}
          {/*
            * The arrow direction is ambiguous by design — more merged PRs is good, more days of
            * cycle time is not — so hue was carrying the meaning alone. Now the word does.
            */}
          {change.change !== 0 && <em>{change.better ? 'better' : 'worse'}</em>}
          <em>vs last month</em>
        </span>
      ) : (
        <span className="spark-card-delta">
          <em>first month of data</em>
        </span>
      )}

      <div className="spark-card-plot">
        <ResponsiveContainer width="100%" height={52}>
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--${metric.tone}-ink)`} stopOpacity={0.35} />
                <stop offset="100%" stopColor={`var(--${metric.tone}-ink)`} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={`var(--${metric.tone}-ink)`}
              strokeWidth={2}
              fill={`url(#${gradient})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
};
