export type ReportKind = 'jira' | 'calendar' | 'prs';

export const REPORT_KINDS: ReportKind[] = ['calendar', 'jira', 'prs'];

export const KIND_META: Record<ReportKind, { label: string; icon: string }> = {
  calendar: { label: 'Calendar', icon: '📅' },
  jira: { label: 'Jira', icon: '🎫' },
  prs: { label: 'PRs', icon: '🔀' },
};
