/**
 * Whether a freshly read report should replace the one on screen.
 *
 * The Jira pull runs in two passes: a fast search that draws the board, then twenty seconds of
 * PR matching and changelog reads. The fast pass writes a report marked `partial`, which is the
 * right thing to show when there is nothing on screen yet — and the wrong thing when a complete
 * board of the same day already is. Applying it there replaces real PR chips and ages with
 * skeletons, so pressing update *removes* information for twenty seconds and leaves the page in
 * a loading state it was never in before.
 *
 * So a partial report yields to a complete one for the same date. Different date means the
 * complete one is yesterday's, and today's board — gaps and all — is the better answer.
 *
 * There is no store in this app and nothing like RTK Query's `keepPreviousData` to lean on;
 * this predicate is that idea, in the one place reports are assigned.
 */
export interface Partialable {
  date: string;
  partial?: boolean;
}

export const shouldReplace = (prev: Partialable | null, next: Partialable): boolean => {
  if (!next.partial) return true;
  if (!prev || prev.partial) return true;
  return prev.date !== next.date;
};
