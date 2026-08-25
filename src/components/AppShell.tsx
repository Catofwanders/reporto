import { useLocation } from 'react-router-dom';
import type { ReportKind } from '../reportKinds';
import { useRefresh } from '../refreshContext';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';

interface AppShellProps {
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
  children: React.ReactNode;
}

/** Heading per route, so the top bar says where you are without a breadcrumb trail. */
const HEADINGS: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'What needs you today, across Jira and GitHub.' },
  '/stats': { title: 'Statistics', subtitle: 'Six months of delivery, review and meeting load.' },
  '/jira': { title: 'Jira', subtitle: 'Every ticket assigned to me, grouped by status.' },
  '/prs': { title: 'Pull requests', subtitle: 'My open PRs, their review state and QC standing.' },
  '/calendar': { title: 'Calendar', subtitle: "Today's events and the upcoming watch-list." },
  '/settings': { title: 'Settings', subtitle: 'Palette, and what this dashboard is allowed to do.' },
};

export const AppShell = ({ generatedAt, children }: AppShellProps) => {
  const { pathname } = useLocation();
  const { running } = useRefresh();
  const heading = HEADINGS[pathname] ?? HEADINGS['/'];

  return (
    <div className="shell">
      <SideNav generatedAt={generatedAt} running={running} />
      <div className="shell-main">
        <TopBar title={heading.title} subtitle={heading.subtitle} />
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
};
