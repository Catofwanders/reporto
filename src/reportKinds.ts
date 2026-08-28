export type ReportKind = 'jira' | 'calendar' | 'prs' | 'reviews' | 'slack' | 'stats';

export const REPORT_KINDS: ReportKind[] = ['calendar', 'jira', 'prs', 'reviews', 'slack', 'stats'];

/**
 * Everything the app needs to know about a report kind, in one place.
 *
 * This used to be a label and an icon, with the route, the nav row, the page heading, the ⌘K
 * entry and the freshness rule each maintained separately — five hand-kept tables where a new
 * kind cost ten edits across nine files and only three of them were type-enforced. A missed
 * nav row or freshness entry compiled cleanly and simply never appeared, or never refreshed.
 *
 * `Record<ReportKind, …>` is the enforcement: adding a kind to the union above does not
 * compile until it is described here, and the four consumers derive from it.
 */
export interface KindMeta {
  /** Short name, used on nav rows, update buttons and in what the announcer says. */
  label: string;
  icon: string;
  /** The route that shows this report. */
  route: string;
  /** The page's own heading and one-line summary. */
  title: string;
  subtitle: string;
  /** What ⌘K calls this page, and extra words worth matching. */
  paletteTitle: string;
  keywords?: string;
  /**
   * Other reports this route reads, so a stale one is refetched when the page is looked at —
   * the review queue reads ticket status for its rows, for instance.
   */
  alsoReads?: ReportKind[];
}

export const KIND_META: Record<ReportKind, KindMeta> = {
  calendar: {
    label: 'Calendar',
    icon: '📅',
    route: '/calendar',
    title: 'Calendar',
    subtitle: "Today's events and the upcoming watch-list.",
    paletteTitle: 'Calendar',
    keywords: 'meetings',
  },
  jira: {
    label: 'Jira',
    icon: '🎫',
    route: '/jira',
    title: 'Jira',
    subtitle: 'Every ticket assigned to me, grouped by status.',
    paletteTitle: 'Jira board',
    keywords: 'tickets',
  },
  prs: {
    label: 'PRs',
    icon: '🔀',
    route: '/prs',
    title: 'Pull requests',
    subtitle: 'My open PRs, their review state and QC standing.',
    paletteTitle: 'Pull requests',
    keywords: 'prs github',
  },
  reviews: {
    label: 'Reviews',
    icon: '👀',
    route: '/reviews',
    title: 'Reviews',
    subtitle: 'PRs waiting on your review, and the ones that moved since you looked.',
    paletteTitle: 'Review queue',
    keywords: 'reviews waiting',
    alsoReads: ['jira'],
  },
  slack: {
    label: 'Slack',
    icon: '💬',
    route: '/slack',
    title: 'Slack',
    subtitle: 'Who named you, and whether the last word is still theirs.',
    paletteTitle: 'Slack mentions',
    keywords: 'messages threads',
  },
  stats: {
    label: 'Stats',
    icon: '📈',
    route: '/stats',
    title: 'Statistics',
    subtitle: 'Six months of delivery, review and meeting load.',
    paletteTitle: 'Statistics',
    keywords: 'metrics charts',
  },
};

/** The kind a route shows, when it shows one. */
export const kindOfRoute = (path: string): ReportKind | undefined =>
  REPORT_KINDS.find((kind) => path === KIND_META[kind].route || path.startsWith(`${KIND_META[kind].route}/`));
