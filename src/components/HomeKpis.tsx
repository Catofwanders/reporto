import { Link } from 'react-router-dom';
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import TimerRoundedIcon from '@mui/icons-material/TimerRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import type { StatsReport } from '../types';
import { DELIVERY_METRICS, LOAD_METRICS, PR_METRICS, chronological } from '../statsMetrics';
import { SparkCard } from './SparkCard';

interface HomeKpisProps {
  report: StatsReport;
}

const ALL = [...DELIVERY_METRICS, ...PR_METRICS, ...LOAD_METRICS];

const CARDS = [
  { id: 'deployed', icon: RocketLaunchRoundedIcon },
  { id: 'merged', icon: AltRouteRoundedIcon },
  { id: 'cycle', icon: TimerRoundedIcon },
  { id: 'meetings', icon: EventRoundedIcon },
];

/**
 * The month's headline numbers above today's work. Four cards, the same four the statistics
 * page leads with, so the dashboard and that page never disagree about what matters.
 */
export const HomeKpis = ({ report }: HomeKpisProps) => {
  const months = chronological(report);
  if (months.length === 0) return null;

  return (
    <section className="kpi-band">
      <div className="kpi-band-head">
        <h2>This month</h2>
        <Link to="/stats">All statistics →</Link>
      </div>
      <div className="kpi-grid">
        {CARDS.map(({ id, icon }) => {
          const metric = ALL.find((m) => m.id === id);
          if (!metric) return null;
          return <SparkCard key={id} metric={metric} months={months} icon={icon} />;
        })}
      </div>
    </section>
  );
};
