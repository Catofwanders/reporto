export type ReportKind = 'jira' | 'calendar' | 'prs' | 'reviews' | 'slack' | 'stats';

export const REPORT_KINDS: ReportKind[] = ['calendar', 'jira', 'prs', 'reviews', 'slack', 'stats'];

export const KIND_META: Record<ReportKind, { label: string; icon: string }> = {
  calendar: { label: 'Calendar', icon: '📅' },
  jira: { label: 'Jira', icon: '🎫' },
  prs: { label: 'PRs', icon: '🔀' },
  reviews: { label: 'Reviews', icon: '👀' },
  slack: { label: 'Slack', icon: '💬' },
  stats: { label: 'Stats', icon: '📈' },
};
