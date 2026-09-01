import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomePage } from '../pages/HomePage';
import {
  calendarReport,
  freshJira,
  freshPrs,
  freshReviews,
  freshSlack,
  prsReport,
  reviewsReport,
} from './fixtures';

const meta = {
  title: 'Pages/Home',
  component: HomePage,
  args: {
    jira: freshJira(),
    reviews: freshReviews(),
    slack: freshSlack(),
    calendar: calendarReport,
    prs: freshPrs(),
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
    slack: { ...freshSlack(), rows: [] },
  },
};

/**
 * A quiet morning: nothing in the PR, review or Slack reports. The board contributes no rows —
 * a stuck ticket is a count in the strip and an age pill on the board, not a queue row — so
 * what this shows is the empty-queue wording next to a full unread-activity panel.
 */
export const QuietQueue: Story = {
  args: {
    prs: { ...prsReport, repos: [] },
    reviews: { ...reviewsReport, prs: [] },
    slack: { ...freshSlack(), rows: [] },
  },
};

/** A fresh checkout, before any report has been written. */
export const NoReports: Story = {
  args: { jira: null, calendar: null, prs: null, reviews: null, slack: null },
};
