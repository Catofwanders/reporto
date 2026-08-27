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

/**
 * Slack too: the fixture is dated with everything else, so without this the mention queue
 * reads "117d" and the screenshot looks like a dashboard nobody has opened since spring.
 */
const freshSlack = {
  ...slackReport,
  rows: slackReport.rows.map((row, i) => ({
    ...row,
    at: minutesAgo(90 + i * 240),
    lastAt: minutesAgo(90 + i * 240),
  })),
};

const meta = {
  title: 'Pages/Home',
  component: HomePage,
  args: {
    jira: jiraReport,
    reviews: freshReviews,
    slack: freshSlack,
    calendar: calendarReport,
    prs: freshPrs,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The dashboard on invented data — safe to screenshot and share. */
export const Default: Story = {};

/** A quiet morning: nothing waiting, no conflicts. The strip still holds its shape. */
export const NothingWaiting: Story = {
  args: {
    prs: { ...prsReport, repos: [] },
    reviews: { ...reviewsReport, prs: [] },
    slack: { ...freshSlack, rows: [] },
  },
};

/** A fresh checkout, before any report has been written. */
export const NoReports: Story = {
  args: { jira: null, calendar: null, prs: null, reviews: null, slack: null },
};
