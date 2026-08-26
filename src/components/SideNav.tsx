import { NavLink } from 'react-router-dom';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import type { ReportKind } from '../reportKinds';
import { useCapabilities } from '../capabilitiesContext';
import { RefreshButton } from './RefreshButton';

interface SideNavProps {
  /** Report timestamps, so a row can say how stale its data is. */
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
  /** Reports currently being pulled, for the row's "updating…" line. */
  running: Set<ReportKind>;
}

interface NavRow {
  to: string;
  label: string;
  icon: typeof HomeRoundedIcon;
  /** The report this row shows, when it has one — that is what carries a stamp. */
  kind?: ReportKind;
}

const SECTIONS: { title: string; rows: NavRow[] }[] = [
  {
    title: 'Overview',
    rows: [
      { to: '/', label: 'Dashboard', icon: HomeRoundedIcon },
      { to: '/stats', label: 'Statistics', icon: InsightsRoundedIcon, kind: 'stats' },
    ],
  },
  {
    title: 'Work',
    rows: [
      { to: '/jira', label: 'Jira', icon: ConfirmationNumberRoundedIcon, kind: 'jira' },
      { to: '/prs', label: 'Pull requests', icon: AltRouteRoundedIcon, kind: 'prs' },
      { to: '/reviews', label: 'Reviews', icon: VisibilityRoundedIcon, kind: 'reviews' },
      { to: '/calendar', label: 'Calendar', icon: EventRoundedIcon, kind: 'calendar' },
    ],
  },
  {
    title: 'Toolkit',
    rows: [
      { to: '/projects', label: 'Projects', icon: AccountTreeRoundedIcon },
      { to: '/commands', label: 'Commands', icon: TerminalRoundedIcon },
    ],
  },
];

/**
 * How old a report is, in the shortest form that still says it: minutes inside the hour,
 * hours inside the day, then the date. "never" is a real state — a fresh checkout has no
 * reports at all.
 */
const age = (iso: string | undefined): string => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/**
 * A row for a report this machine cannot fetch leads to a page that can only apologise, so
 * rows are dropped when their module is unconfigured or switched off. Sections empty
 * themselves out the same way rather than leaving a heading over nothing.
 */
export const SideNav = ({ generatedAt, running }: SideNavProps) => {
  const { usable } = useCapabilities();
  const sections = SECTIONS.map((section) => ({
    ...section,
    rows: section.rows.filter((row) => !row.kind || usable(row.kind)),
  })).filter((section) => section.rows.length > 0);

  return (
    <aside className="shell-side">
      <div className="shell-brand">
        <span className="shell-brand-mark" aria-hidden="true">
          ◧
        </span>
        <span className="shell-brand-text">
          <strong>reporto</strong>
          <small>daily triage</small>
        </span>
      </div>

      <nav className="shell-nav">
        {sections.map((section) => (
          <div key={section.title} className="shell-nav-group">
            <p className="shell-nav-title">{section.title}</p>
            <ul>
              {section.rows.map((row) => (
                <li key={row.to}>
                  {/* end, so "/" is only active on the dashboard rather than everywhere. */}
                  <NavLink to={row.to} end={row.to === '/'} className="shell-nav-row">
                    <row.icon className="shell-nav-icon" fontSize="small" />
                    <span className="shell-nav-label">{row.label}</span>
                    {row.kind && (
                      <span className="shell-nav-stamp">
                        {running.has(row.kind) ? 'updating…' : age(generatedAt[row.kind])}
                      </span>
                    )}
                  </NavLink>
                  {row.kind && (
                    <span className="shell-nav-refresh">
                      <RefreshButton kind={row.kind} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <NavLink to="/settings" className="shell-side-foot">
        <SettingsRoundedIcon fontSize="small" />
        <span>Settings</span>
      </NavLink>
    </aside>
  );
};
