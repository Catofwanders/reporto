import { Link } from 'react-router-dom';
import type { SvgIconComponent } from '@mui/icons-material';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import HourglassBottomRoundedIcon from '@mui/icons-material/HourglassBottomRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import type { Kpis } from '../needsYou';

type Kind = 'prs' | 'reviews' | 'slack' | 'jira';

interface KpiStripProps {
  counts: Kpis;
  /** Which report kinds are usable, so a tile for a switched-off module never appears. */
  usable: (kind: Kind) => boolean;
  /**
   * Whether the report a tile counts is actually loaded. Without this a never-pulled report
   * and a genuinely clear morning are the same six grey zeroes — and "0 waiting on you" is a
   * claim the app has no basis for making before anything has been fetched.
   */
  loaded?: (kind: Kind) => boolean;
}

interface Tile {
  key: keyof Kpis;
  label: string;
  icon: SvgIconComponent;
  to: string;
  /** The tone a non-zero count deserves: some numbers are neutral, some are a problem. */
  tone: 'accent' | 'warn' | 'bad';
  /** Spelled out on hover, because a two-word label cannot define what it counts. */
  title: string;
  /** The module this tile belongs to; a switched-off one drops the tile entirely. */
  needs?: Kind;
  /** The reports the figure is built from. None loaded means the figure is unknown, not zero. */
  counts: Kind[];
}

const TILES: Tile[] = [
  {
    key: 'prs',
    counts: ['prs'],
    label: 'my open PRs',
    icon: AltRouteRoundedIcon,
    to: '/prs',
    tone: 'accent',
    title: 'Every pull request of mine that is still open',
    needs: 'prs',
  },
  {
    key: 'reviews',
    counts: ['reviews'],
    label: 're-reviews',
    icon: VisibilityRoundedIcon,
    to: '/reviews',
    tone: 'warn',
    title: 'PRs I reviewed that have been pushed to since — my verdict is out of date',
    needs: 'reviews',
  },
  {
    key: 'tickets',
    counts: ['jira'],
    label: 'my active tickets',
    icon: ConfirmationNumberRoundedIcon,
    to: '/jira',
    tone: 'accent',
    title: 'Tickets assigned to me that are in flight rather than in the backlog',
    needs: 'jira',
  },
  {
    key: 'stuck',
    counts: ['jira'],
    label: 'tickets sitting too long',
    icon: HourglassBottomRoundedIcon,
    to: '/jira',
    tone: 'bad',
    title:
      'Tickets in one of the statuses watched for this (stuckStatuses in ' +
      'config/reporto.json) for longer than that status allows. Blocked and QC-failed ' +
      'tickets are excluded: they are loud through their own status, not through their age',
    needs: 'jira',
  },
  {
    key: 'conflicts',
    counts: ['jira', 'prs', 'slack'],
    label: 'Jira and GitHub disagree',
    icon: ReportProblemRoundedIcon,
    to: '/jira',
    tone: 'bad',
    title:
      'Places where the board and the repositories contradict each other: merged work missing ' +
      'from deploy-qc, a finished ticket with an unmerged PR, an unanswered question about ' +
      'live work',
  },
];

/**
 * The whole morning as six numbers.
 *
 * This is the part of a dashboard that gets read in a second, so each tile is an icon, a
 * figure and two words — no sentences. A zero keeps its tile but loses its colour: "nothing to
 * review" is worth knowing, and a tile that vanishes at zero makes the strip jump around
 * between loads.
 */
export const KpiStrip = ({ counts, usable, loaded = () => true }: KpiStripProps) => (
  <div className="kpi-strip">
    {TILES.filter((tile) => !tile.needs || usable(tile.needs)).map((tile) => {
      const known = tile.counts.some((kind) => loaded(kind));
      const value = counts[tile.key];
      return (
        <Link
          key={tile.key}
          to={tile.to}
          title={known ? tile.title : `${tile.title}. Not pulled yet — press update.`}
          className={`kpi-tile${known && value > 0 ? ` is-${tile.tone}` : ' is-zero'}`}
        >
          <tile.icon className="kpi-icon" fontSize="small" />
          <strong className="kpi-value">{known ? value : '—'}</strong>
          <span className="kpi-label">{tile.label}</span>
        </Link>
      );
    })}
  </div>
);
