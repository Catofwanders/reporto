export type StatTone = 'good' | 'bad' | 'neutral';

interface StatTileProps {
  label: string;
  value: number | string;
  tone?: StatTone;
  sub?: string;
}

export const StatTile = ({ label, value, tone = 'neutral', sub }: StatTileProps) => (
  <div className="stat-tile">
    <span className="stat-label">{label}</span>
    <span className={`stat-value stat-${tone}`}>{value}</span>
    {sub && <span className="stat-sub">{sub}</span>}
  </div>
);
