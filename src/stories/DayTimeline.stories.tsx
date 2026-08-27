import type { Meta, StoryObj } from '@storybook/react-vite';
import { DayTimeline } from '../components/DayTimeline';
import type { CalendarEvent, CalendarReport } from '../types';
import { calendarReport } from './fixtures';

/**
 * The timeline positions events by their time of day, and marks *now* against the same scale.
 * Fixture events are pinned to one date, which is fine for position, but "in 2h 10m" under the
 * line is measured against the real clock — so these are stamped onto today at fixed times to
 * keep both halves of the card honest.
 */
const today = (hhmm: string) => {
  const [hour, minute] = hhmm.split(':').map(Number);
  const at = new Date();
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
};

const event = (title: string, hhmm: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  source: 'outlook',
  calendar: 'Work',
  title,
  kind: 'meeting',
  start: today(hhmm),
  end: today(hhmm),
  url: 'https://example.com/event',
  note: undefined,
  ...over,
});

const report = (events: CalendarEvent[], upcoming = calendarReport.upcoming): CalendarReport => ({
  ...calendarReport,
  events,
  upcoming,
});

const meta = {
  title: 'Panels/DayTimeline',
  component: DayTimeline,
  args: {
    report: report([
      event('Daily stand-up', '09:30'),
      event('Checkout kick-off', '13:00', { kind: 'kickoff' }),
      event('Seller demo', '16:15'),
      calendarReport.events[2],
    ]),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DayTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A normal day: three meetings on the line, one all-day chip under it. */
export const Default: Story = {};

/**
 * Four meetings inside seventy minutes — the case that broke the first version, where pills
 * only alternated sides and so the first and third printed over each other. Each pill now goes
 * on the first row with room for it, measured, so a cluster stacks instead of colliding.
 */
export const Crowded: Story = {
  args: {
    report: report([
      event('Stand-up', '10:00'),
      event('Handover', '10:20'),
      event('Design review', '10:45'),
      event('1:1', '11:10'),
    ]),
  },
};

/** Something outside the 08–18 window: the scale stretches instead of clipping the pill. */
export const EarlyAndLate: Story = {
  args: { report: report([event('Deploy window', '06:30'), event('On-call handover', '21:00')]) },
};

/** No meetings, only time off. The line is gone, and the next-up line says so plainly. */
export const NoMeetings: Story = {
  args: { report: report([calendarReport.events[2]], []) },
};

/** A clear day with nothing ahead either — no line, no chips, no "N ahead" link. */
export const Empty: Story = { args: { report: report([], []) } };
