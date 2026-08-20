import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarReportView } from '../components/CalendarReportView';
import { calendarReport } from './fixtures';

const meta = {
  title: 'Reports/CalendarReportView',
  component: CalendarReportView,
  args: { report: calendarReport },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CalendarReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A clear day: no events today, only the watch-list ahead. */
export const NothingToday: Story = {
  args: { report: { ...calendarReport, events: [], summary: 'No meetings today.' } },
};

/**
 * All-day entries carry no start, so they render as "all day" rather than a time — the
 * case where a bare "11:00" string used to surface as Invalid Date.
 */
export const AllDayOnly: Story = {
  args: {
    report: {
      ...calendarReport,
      events: calendarReport.events.filter((e) => e.kind === 'all-day'),
      upcoming: [],
    },
  },
};
