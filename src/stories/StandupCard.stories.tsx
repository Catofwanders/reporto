import type { Meta, StoryObj } from '@storybook/react-vite';
import { StandupCard } from '../components/StandupCard';
import { calendarReport, jiraReport, prsReport } from './fixtures';

/**
 * The "what moved" half comes from `/api/standup`, which Storybook does not serve — so the
 * story covers the pre-build state and the failure the button surfaces.
 */
const meta = {
  title: 'Panels/StandupCard',
  component: StandupCard,
  args: { jira: jiraReport, prs: prsReport, calendar: calendarReport },
} satisfies Meta<typeof StandupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeBuilding: Story = {};

/** No reports at all: the button still works, the note is just thin. */
export const NoReports: Story = { args: { jira: null, prs: null, calendar: null } };
