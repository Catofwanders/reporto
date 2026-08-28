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
 * A quiet queue with one stuck ticket, which is the only way to see the Unstick group: it
 * carries the lowest weight in the feed, so on a busy morning it is the first thing cut. The
 * row offers to open the ticket in place — the drawer the board and the list already use.
 */
export const TicketStuck: Story = {
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
