import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewsPage } from '../pages/ReviewsPage';
import type { ReviewPr, ReviewsReport } from '../types';
import { jiraReport } from './fixtures';

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const pr = (over: Partial<ReviewPr> & Pick<ReviewPr, 'num' | 'title'>): ReviewPr => ({
  repo: 'billing-api',
  url: `https://example.com/${over.num}`,
  author: 'colleague',
  bot: false,
  draft: false,
  ticket: null,
  createdAt: days(3),
  updatedAt: days(1),
  lastCommitAt: days(1),
  reviewRequested: true,
  reviewDecision: null,
  myReviewState: null,
  myReviewAt: null,
  myReviewCount: 0,
  pushedSinceMyReview: false,
  unresolvedThreads: 0,
  myUnresolvedThreads: 0,
  size: { additions: 40, deletions: 8, files: 3 },
  ...over,
});

/** One PR per lane, so every reason line and every size tone shows at once. */
const report: ReviewsReport = {
  type: 'reviews',
  date: '2026-05-14',
  generatedAt: days(0),
  reviewer: 'me',
  prs: [
    pr({
      num: 11,
      title: 'You approved this, then they pushed twice',
      myReviewState: 'APPROVED',
      myReviewAt: days(4),
      lastCommitAt: days(1),
      pushedSinceMyReview: true,
      size: { additions: 910, deletions: 155, files: 27 },
    }),
    pr({ num: 12, title: 'Nobody has looked at this yet', createdAt: days(6), lastCommitAt: days(6) }),
    pr({
      num: 13,
      title: 'Your two threads are still open',
      myReviewState: 'CHANGES_REQUESTED',
      myReviewAt: days(2),
      unresolvedThreads: 3,
      myUnresolvedThreads: 2,
      size: { additions: 210, deletions: 40, files: 7 },
    }),
    pr({
      num: 14,
      title: 'Approved and cleared, waiting on merge',
      myReviewState: 'APPROVED',
      myReviewAt: days(1),
      reviewDecision: 'APPROVED',
    }),
    pr({
      num: 15,
      title: 'Reviewed, nothing has happened since',
      myReviewState: 'COMMENTED',
      myReviewAt: days(3),
    }),
    pr({ num: 16, title: 'Bump a dependency', author: 'dependabot', bot: true }),
  ],
};

const meta = {
  title: 'Pages/Reviews',
  component: ReviewsPage,
  args: { report, jira: jiraReport },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReviewsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryLane: Story = {};

/** A PR opened years ago whose branch never moved is stale, not urgent — and says so. */
export const AbandonedPr: Story = {
  args: {
    report: {
      ...report,
      prs: [pr({ num: 20, title: 'Opened in another era', createdAt: days(700), lastCommitAt: days(700) })],
    },
  },
};

export const NothingWaiting: Story = { args: { report: { ...report, prs: [] } } };

/** Before the first pull: the page says which control fetches it. */
export const NoReport: Story = { args: { report: null } };
