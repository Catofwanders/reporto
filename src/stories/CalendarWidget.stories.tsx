import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarWidget } from '../components/CalendarWidget';
import { calendarReport } from './fixtures';

const meta = {
  title: 'Widgets/CalendarWidget',
  component: CalendarWidget,
  args: { report: calendarReport },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '21rem' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today's events, then the watch-list under WATCH. */
export const Default: Story = {};

export const NothingToday: Story = {
  args: { report: { ...calendarReport, events: [] } },
};

export const TodayOnly: Story = {
  args: { report: { ...calendarReport, upcoming: [] } },
};
