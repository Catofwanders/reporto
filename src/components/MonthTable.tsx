import type { StatsMonth } from '../types';
import { formatValue, type StatsMetric } from '../statsMetrics';

interface MonthTableProps {
  months: StatsMonth[];
  metrics: StatsMetric[];
}

/**
 * The same numbers the charts draw, as a table. Not a fallback: a shape is quick to read
 * and bad to quote from, and this is the view that answers "what exactly was July".
 * It also keeps the page usable where colour cannot be relied on at all.
 */
export const MonthTable = ({ months, metrics }: MonthTableProps) => (
  <div className="table-card">
    <table>
      <thead>
        <tr>
          <th scope="col">Month</th>
          {metrics.map((metric) => (
            <th key={metric.id} scope="col" title={metric.hint}>
              {metric.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* Newest first here: a table is scanned from the top, unlike a timeline. */}
        {[...months].reverse().map((month) => (
          <tr key={month.month}>
            <th scope="row">{month.month}</th>
            {metrics.map((metric) => (
              <td key={metric.id}>{formatValue(metric, metric.value(month))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
