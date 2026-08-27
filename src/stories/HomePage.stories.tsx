import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomePage } from '../pages/HomePage';
import { calendarReport, jiraReport, prsReport, reviewsReport, slackReport } from './fixtures';

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

/**
 * Fixture dates are fixed so stories stay deterministic, which makes every PR read as
 * months idle. For the dashboard shot specifically, restamp them so the rows say "today".
 */
const freshPrs = {
  ...prsReport,
  repos: prsReport.repos.map((group) => ({
    ...group,
    prs: group.prs.map((pr, i) => ({ ...pr, updatedAt: minutesAgo(45 + i * 90) })),
  })),
};

/** Same for the review queue: an age pill reading "104d" is the fixture's date, not a fact. */
const freshReviews = {
  ...reviewsReport,
  prs: reviewsReport.prs.map((pr, i) => ({
    ...pr,
    updatedAt: minutesAgo(60 + i * 120),
    lastCommitAt: minutesAgo(60 + i * 120),
    createdAt: minutesAgo(60 * 24 * (2 + i)),
    myReviewAt: pr.myReviewAt ? minutesAgo(60 * 24 * (3 + i)) : null,
  })),
};

const meta = {
  title: 'Pages/Home',
  component: HomePage,
  args: {
    jira: jiraReport,
    reviews: freshReviews,
    slack: slackReport,
    calendar: calendarReport,
    prs: freshPrs,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The dashboard on invented data — safe to screenshot and share. */
export const Default: Story = {};

/** A fresh checkout, before any report has been written. */
export const NoReports: Story = {
  args: { jira: null, calendar: null, prs: null, reviews: null, slack: null },
};
