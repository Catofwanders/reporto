import type { Meta, StoryObj } from '@storybook/react-vite';
import { JiraReportView } from '../components/JiraReportView';
import { jiraReport } from './fixtures';

const meta = {
  title: 'Reports/JiraReportView',
  component: JiraReportView,
  args: { report: jiraReport },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof JiraReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The full report page: every status group, including the ones the home card hides. */
export const Default: Story = {};

export const NoBanner: Story = {
  args: { report: { ...jiraReport, banner: undefined } },
};

export const Empty: Story = {
  args: { report: { ...jiraReport, groups: [], banner: undefined, footer: undefined } },
};
