import { NavLink } from 'react-router-dom';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { KIND_META, REPORT_KINDS, type ReportKind } from '../reportKinds';
import { useCapabilities } from '../capabilitiesContext';
import { timeAgo } from '../timeAgo';
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

/**
 * The icon each report route wears. Only this stays per-kind here — the route and the label come
 * from `KIND_META`, so a new kind gets a nav row without anybody remembering to add one.
 */
const KIND_ICONS: Record<ReportKind, typeof HomeRoundedIcon> = {
  stats: InsightsRoundedIcon,
  jira: ConfirmationNumberRoundedIcon,
  prs: AltRouteRoundedIcon,
  reviews: VisibilityRoundedIcon,
  slack: ForumRoundedIcon,
  calendar: EventRoundedIcon,
};

/** The order the work rows appear in; anything not named falls in after, alphabetically. */
const WORK_ORDER: ReportKind[] = ['jira', 'prs', 'reviews', 'slack', 'calendar'];

const workRows = (): NavRow[] =>
  [...REPORT_KINDS.filter((kind) => kind !== 'stats')]
    .sort((a, b) => {
      const rank = (k: ReportKind) => {
        const at = WORK_ORDER.indexOf(k);
        return at === -1 ? WORK_ORDER.length : at;
      };
      return rank(a) - rank(b) || a.localeCompare(b);
    })
    .map((kind) => ({
      to: KIND_META[kind].route,
      label: KIND_META[kind].title,
      icon: KIND_ICONS[kind],
      kind,
    }));

const SECTIONS: { title: string; rows: NavRow[] }[] = [
  {
    title: 'Overview',
    rows: [
      { to: '/', label: 'Dashboard', icon: HomeRoundedIcon },
      {
        to: KIND_META.stats.route,
        label: KIND_META.stats.title,
        icon: KIND_ICONS.stats,
        kind: 'stats',
      },
    ],
  },
  { title: 'Work', rows: workRows() },
  {
    title: 'Toolkit',
    rows: [
      { to: '/projects', label: 'Projects', icon: AccountTreeRoundedIcon },
      { to: '/commands', label: 'Commands', icon: TerminalRoundedIcon },
    ],
  },
];

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
                        {running.has(row.kind) ? 'updating…' : timeAgo(generatedAt[row.kind])}
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
