import type { Meta, StoryObj } from '@storybook/react-vite';
import { JiraActivity } from '../components/JiraActivity';
import { jiraReport, prsReport } from './fixtures';

const meta = {
  title: 'Panels/JiraActivity',
  component: JiraActivity,
  args: { report: jiraReport, prs: prsReport },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof JiraActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Three unread comments, one of them a mention, one with no text at all.
 *
 * Read state lives in `localStorage`, so pressing "Mark all read" here persists for the
 * browser Storybook is running in — the reload story is the empty state below.
 */
export const Default: Story = {};

/** Fetched, and there genuinely is nothing. The wording has to say which. */
export const Nothing: Story = {
  args: { report: { ...jiraReport, activity: [], activityNote: undefined } },
};

/**
 * Never fetched — an old report, or a pull that only got through its fast phase. The same
 * blank list as `Nothing`, and the opposite meaning.
 */
export const NotFetched: Story = {
  args: { report: { ...jiraReport, activity: undefined, activityNote: undefined } },
};

/** The fast phase said the comments are coming, so the panel must not claim there are none. */
export const Pending: Story = {
  args: {
    report: {
      ...jiraReport,
      activity: undefined,
      activityNote: undefined,
      partial: true,
      pending: ['activity'],
    },
  },
};

/** A scan that hit its cap, or tickets whose comments would not load, says so in the head. */
export const Truncated: Story = {
  args: {
    report: {
      ...jiraReport,
      activityNote: '3 tickets could not be read, 6 beyond the 40-ticket scan',
    },
  },
};
