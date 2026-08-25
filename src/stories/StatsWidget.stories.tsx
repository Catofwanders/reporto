import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatsWidget } from '../components/StatsWidget';
import { statsReport } from './fixtures';

const meta = {
  title: 'Widgets/StatsWidget',
  component: StatsWidget,
  args: { report: statsReport },
  decorators: [(Story) => <div style={{ maxWidth: '21rem' }}>{Story()}</div>],
} satisfies Meta<typeof StatsWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A single month: no previous month, so no deltas rather than a fake "+0". */
export const FirstMonth: Story = {
  args: { report: { ...statsReport, months: statsReport.months.slice(0, 1) } },
};
