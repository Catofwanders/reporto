import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActionBar } from '../components/ActionBar';

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const meta = {
  title: 'Shell/ActionBar',
  component: ActionBar,
  args: {
    generatedAt: {
      calendar: minutesAgo(12),
      jira: minutesAgo(90),
      prs: minutesAgo(0),
    },
  },
} satisfies Meta<typeof ActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A fresh checkout: no report has ever been written, so every stamp reads "never". */
export const NoData: Story = { args: { generatedAt: {} } };

/** Stamps older than a day switch from "Nh ago" to a date. */
export const Stale: Story = {
  args: {
    generatedAt: {
      calendar: minutesAgo(60 * 26),
      jira: minutesAgo(60 * 24 * 9),
      prs: minutesAgo(45),
    },
  },
};
