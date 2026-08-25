import type { Meta, StoryObj } from '@storybook/react-vite';
import { JiraBoard } from '../components/JiraBoard';
import { jiraReport } from './fixtures';

const meta = {
  title: 'Panels/JiraBoard',
  component: JiraBoard,
  args: { report: jiraReport },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof JiraBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Read-only: without onChanged the status chip is a label, not a menu. */
export const Default: Story = {};

export const Editable: Story = { args: { onChanged: () => {} } };

/** A status the workflow order does not know sits after the ones it does. */
export const UnknownStatus: Story = {
  args: {
    report: {
      ...jiraReport,
      groups: [
        { title: 'Waiting on legal', tickets: jiraReport.groups[0].tickets.slice(0, 1) },
        ...jiraReport.groups,
      ],
    },
  },
};

export const Empty: Story = { args: { report: { ...jiraReport, groups: [] } } };
