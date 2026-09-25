import type { Dismissals } from './dismissals';
import { activeMarks, addMark, dropMark, isMarked, readMarks, writeMarks } from './dismissals';

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
 * The store and its expiry live in `dismissals.ts`, shared with the ignored reviews.
 */
export type { Dismissals };

const KEY = 'reporto.slackDone';

export const activeDismissals = activeMarks;
export const isDone = isMarked;
export const markDone = addMark;
export const undoDone = dropMark;

export const readDone = (now = new Date()): Dismissals => readMarks(KEY, now);
export const writeDone = (marks: Dismissals): void => writeMarks(KEY, marks);
