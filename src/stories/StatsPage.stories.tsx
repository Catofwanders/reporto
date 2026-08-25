import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatsPage } from '../pages/StatsPage';
import { statsReport } from './fixtures';

const meta = {
  title: 'Pages/Stats',
  component: StatsPage,
  args: { report: statsReport },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StatsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Before the first pull: the page says how to get data rather than showing zeroes. */
export const NoReport: Story = { args: { report: null } };

/** One month whose sources all failed — the bars must show a gap, not a zero. */
export const WithGaps: Story = {
  args: {
    report: {
      ...statsReport,
      months: statsReport.months.map((month, i) =>
        i === 1 ? { ...month, jira: null, cycle: null, missing: ['jira: token expired'] } : month,
      ),
      notes: ['2026-04 — jira: token expired'],
    },
  },
};
