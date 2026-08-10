export interface DonutSlice {
  label: string;
  value: number;
  cssColor: string;
}

interface DonutProps {
  slices: DonutSlice[];
  centerValue: number | string;
  centerLabel: string;
  size?: number;
}

// Simple SVG donut. Status colors only (done/need-action/neutral); identity is
// never color-alone — the legend beside it carries labels + counts.
export const Donut = ({ slices, centerValue, centerLabel, size = 132 }: DonutProps) => {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  let offset = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = total > 0 ? (s.value / total) * c : 0;
      const seg = { ...s, dash: Math.max(len - gap, 0), start: offset };
      offset += len;
      return seg;
    });

  return (
    <div className="donut-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerLabel}: ${centerValue}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.cssColor}
            strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={-s.start}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="donut-center-value"
          fill="var(--ink)"
        >
          {centerValue}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          className="donut-center-label"
          fill="var(--ink-2)"
        >
          {centerLabel}
        </text>
      </svg>
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <span className="dot" style={{ background: s.cssColor }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-value">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
