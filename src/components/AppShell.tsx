import { useLocation } from 'react-router-dom';
import type { JiraReport, PrsReport } from '../types';
import { KIND_META, REPORT_KINDS, type ReportKind } from '../reportKinds';
import { useRefresh } from '../refreshContext';
import { CommandPalette } from './CommandPalette';
import { SideNav } from './SideNav';
import { LiveRefresh } from './LiveRefresh';
import { RefreshAnnouncer } from './RefreshAnnouncer';
import { TopBar } from './TopBar';

interface AppShellProps {
  generatedAt: Partial<Record<ReportKind, string | undefined>>;
  /** Re-read the report files — passed through to `LiveRefresh`, which owns "attention". */
  onWake: () => void;
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
/**
 * Heading per route, so the top bar says where you are without a breadcrumb trail, plus the
 * report that page is about: the top-bar button updates what you are looking at.
 *
 * The report routes come from `KIND_META` rather than being restated here — that table is what
 * makes a new kind appear everywhere at once. Only the pages that own no report are listed.
 */
type Heading = { title: string; subtitle: string; kind?: ReportKind; action?: 'all' | 'none' }

const PAGE_HEADINGS: Record<string, Heading> = {
  '/': {
    title: 'Dashboard',
    subtitle: 'What needs you today, across Jira and GitHub.',
    action: 'all',
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
}

const HEADINGS: Record<string, Heading> = {
  ...PAGE_HEADINGS,
  ...Object.fromEntries(
    REPORT_KINDS.map((kind) => [
      KIND_META[kind].route,
      { title: KIND_META[kind].title, subtitle: KIND_META[kind].subtitle, kind },
    ]),
  ),
}

export const AppShell = ({ generatedAt, onWake, jira, prs, children }: AppShellProps) => {
  const { pathname } = useLocation();
  const { running } = useRefresh();
  // A project page is one of many, so it is titled from the path rather than the table.
  const heading = pathname.startsWith('/projects/')
    ? { title: 'Project', subtitle: 'What it is, what it talks to, and how work moves through it.', action: 'none' as const }
    : (HEADINGS[pathname] ?? HEADINGS['/']);

  return (
    <div className="shell">
      {/*
        * Straight to the content, past nine nav rows and six update buttons. Visible only when
        * it has focus, which is the one moment it is useful.
        */}
      <a className="shell-skip" href="#shell-content">
        Skip to content
      </a>
      <LiveRefresh generatedAt={generatedAt} onWake={onWake} />
      <CommandPalette jira={jira} prs={prs} />
      <SideNav generatedAt={generatedAt} running={running} />
      <RefreshAnnouncer />
      <div className="shell-main">
        <TopBar
          title={heading.title}
          subtitle={heading.subtitle}
          kind={heading.kind}
          action={heading.action}
        />
        <div className="shell-content" id="shell-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
};
