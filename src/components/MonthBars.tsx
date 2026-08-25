import type { StatsMonth } from '../types';
import { MONTH_LABEL, formatValue, type StatsMetric } from '../statsMetrics';

interface MonthBarsProps {
  metric: StatsMetric;
  /** Oldest first. */
  months: StatsMonth[];
}

const HEIGHT = 64;
const BAR = 14;
const GAP = 10;
const RADIUS = 4;

/**
 * One metric across the months, as columns from a zero baseline.
 *
 * Deliberately one series per chart: the metrics are counts, days and hours, and putting
 * two of those on one pair of axes would be a lie about their scale. Only the newest
 * column carries a number — a label on every bar is noise, and the rest are one hover
 * away.
 */
export const MonthBars = ({ metric, months }: MonthBarsProps) => {
  const values = months.map((month) => metric.value(month));
  const peak = Math.max(...values.map((v) => v ?? 0), 1);
  const width = months.length * (BAR + GAP) - GAP;
  const latest = values[values.length - 1] ?? null;

  return (
    <figure className="month-bars">
      <figcaption>
        <span className="month-bars-label">{metric.label}</span>
        <span className="month-bars-value">{formatValue(metric, latest)}</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${HEIGHT + 14}`}
        className="month-bars-plot"
        role="img"
        aria-label={`${metric.label} by month: ${months
          .map((m, i) => `${MONTH_LABEL(m.month)} ${formatValue(metric, values[i])}`)
          .join(', ')}`}
      >
        <line x1="0" y1={HEIGHT} x2={width} y2={HEIGHT} className="month-bars-baseline" />
        {months.map((month, i) => {
          const value = values[i];
          const x = i * (BAR + GAP);
          // A month with no value still gets a baseline tick, so a gap in the data reads
          // as a gap rather than as a zero.
          const height = value === null ? 2 : Math.max(2, (value / peak) * HEIGHT);
          const newest = i === months.length - 1;
          return (
            <g key={month.month} className={`month-bars-col ${newest ? 'is-newest' : ''}`}>
              <title>{`${month.month}: ${formatValue(metric, value)}`}</title>
              <rect
                x={x}
                y={HEIGHT - height}
                width={BAR}
                height={height}
                rx={RADIUS}
                className={value === null ? 'bar bar-empty' : `bar bar-${metric.tone}`}
              />
              <text x={x + BAR / 2} y={HEIGHT + 11} className="month-bars-tick">
                {MONTH_LABEL(month.month)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="month-bars-hint">{metric.hint}</p>
    </figure>
  );
};
