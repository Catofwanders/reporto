import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface RepoDonutProps {
  /** Repo → PRs merged, biggest first. */
  slices: { repo: string; merged: number }[];
  /** The month these belong to, for the empty state. */
  month: string;
}

/**
 * How concentrated the month was, as a share of merged PRs.
 *
 * The ramp is one hue at three steps, not one hue per repo. The status inks this app is
 * built from are tuned to be read one at a time beside a label, so as a categorical set
 * they are indistinguishable: green↔red sits at ΔE 5.3 for a deuteranope, and blue↔purple
 * at ΔE 8.7 even with full colour vision. Three steps of the accent is what survives the
 * light-end contrast floor in both colour schemes, so the donut carries the two biggest
 * repos and folds the tail — the ranking itself is the bar list underneath, where identity
 * comes from labels instead of hue.
 */
const STEPS = [1, 0.7, 0.45];

interface TipProps {
  active?: boolean;
  payload?: { payload: { repo: string; merged: number } }[];
  total: number;
}

const SliceTooltip = ({ active, payload, total }: TipProps) => {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="chart-tip">
      <span className="chart-tip-month">{slice.repo}</span>
      <strong>
        {slice.merged} · {Math.round((slice.merged / total) * 100)}%
      </strong>
    </div>
  );
};

const fold = (slices: { repo: string; merged: number }[]) => {
  if (slices.length <= STEPS.length) return slices;
  const head = slices.slice(0, STEPS.length - 1);
  const tail = slices.slice(STEPS.length - 1);
  return [
    ...head,
    { repo: `${tail.length} other repos`, merged: tail.reduce((n, s) => n + s.merged, 0) },
  ];
};

export const RepoDonut = ({ slices, month }: RepoDonutProps) => {
  const data = fold(slices);
  const total = data.reduce((sum, slice) => sum + slice.merged, 0);
  if (total === 0) return <p className="status">Nothing merged in {month}.</p>;
  const peak = Math.max(...slices.map((s) => s.merged), 1);

  return (
    <div className="donut-card">
      <div className="donut-card-plot">
        <ResponsiveContainer width="100%" height={186}>
          <PieChart>
            <Pie
              data={data}
              dataKey="merged"
              nameKey="repo"
              innerRadius="64%"
              outerRadius="94%"
              // A surface-coloured gap, so two adjacent slices never read as one wedge.
              paddingAngle={2}
              stroke="var(--panel)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((slice, i) => (
                <Cell key={slice.repo} fill="var(--accent)" fillOpacity={STEPS[i]} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <span className="donut-card-centre">
          <strong>{total}</strong>
          <small>merged</small>
        </span>
      </div>

      <ul className="donut-card-legend">
        {data.map((slice, i) => (
          <li key={slice.repo}>
            <span
              className="donut-dot"
              style={{ background: 'var(--accent)', opacity: STEPS[i] }}
              aria-hidden="true"
            />
            <span className="donut-card-name">{slice.repo}</span>
            <span className="donut-card-count">{Math.round((slice.merged / total) * 100)}%</span>
          </li>
        ))}
      </ul>

      {/* The full ranking, where a label carries identity and length carries magnitude —
          the job the donut cannot do for seven repos. */}
      <ul className="repo-bars">
        {slices.map((repo) => (
          <li key={repo.repo}>
            <span className="repo-bars-name">{repo.repo}</span>
            <span className="repo-bars-track">
              <span className="repo-bars-fill" style={{ width: `${(repo.merged / peak) * 100}%` }} />
            </span>
            <span className="repo-bars-value">{repo.merged}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
