/**
 * Dated marks in `localStorage` — the shape both "nothing to answer here" and "not reviewing
 * this" need, and which they had a copy of each.
 *
 * A mark is the day it was made, and it expires: a report only holds a few weeks of history,
 * so a permanent set would keep growing for the life of the browser profile and go on hiding
 * rows whose subject is long gone.
 *
 * Dates are **local calendar dates**. `toISOString().slice(0, 10)` is tomorrow's date for
 * anything marked late in the evening at a positive offset, which expires the mark a day early.
 */
export type Dismissals = Record<string, string>;

/** Matches the report-retention window: past this, whatever the mark describes is gone anyway. */
export const KEEP_DAYS = 30;

export const localDate = (at: Date) => at.toLocaleDateString('en-CA');

export function activeMarks(marks: Dismissals, now = new Date(), keepDays = KEEP_DAYS): Dismissals {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const oldest = localDate(cutoff);
  return Object.fromEntries(Object.entries(marks).filter(([, at]) => at >= oldest));
}

export const isMarked = (id: string, marks: Dismissals): boolean => Boolean(marks[id]);

export const addMark = (id: string, marks: Dismissals, now = new Date()): Dismissals => ({
  ...activeMarks(marks, now),
  [id]: localDate(now),
});

export const dropMark = (id: string, marks: Dismissals, now = new Date()): Dismissals => {
  const next = activeMarks(marks, now);
  delete next[id];
  return next;
};

export function readMarks(key: string, now = new Date()): Dismissals {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    return activeMarks(Object.fromEntries(entries), now);
  } catch {
    // Private browsing, blocked storage, or a half-written value: nothing is marked.
    return {};
  }
}

export function writeMarks(key: string, marks: Dismissals): void {
  try {
    localStorage.setItem(key, JSON.stringify(marks));
  } catch {
    /* the mark just does not persist */
  }
}
