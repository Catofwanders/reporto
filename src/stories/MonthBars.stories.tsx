import type { Meta, StoryObj } from '@storybook/react-vite';
import { MonthBars } from '../components/MonthBars';
import { DELIVERY_METRICS, chronological } from '../statsMetrics';
import { statsReport } from './fixtures';

const months = chronological(statsReport);

const meta = {
  title: 'Charts/MonthBars',
  component: MonthBars,
  args: { metric: DELIVERY_METRICS[0], months },
  decorators: [(Story) => <div style={{ maxWidth: '15rem' }}>{Story()}</div>],
} satisfies Meta<typeof MonthBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Deployed: Story = {};

/** Lower is better here, so a falling column is good news. */
export const CycleTime: Story = { args: { metric: DELIVERY_METRICS[3] } };

/** A metric that is zero all year still has to look like zero, not like missing data. */
export const AllZero: Story = {
  args: {
    metric: DELIVERY_METRICS[2],
    months: months.map((month) => ({
      ...month,
      jira: month.jira ? { ...month.jira, qcFailed: 0 } : null,
    })),
  },
};

/** A gap in the middle: no value must not read as zero. */
export const MissingMonth: Story = {
  args: {
    months: months.map((month, i) => (i === 2 ? { ...month, jira: null } : month)),
  },
};
