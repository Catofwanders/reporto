import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmailReportView } from '../components/EmailReportView';
import { emailReport, todos } from './fixtures';

const meta = {
  title: 'Reports/EmailReportView',
  component: EmailReportView,
  args: {
    report: emailReport,
    todos,
    onToggle: () => {},
    onDelete: () => {},
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EmailReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One row is already ticked off, which strikes it through and dims it. */
export const Default: Story = {};

export const NothingChecked: Story = { args: { todos: [] } };

export const Empty: Story = {
  args: {
    report: { ...emailReport, sections: emailReport.sections.map((s) => ({ ...s, items: [] })) },
    todos: [],
  },
};
