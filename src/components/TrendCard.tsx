import { useId, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StatsMonth } from '../types';
import { MONTH_LABEL, formatValue, type StatsMetric } from '../statsMetrics';

interface TrendCardProps {
  title: string;
  subtitle: string;
  /** Metrics the segmented control switches between. The first is shown initially. */
  metrics: StatsMetric[];
  /** Oldest first. */
  months: StatsMonth[];
}

interface PointProps {
  active?: boolean;
  payload?: { payload: { month: string; value: number | null } }[];
  metric: StatsMetric;
}

const PointTooltip = ({ active, payload, metric }: PointProps) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tip">
      <span className="chart-tip-month">{point.month}</span>
      <strong>{formatValue(metric, point.value)}</strong>
    </div>
  );
};

/**
 * One metric over the months, switched by a segmented control rather than drawn together:
 * these are counts, days and hours, and a second y-axis to fit them on one plot would
 * misstate every series on it.
 *
 * Months with no value are plotted as gaps (`null`) instead of zeroes — `connectNulls` is
 * deliberately off, so a hole in the data looks like a hole.
 */
export const TrendCard = ({ title, subtitle, metrics, months }: TrendCardProps) => {
  const [activeId, setActiveId] = useState(metrics[0]?.id);
  // Gradient ids live in one document-wide namespace: three of these cards on a page all
  // declaring "trend-fill" made every area take the first card's colour.
  const fillId = `${useId()}-fill`;
  const metric = metrics.find((m) => m.id === activeId) ?? metrics[0];
  const data = months.map((month) => ({
    month: MONTH_LABEL(month.month),
    value: metric.value(month),
  }));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p className="panel-sub">{subtitle}</p>
        </div>
        {/* Toggles, not tabs — see JiraPage: no tabpanel exists, and none should. */}
        <div className="segmented" role="group" aria-label={`${title} metric`}>
          {metrics.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === metric.id}
              className={option.id === metric.id ? 'is-active' : ''}
              onClick={() => setActiveId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="trend-plot">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--${metric.tone}-ink)`} stopOpacity={0.28} />
                <stop offset="100%" stopColor={`var(--${metric.tone}-ink)`} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Horizontal dotted rules only: vertical ones fight the columns of months. */}
            <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--ink-2)', fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={46}
              tick={{ fill: 'var(--ink-2)', fontSize: 11 }}
            />
            <Tooltip
              content={<PointTooltip metric={metric} />}
              cursor={{ stroke: 'var(--line)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={`var(--${metric.tone}-ink)`}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              connectNulls={false}
              isAnimationActive={false}
              dot={{ r: 3, fill: 'var(--panel)', stroke: `var(--${metric.tone}-ink)`, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="panel-foot">{metric.hint}</p>
    </section>
  );
};
