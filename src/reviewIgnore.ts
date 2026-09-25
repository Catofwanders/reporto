import type { Dismissals } from './dismissals';
import { KEEP_DAYS, activeMarks, addMark, dropMark, isMarked, readMarks, writeMarks } from './dismissals';
import type { ReviewsReport } from './types';

/**
 * Reviews you have decided are not yours.
 *
 * GitHub keeps a review request until somebody submits a review, so a PR opened against a repo
 * you no longer touch, a spike nobody intends to merge, or a colleague's abandoned branch sits
 * in the queue forever and there is nothing to press to make it go. Approving it to clear the
 * row would be a verdict on work you have not read.
 *
 * The mark is by PR url and expires with everything else in `dismissals.ts` — a month, the same
 * window the reports hold. So an ignore is "not this month", not "never": a PR still open and
 * still requested after that comes back rather than disappearing from the queue for good.
 */
export type { Dismissals };

export { KEEP_DAYS };

const KEY = 'reporto.reviewIgnore';

export const activeIgnores = activeMarks;
export const isIgnored = isMarked;
export const ignoreReview = addMark;
export const unignoreReview = dropMark;

export const readIgnored = (now = new Date()): Dismissals => readMarks(KEY, now);
export const writeIgnored = (marks: Dismissals): void => writeMarks(KEY, marks);

/**
 * The report with the ignored PRs taken out, and the ones taken out.
 *
 * Both halves, because every count on the page is derived from the report: handing the views a
 * filtered one keeps the lanes, the bar and the queue agreeing, and returning what was dropped
 * is what lets the page say how many rather than hide the fact.
 */
export const splitIgnored = (
  report: ReviewsReport,
  marks: Dismissals,
): { kept: ReviewsReport; ignored: ReviewsReport['prs'] } => {
  const ignored = report.prs.filter((pr) => isIgnored(pr.url, marks));
  if (ignored.length === 0) return { kept: report, ignored };
  return { kept: { ...report, prs: report.prs.filter((pr) => !isIgnored(pr.url, marks)) }, ignored };
};
