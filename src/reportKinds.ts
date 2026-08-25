export type ReportKind = 'jira' | 'calendar' | 'prs' | 'stats';

export const REPORT_KINDS: ReportKind[] = ['calendar', 'jira', 'prs', 'stats'];

export const KIND_META: Record<ReportKind, { label: string; icon: string }> = {
  calendar: { label: 'Calendar', icon: '📅' },
  jira: { label: 'Jira', icon: '🎫' },
  prs: { label: 'PRs', icon: '🔀' },
  stats: { label: 'Stats', icon: '📈' },
};
