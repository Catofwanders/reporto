/**
 * Slack rows you have decided need nothing.
 *
 * The classifier gets most of them — a "thanks" or an emoji leaves the queue on its own — but
 * it cannot read intent that is not in the words, and a queue with no way to say "this one is
 * finished" makes you answer it in Slack purely to make the row go away.
 *
 * Local, in `localStorage`, next to the palette, the activity read mark and the snoozes:
 * Slack has no per-message "handled" flag to write to, and inventing one by posting a reaction
 * would be sending a message on somebody's behalf to fix a display problem.
 *
 * Dismissals are kept by date and expire, because a report only holds a fortnight anyway and
 * a permanent set would grow for the life of the browser profile.
 */
export type Dismissals = Record<string, string>;

const KEY = 'reporto.slackDone';

/** Matches the report-retention window: past this, the row it describes is gone anyway. */
const KEEP_DAYS = 30;

/** Local calendar dates. `toISOString().slice(0, 10)` is yesterday at a positive offset. */
const localDate = (at: Date) => at.toLocaleDateString('en-CA');

export function activeDismissals(marks: Dismissals, now = new Date()): Dismissals {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const oldest = localDate(cutoff);
  return Object.fromEntries(Object.entries(marks).filter(([, at]) => at >= oldest));
}

export const isDone = (id: string, marks: Dismissals): boolean => Boolean(marks[id]);

export const markDone = (id: string, marks: Dismissals, now = new Date()): Dismissals => ({
  ...activeDismissals(marks, now),
  [id]: localDate(now),
});

export const undoDone = (id: string, marks: Dismissals, now = new Date()): Dismissals => {
  const next = activeDismissals(marks, now);
  delete next[id];
  return next;
};

export function readDone(now = new Date()): Dismissals {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    return activeDismissals(Object.fromEntries(entries), now);
  } catch {
    // Private browsing, blocked storage, or a half-written value: nothing is dismissed.
    return {};
  }
}

export function writeDone(marks: Dismissals): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(marks));
  } catch {
    /* the dismissal just does not persist */
  }
}
