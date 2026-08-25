import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrendCard } from '../components/TrendCard';
import { DELIVERY_METRICS, PR_METRICS, chronological } from '../statsMetrics';
import { statsReport } from './fixtures';

const months = chronological(statsReport);

const meta = {
  title: 'Charts/TrendCard',
  component: TrendCard,
  args: {
    title: 'Delivery',
    subtitle: 'Tickets through the workflow, by month',
    metrics: DELIVERY_METRICS,
    months,
  },
} satisfies Meta<typeof TrendCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Delivery: Story = {};

/** Hours are formatted as days past 48h, so the axis and the tooltip agree. */
export const PullRequests: Story = { args: { title: 'Pull requests', metrics: PR_METRICS } };

/** A month whose source failed is a gap in the line, never a zero. */
export const WithGap: Story = {
  args: {
    months: months.map((month, i) => (i === 3 ? { ...month, jira: null, cycle: null } : month)),
  },
};
