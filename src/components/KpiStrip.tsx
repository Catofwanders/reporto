import { Link } from 'react-router-dom';
import type { SvgIconComponent } from '@mui/icons-material';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import HourglassBottomRoundedIcon from '@mui/icons-material/HourglassBottomRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import type { Kpis } from '../needsYou';

interface KpiStripProps {
  counts: Kpis;
  /** Which report kinds are usable, so a tile for a switched-off module never appears. */
  usable: (kind: 'prs' | 'reviews' | 'slack' | 'jira') => boolean;
}

interface Tile {
  key: keyof Kpis;
  label: string;
  icon: SvgIconComponent;
  to: string;
  /** The tone a non-zero count deserves: some numbers are neutral, some are a problem. */
  tone: 'accent' | 'warn' | 'bad';
  needs?: 'prs' | 'reviews' | 'slack' | 'jira';
}

const TILES: Tile[] = [
  { key: 'prs', label: 'my open PRs', icon: AltRouteRoundedIcon, to: '/prs', tone: 'accent', needs: 'prs' },
  { key: 'reviews', label: "reviews I owe", icon: VisibilityRoundedIcon, to: '/reviews', tone: 'warn', needs: 'reviews' },
  { key: 'slack', label: 'Slack replies I owe', icon: ForumRoundedIcon, to: '/slack', tone: 'warn', needs: 'slack' },
  { key: 'tickets', label: 'my active tickets', icon: ConfirmationNumberRoundedIcon, to: '/jira', tone: 'accent', needs: 'jira' },
  { key: 'stuck', label: 'stuck past their limit', icon: HourglassBottomRoundedIcon, to: '/jira', tone: 'bad', needs: 'jira' },
  { key: 'conflicts', label: 'Jira/GitHub conflicts', icon: ReportProblemRoundedIcon, to: '/jira', tone: 'bad' },
];

/**
 * The whole morning as six numbers.
 *
 * This is the part of a dashboard that gets read in a second, so each tile is an icon, a
 * figure and two words — no sentences. A zero keeps its tile but loses its colour: "nothing to
 * review" is worth knowing, and a tile that vanishes at zero makes the strip jump around
 * between loads.
 */
export const KpiStrip = ({ counts, usable }: KpiStripProps) => (
  <div className="kpi-strip">
    {TILES.filter((tile) => !tile.needs || usable(tile.needs)).map((tile) => {
      const value = counts[tile.key];
      return (
        <Link
          key={tile.key}
          to={tile.to}
          className={`kpi-tile${value > 0 ? ` is-${tile.tone}` : ' is-zero'}`}
        >
          <tile.icon className="kpi-icon" fontSize="small" />
          <strong className="kpi-value">{value}</strong>
          <span className="kpi-label">{tile.label}</span>
        </Link>
      );
    })}
  </div>
);
