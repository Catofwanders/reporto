import { useLocation } from 'react-router-dom';
import type { JiraReport, PrsReport } from '../types';
import type { ReportKind } from '../reportKinds';
import { useRefresh } from '../refreshContext';
import { CommandPalette } from './CommandPalette';
import { SideNav } from './SideNav';
import { StaleRefresh } from './StaleRefresh';
import { TopBar } from './TopBar';

interface AppShellProps {
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
  /** What ⌘K searches: tickets and PRs, alongside pages, updates and the kit listing. */
  jira: JiraReport | null;
  prs: PrsReport | null;
  children: React.ReactNode;
}

/**
 * Heading per route, so the top bar says where you are without a breadcrumb trail, plus the
 * report that page is about: the top-bar button updates what you are looking at. Only the
 * dashboard shows every report, so only the dashboard offers "update all"; settings shows
 * no report at all and offers nothing.
 */
const HEADINGS: Record<
  string,
  { title: string; subtitle: string; kind?: ReportKind; action?: 'all' | 'none' }
> = {
  '/': {
    title: 'Dashboard',
    subtitle: 'What needs you today, across Jira and GitHub.',
    action: 'all',
  },
  '/stats': {
    title: 'Statistics',
    subtitle: 'Six months of delivery, review and meeting load.',
    kind: 'stats',
  },
  '/jira': {
    title: 'Jira',
    subtitle: 'Every ticket assigned to me, grouped by status.',
    kind: 'jira',
  },
  '/prs': {
    title: 'Pull requests',
    subtitle: 'My open PRs, their review state and QC standing.',
    kind: 'prs',
  },
  '/reviews': {
    title: 'Reviews',
    subtitle: "PRs waiting on your review, and the ones that moved since you looked.",
    kind: 'reviews',
  },
  '/calendar': {
    title: 'Calendar',
    subtitle: "Today's events and the upcoming watch-list.",
    kind: 'calendar',
  },
  '/projects': {
    title: 'Projects',
    subtitle: 'How work travels, which repositories exist, and what talks to what.',
    action: 'none',
  },
  '/commands': {
    title: 'Commands',
    subtitle: 'Every slash command and skill installed on this machine.',
    action: 'none',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Palette, and what this dashboard is allowed to do.',
    action: 'none',
  },
};

export const AppShell = ({ generatedAt, jira, prs, children }: AppShellProps) => {
  const { pathname } = useLocation();
  const { running } = useRefresh();
  // A project page is one of many, so it is titled from the path rather than the table.
  const heading = pathname.startsWith('/projects/')
    ? { title: 'Project', subtitle: 'What it is, what it talks to, and how work moves through it.', action: 'none' as const }
    : (HEADINGS[pathname] ?? HEADINGS['/']);

  return (
    <div className="shell">
      <StaleRefresh generatedAt={generatedAt} />
      <CommandPalette jira={jira} prs={prs} />
      <SideNav generatedAt={generatedAt} running={running} />
      <div className="shell-main">
        <TopBar
          title={heading.title}
          subtitle={heading.subtitle}
          kind={heading.kind}
          action={heading.action}
        />
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
};
