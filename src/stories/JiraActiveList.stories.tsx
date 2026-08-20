import type { Meta, StoryObj } from '@storybook/react-vite';
import { JiraActiveList } from '../components/JiraActiveList';
import { jiraReport } from './fixtures';

const meta = {
  title: 'Panels/JiraActiveList',
  component: JiraActiveList,
  args: { report: jiraReport },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof JiraActiveList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Only active statuses reach this card — BLOCKED tickets in the fixture stay on the Jira
 * page. PROJ-781 carries the red chip: merged, but a deploy-qc reset dropped it.
 */
export const Default: Story = {};

/** No active tickets at all. */
export const Empty: Story = { args: { report: { ...jiraReport, groups: [] } } };

/** Enough cards to show the grid wrapping to as many per row as the width allows. */
export const ManyTickets: Story = {
  args: {
    report: {
      ...jiraReport,
      groups: [
        {
          title: 'In Progress',
          tickets: Array.from({ length: 9 }, (_, i) => ({
            key: `PROJ-${900 + i}`,
            url: `https://jira.example.com/browse/PROJ-${900 + i}`,
            status: 'In Progress',
            chip: 'open' as const,
            summary:
              i % 3 === 0
                ? 'Short one'
                : 'A summary long enough to need the two-line clamp, which is what keeps every card the same height no matter how wordy the ticket is',
            prs: [],
            notes: [],
          })),
        },
      ],
    },
  },
};
