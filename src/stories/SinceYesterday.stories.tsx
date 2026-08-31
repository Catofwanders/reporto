import type { Meta, StoryObj } from '@storybook/react-vite';
import { SinceYesterday } from '../components/SinceYesterday';
import type { SinceReport } from '../sinceYesterday';

const report: SinceReport = {
  date: '2026-05-13',
  changes: [
    {
      id: 'ticket:SHOP-2',
      source: 'ticket',
      label: 'SHOP-2',
      what: 'arrived in TO DO',
      to: '/jira#SHOP-2',
      tone: 'warn',
    },
    {
      id: 'ticket:SHOP-812',
      source: 'ticket',
      label: 'SHOP-812',
      what: 'IN PROGRESS → READY FOR QA',
      to: '/jira#SHOP-812',
      tone: 'na',
    },
    {
      id: 'pr:orders-api#74:review',
      source: 'pr',
      label: 'orders-api#74',
      what: 'now changes requested',
      to: '/prs#orders-api-74',
      tone: 'warn',
    },
    {
      id: 'pr:shop-web#512',
      source: 'pr',
      label: 'shop-web#512',
      what: 'merged or closed',
      to: '/prs',
      tone: 'ok',
    },
  ],
};

const meta = {
  title: 'Panels/SinceYesterday',
  component: SinceYesterday,
  args: { report },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SinceYesterday>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Folded, which is how the dashboard shows it: one line and a count. */
export const Folded: Story = {};

/** Open: arrivals first, then moves, then what left. */
export const Open: Story = { args: { open: true } };

/** A quiet weekend. Said plainly, because "nothing" is a real and useful answer here. */
export const NothingMoved: Story = {
  args: { report: { date: '2026-05-13', changes: [] } },
};

/**
 * One day of history and nothing to compare against. The panel renders nothing at all rather
 * than claiming a quiet night it has no way to know about.
 */
export const NoEarlierReport: Story = {
  args: { report: { date: null, changes: [] } },
};
