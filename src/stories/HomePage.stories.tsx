import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomePage } from '../pages/HomePage';
import {
  calendarReport,
  freshPrs,
  freshReviews,
  freshSlack,
  jiraReport,
  prsReport,
  reviewsReport,
} from './fixtures';

const meta = {
  title: 'Pages/Home',
  component: HomePage,
  args: {
    jira: jiraReport,
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

/** A fresh checkout, before any report has been written. */
export const NoReports: Story = {
  args: { jira: null, calendar: null, prs: null, reviews: null, slack: null },
};
