import type { JiraActivityItem } from './types';

/**
 * Which ticket comments count as already seen.
 *
 * Jira will not tell us. The bell's feed sits behind a gateway route that answers 404 to API
 * token auth, so there is no read flag to fetch and none to write back — this is a local mark,
 * kept in `localStorage` next to the palette and the auto-refresh switch.
 */
export interface ActivityMarks {
  /** Everything at or before this instant is read. Null means nothing has been marked yet. */
  seenAt: string | null;
  /** Individually dismissed ids, for the ones read out of order. */
  dismissed: string[];
}

/**
 * Fallback window, in days, for a report written before the puller started stating its own.
 *
 * The number that decides the fetch lives in config and is written into the report as
 * `activityDays`; this is only what an old file gets worded with. It used to be a mirrored
 * constant, which is a duplicate waiting to drift.
 */
export const ACTIVITY_WINDOW_DAYS = 14;

export const NO_MARKS: ActivityMarks = { seenAt: null, dismissed: [] };

const KEY = 'reporto.jiraSeen';

/**
 * Dismissals are only needed until `seenAt` passes them, so the list does not have to be
 * complete — and an unbounded one would grow for the life of the browser profile.
 */
const DISMISS_CAP = 200;

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((entry) => typeof entry === 'string');

/** A stored mark, or none. Anything unparseable is treated as none rather than thrown. */
export function readMarks(): ActivityMarks {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return NO_MARKS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NO_MARKS;
    const { seenAt, dismissed } = parsed as Record<string, unknown>;
    return {
      seenAt: typeof seenAt === 'string' ? seenAt : null,
      dismissed: isStrings(dismissed) ? dismissed : [],
    };
  } catch {
    // Private browsing, a blocked storage partition, or a half-written value.
    return NO_MARKS;
  }
}

export function writeMarks(marks: ActivityMarks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks));
  } catch {
    /* the mark just does not persist */
  }
}

export function isUnread(item: JiraActivityItem, marks: ActivityMarks): boolean {
  if (marks.dismissed.includes(item.id)) return false;
  if (!marks.seenAt) return true;
  const at = new Date(item.at).getTime();
  // An unparseable date must not silently read as seen: an unreadable timestamp is news.
  if (Number.isNaN(at)) return true;
  return at > new Date(marks.seenAt).getTime();
}

export const unreadItems = (
  items: JiraActivityItem[],
  marks: ActivityMarks,
): JiraActivityItem[] => items.filter((item) => isUnread(item, marks));

export const unreadCount = (items: JiraActivityItem[], marks: ActivityMarks): number =>
  unreadItems(items, marks).length;

/** How many of the unread ones tag me — the reason to look now rather than later. */
export const mentionCount = (items: JiraActivityItem[], marks: ActivityMarks): number =>
  unreadItems(items, marks).filter((item) => item.mentionsMe).length;

export const markRead = (id: string, marks: ActivityMarks): ActivityMarks => ({
  seenAt: marks.seenAt,
  dismissed: [...marks.dismissed.filter((entry) => entry !== id), id].slice(-DISMISS_CAP),
});

/**
 * Mark everything on screen as read.
 *
 * `seenAt` is the newest item's own timestamp, never `Date.now()`: a comment written an hour
 * ago that this pull has not fetched yet would otherwise arrive already read, and the whole
 * point of the subsection is that nothing arrives pre-dismissed.
 */
export function markAllRead(
  items: JiraActivityItem[],
  marks: ActivityMarks,
): ActivityMarks {
  const newest = items
    .map((item) => new Date(item.at).getTime())
    .filter((at) => !Number.isNaN(at))
    .reduce((most, at) => Math.max(most, at), -Infinity);
  if (newest === -Infinity) return marks;
  const seenAt = new Date(newest).toISOString();
  // Never move the mark backwards: a stale report must not un-read newer comments.
  if (marks.seenAt && new Date(marks.seenAt).getTime() >= newest) return marks;
  return { seenAt, dismissed: marks.dismissed };
}
