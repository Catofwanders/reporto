/**
 * "Not today" for a dashboard row.
 *
 * The queue has no triage. A row you have looked at, decided about and cannot act on yet —
 * a PR waiting on somebody's holiday, a ticket blocked on a contract — keeps shouting every
 * morning until the underlying state changes, and the honest response of ignoring it teaches
 * you to ignore the whole panel. Snoozing is the small amount of state that fixes that.
 *
 * Deliberately weak: a snooze lasts until tomorrow, never longer. It hides a row for one
 * morning rather than letting me bury something for a week, and nothing about it is ever
 * hidden — the panel says how many are snoozed and can show them.
 */

/** Row id → the local date it wakes on, `YYYY-MM-DD`. */
export type Snoozes = Record<string, string>;

const KEY = 'reporto.snoozed';

/**
 * Local calendar dates, never `toISOString().slice(0, 10)`. At a positive UTC offset the ISO
 * form of local midnight is yesterday, which would wake every snooze the moment it was set.
 */
const localDate = (at: Date) => at.toLocaleDateString('en-CA');

const tomorrow = (now: Date) => {
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  return localDate(at);
};

/** Snoozes still in force, with the woken ones dropped so the store cannot grow forever. */
export function activeSnoozes(snoozes: Snoozes, now = new Date()): Snoozes {
  const today = localDate(now);
  return Object.fromEntries(Object.entries(snoozes).filter(([, wakes]) => wakes > today));
}

export const isSnoozed = (id: string, snoozes: Snoozes, now = new Date()): boolean =>
  (snoozes[id] ?? '') > localDate(now);

export const snooze = (id: string, snoozes: Snoozes, now = new Date()): Snoozes => ({
  ...activeSnoozes(snoozes, now),
  [id]: tomorrow(now),
});

export const wake = (id: string, snoozes: Snoozes, now = new Date()): Snoozes => {
  const next = activeSnoozes(snoozes, now);
  delete next[id];
  return next;
};

export function readSnoozes(now = new Date()): Snoozes {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    return activeSnoozes(Object.fromEntries(entries), now);
  } catch {
    // Private browsing, blocked storage, or a half-written value: nothing is snoozed.
    return {};
  }
}

export function writeSnoozes(snoozes: Snoozes): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snoozes));
  } catch {
    /* the snooze just does not persist */
  }
}
