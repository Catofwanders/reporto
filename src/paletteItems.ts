import type { JiraReport, KitEntry, PrsReport } from './types';
import type { ReportKind } from './reportKinds';
import { KIND_META, REPORT_KINDS } from './reportKinds';
import { formatStatus } from './jiraStatus';
import { PR_STATE_LABEL, prState } from './prState';

/**
 * Everything the palette can offer, as data. The action a row performs is decided by its
 * kind at selection time, so this module stays free of the router, the refresh context and
 * the clipboard — which is what makes the matching worth testing on its own.
 */
export type PaletteAction =
  | { kind: 'goto'; to: string }
  | { kind: 'refresh'; report: ReportKind }
  | { kind: 'copy'; text: string }
  | { kind: 'external'; url: string };

export interface PaletteItem {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  /** Extra words worth matching that are not in the title. */
  keywords?: string;
  action: PaletteAction;
}

const PAGES: PaletteItem[] = [
  { id: 'page:/', group: 'Pages', title: 'Dashboard', action: { kind: 'goto', to: '/' } },
  { id: 'page:/jira', group: 'Pages', title: 'Jira board', keywords: 'tickets', action: { kind: 'goto', to: '/jira' } },
  { id: 'page:/prs', group: 'Pages', title: 'Pull requests', keywords: 'prs github', action: { kind: 'goto', to: '/prs' } },
  { id: 'page:/calendar', group: 'Pages', title: 'Calendar', keywords: 'meetings', action: { kind: 'goto', to: '/calendar' } },
  { id: 'page:/stats', group: 'Pages', title: 'Statistics', keywords: 'metrics charts', action: { kind: 'goto', to: '/stats' } },
  { id: 'page:/commands', group: 'Pages', title: 'Commands and skills', keywords: 'kit slash', action: { kind: 'goto', to: '/commands' } },
  { id: 'page:/settings', group: 'Pages', title: 'Settings', keywords: 'palette theme', action: { kind: 'goto', to: '/settings' } },
];

/**
 * A ticket or PR resolves to the page that already shows it, with the key in the hash — the
 * dashboard should be able to answer without opening Jira in another tab. The external link
 * stays available as its own row.
 */
export function buildItems(
  jira: JiraReport | null,
  prs: PrsReport | null,
  kit: KitEntry[],
): PaletteItem[] {
  const items: PaletteItem[] = [...PAGES];

  for (const kind of REPORT_KINDS) {
    items.push({
      id: `refresh:${kind}`,
      group: 'Update',
      title: `Update ${KIND_META[kind].label}`,
      subtitle: 'fetch it again now',
      keywords: 'refresh pull reload',
      action: { kind: 'refresh', report: kind },
    });
  }

  for (const group of jira?.groups ?? []) {
    for (const ticket of group.tickets) {
      items.push({
        id: `ticket:${ticket.key}`,
        group: 'Tickets',
        title: `${ticket.key} — ${ticket.summary}`,
        subtitle: formatStatus(ticket.status),
        action: { kind: 'goto', to: `/jira#${ticket.key}` },
      });
    }
  }

  for (const group of prs?.repos ?? []) {
    for (const pr of group.prs) {
      items.push({
        id: `pr:${group.repo}#${pr.num}`,
        group: 'Pull requests',
        title: `#${pr.num} — ${pr.title}`,
        subtitle: `${group.repo} · ${pr.draft ? 'draft' : PR_STATE_LABEL[prState(pr)]}`,
        keywords: `${group.repo} ${pr.ticket ?? ''}`,
        action: { kind: 'goto', to: `/prs#${group.repo}-${pr.num}` },
      });
    }
  }

  for (const entry of kit) {
    items.push({
      id: `kit:${entry.kind}:${entry.name}`,
      group: entry.kind === 'command' ? 'Commands' : 'Skills',
      title: entry.kind === 'command' ? `/${entry.name}` : entry.name,
      // Copying is the honest action: a slash command runs in a Claude session, not here.
      subtitle: entry.description ? `copy · ${entry.description}` : 'copy the invocation',
      keywords: entry.plugin ?? '',
      action: { kind: 'copy', text: `/${entry.name}` },
    });
  }

  return items;
}

/**
 * Scored match, best first. A subsequence is enough to appear — so a bare number finds the
 * ticket that carries it, and an abbreviation finds a long repo name — but a contiguous hit,
 * and one at a word boundary, ranks above a scattered one, which keeps the obvious answer on
 * top.
 */
export function scoreItem(item: PaletteItem, query: string): number {
  if (!query) return 0;
  const needle = query.toLowerCase().replace(/\s+/g, '');
  const haystacks = [item.title, item.subtitle ?? '', item.keywords ?? ''];

  let best = -1;
  haystacks.forEach((text, depth) => {
    const hay = text.toLowerCase();
    const contiguous = hay.indexOf(needle);
    if (contiguous !== -1) {
      // Earlier is better, a word start better still, and the title beats the metadata.
      const boundary = contiguous === 0 || /[\s\-/#:·]/.test(hay[contiguous - 1] ?? '');
      const score = 1000 - contiguous - depth * 50 + (boundary ? 200 : 0);
      best = Math.max(best, score);
      return;
    }
    // Fall back to a subsequence, scored by how tightly the letters sit together — and
    // capped, because a ten-letter query can be spelled out of almost any long description
    // if the letters are allowed to be arbitrarily far apart.
    let at = -1;
    let gaps = 0;
    for (const char of needle) {
      const next = hay.indexOf(char, at + 1);
      if (next === -1) return;
      if (at !== -1) gaps += next - at - 1;
      at = next;
    }
    if (gaps > needle.length * 3) return;
    best = Math.max(best, 300 - gaps - depth * 50);
  });

  return best;
}

export const matchItems = (items: PaletteItem[], query: string, limit = 40): PaletteItem[] => {
  if (!query.trim()) {
    // Nothing typed yet: offer the things that are always useful rather than an empty box.
    return items.filter((item) => item.group === 'Pages' || item.group === 'Update').slice(0, limit);
  }
  return items
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
};
