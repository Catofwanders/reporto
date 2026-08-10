export type ReportKind = 'email' | 'jira' | 'calendar' | 'prs';

export const REPORT_KINDS: ReportKind[] = ['email', 'calendar', 'jira', 'prs'];

export const KIND_META: Record<ReportKind, { label: string; icon: string }> = {
  email: { label: 'Mail', icon: '📬' },
  calendar: { label: 'Calendar', icon: '📅' },
  jira: { label: 'Jira', icon: '🎫' },
  prs: { label: 'PRs', icon: '🔀' },
};
